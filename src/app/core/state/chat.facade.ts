import { Injectable, inject, signal } from '@angular/core';
import { AI_NUTRITION_PORT, AiError, MealImage } from '@core/ai/ai-nutrition.port';
import { MealRepository } from '@data/repositories/meal.repository';
import {
  AiContext,
  MacroRange,
  Recommendation,
} from '@domain/models/ai.model';
import { Favorite } from '@domain/models/favorite.model';
import {
  Meal,
  MealItem,
  MealType,
  inferMealType,
  recommendedFiber,
} from '@domain/models/meal.model';
import { NutritionTargets } from '@domain/models/user-profile.model';
import { toLocalDateKey, toLocalTime } from '@shared/utils/date.util';
import { TranslocoService } from '@jsverse/transloco';
import { LanguageService } from '@core/i18n/language.service';
import { HapticsService } from '@core/haptics/haptics.service';
import { DietService } from '@core/diet/diet.service';
import { AchievementsFacade } from './achievements.facade';
import { DashboardFacade } from './dashboard.facade';
import { ProfileFacade } from './profile.facade';

/** Snapshot of the day's totals vs targets at the moment a meal was logged. */
export interface DayProgress {
  targets: NutritionTargets;
  consumed: NutritionTargets;
  /** Fiber is tracked with a derived target (14 g / 1000 kcal), not stored in the profile. */
  fiber: { target: number; consumed: number };
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** Present when the assistant message carries a logged meal. */
  meal?: Meal;
  /** Plausible min/max span for the meal's macros (display only; totals use central values). */
  range?: MacroRange;
  /** Present with a logged meal: drives the "what's left today" table. */
  progress?: DayProgress;
  recommendation?: Recommendation;
  error?: boolean;
}

/**
 * Orchestrates the chat flow: user text → AI parse → validate → persist →
 * refresh the dashboard. The chat log itself is UI state (not sent back to the
 * model), keeping every AI call stateless and cheap.
 */
@Injectable({ providedIn: 'root' })
export class ChatFacade {
  private ai = inject(AI_NUTRITION_PORT);
  private meals = inject(MealRepository);
  private dashboard = inject(DashboardFacade);
  private profile = inject(ProfileFacade);
  private language = inject(LanguageService);
  private tr = inject(TranslocoService);
  private haptics = inject(HapticsService);
  private diet = inject(DietService);
  private achievements = inject(AchievementsFacade);

  private readonly _messages = signal<ChatMessage[]>([]);
  private readonly _busy = signal(false);
  private readonly _recent = signal<MealItem[]>([]);
  readonly messages = this._messages.asReadonly();
  readonly busy = this._busy.asReadonly();
  /** Recently logged foods, for one-tap re-logging. */
  readonly recent = this._recent.asReadonly();

  /** Refresh the recent-foods list (call when the chat screen opens). */
  async loadRecent(): Promise<void> {
    this._recent.set(await this.meals.getRecentItems());
  }

  /** Re-log a recent food with one tap (inferring the meal type from the hour). */
  async logRecent(item: MealItem): Promise<void> {
    await this.logManualMeal({ ...item }, inferMealType(new Date().getHours()));
  }

  /**
   * Rescale a logged meal (from its chat card) to a new total weight, adjusting
   * every macro proportionally, persisting, and refreshing that card in place.
   */
  async changeMealWeight(messageId: string, newTotalG: number): Promise<void> {
    const msg = this._messages().find((m) => m.id === messageId);
    const meal = msg?.meal;
    if (!meal?.id || newTotalG <= 0) return;

    const oldTotal = meal.items.reduce((a, it) => a + (it.quantity_g || 0), 0);
    if (oldTotal <= 0) return;
    const r = newTotalG / oldTotal;
    const round1 = (v: number) => Math.round(v * r * 10) / 10;
    const scaled: MealItem[] = meal.items.map((it) => ({
      ...it,
      quantity_g: Math.round(it.quantity_g * r),
      calories: Math.round(it.calories * r),
      protein_g: round1(it.protein_g),
      fat_g: round1(it.fat_g),
      carbs_g: round1(it.carbs_g),
      fiber_g: round1(it.fiber_g),
    }));

    await this.dashboard.updateMealItems(meal.id, scaled);
    const updated = this.dashboard.meals().find((m) => m.id === meal.id);
    this._messages.update((list) =>
      list.map((m) =>
        m.id === messageId
          ? {
              ...m,
              meal: updated ?? m.meal,
              range: m.range ? this.deriveRange(scaled) : undefined,
              progress: this.currentProgress(),
            }
          : m,
      ),
    );
  }

  /**
   * Re-sync a chat card after its meal was edited elsewhere (e.g. the "correct"
   * modal). Re-reads the meal by its own day so backfilled meals resolve too.
   */
  async refreshChatMeal(messageId: string): Promise<void> {
    const msg = this._messages().find((m) => m.id === messageId);
    const meal = msg?.meal;
    if (!meal?.id) return;
    const updated = (await this.meals.getByDate(meal.date)).find(
      (m) => m.id === meal.id,
    );
    if (!updated) return;
    this._messages.update((list) =>
      list.map((m) =>
        m.id === messageId
          ? {
              ...m,
              meal: updated,
              range: m.range ? this.deriveRange(updated.items) : undefined,
              progress: this.currentProgress(),
            }
          : m,
      ),
    );
  }

  /** Delete a logged meal from its chat card. */
  async deleteMealFromChat(messageId: string): Promise<void> {
    const msg = this._messages().find((m) => m.id === messageId);
    if (!msg?.meal?.id) return;
    await this.dashboard.deleteMeal(msg.meal.id);
    this._messages.update((list) =>
      list.map((m) =>
        m.id === messageId
          ? { id: m.id, role: 'assistant', text: 'Registro eliminado.' }
          : m,
      ),
    );
  }

  /** Current total weight (g) of a logged meal, for the "change weight" prompt. */
  mealTotalGrams(meal: Meal): number {
    return Math.round(meal.items.reduce((a, it) => a + (it.quantity_g || 0), 0));
  }

  /** Basic food awaiting a quantity (set when the AI asks "¿cuántos gramos?"). */
  private pendingFood: string | null = null;

  async logMeal(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || this._busy()) return;

    this.push({ role: 'user', text: trimmed });
    this._busy.set(true);
    try {
      // If we're waiting for a quantity and the user replied with just a number,
      // stitch it back onto the pending food so the stateless AI has full context.
      const bareQty = this.pendingFood ? this.asQuantity(trimmed) : null;
      const toParse = bareQty ? `${bareQty} de ${this.pendingFood}` : trimmed;
      if (!bareQty) this.pendingFood = null;

      const parsed = await this.ai.parseMeal(toParse, this.buildContext());

      // Basic ingredient with no amount → ask for grams instead of guessing.
      // But never re-ask right after the user supplied a quantity (bareQty),
      // even if the model still flags it — that would loop.
      if (parsed.needs_quantity && !parsed.items.length && !bareQty) {
        this.pendingFood = (parsed.pending_food || trimmed).trim();
        this.push({
          role: 'assistant',
          text:
            parsed.note ||
            `¿Cuántos gramos de ${this.pendingFood}? Dímelo y lo registro.`,
        });
        return;
      }

      if (!parsed.items.length) {
        this.pendingFood = null;
        this.push({
          role: 'assistant',
          text: parsed.note || this.tr.translate('chatMsg.noFood'),
        });
        return;
      }

      this.pendingFood = null;
      await this.persistMeal(
        parsed.items,
        parsed.meal_type,
        toParse,
        parsed.note || 'Comida registrada.',
        true,
      );
    } catch (err) {
      void this.haptics.warning();
      this.push({ role: 'assistant', text: this.errorText(err), error: true });
    } finally {
      this._busy.set(false);
    }
  }

  /**
   * Normalise a bare-quantity reply ("150", "150g", "150 gramos") to "150 g".
   * Returns null when the text isn't just a quantity (i.e. it's a new food).
   */
  private asQuantity(text: string): string | null {
    const m = text.match(/^\s*(\d+(?:[.,]\d+)?)\s*(g|gr|gramos|ml|kg)?\s*$/i);
    if (!m) return null;
    const amount = m[1].replace(',', '.');
    const unit = (m[2] || 'g').toLowerCase().replace('gramos', 'g').replace('gr', 'g');
    return `${amount} ${unit}`;
  }

  /** Log a meal from a photo: the AI identifies the foods and estimates macros. */
  async logMealPhoto(image: MealImage): Promise<void> {
    if (this._busy()) return;
    this.pendingFood = null;
    this.push({ role: 'user', text: '📷 Foto de comida' });
    this._busy.set(true);
    try {
      const parsed = await this.ai.parseMealImage(image, this.buildContext());
      if (!parsed.items.length) {
        this.push({
          role: 'assistant',
          text: parsed.note || 'No he reconocido comida en la foto.',
        });
        return;
      }
      await this.persistMeal(
        parsed.items,
        parsed.meal_type,
        'Foto de comida',
        parsed.note || 'Comida registrada desde la foto.',
        true,
      );
    } catch (err) {
      this.push({ role: 'assistant', text: this.errorText(err), error: true });
    } finally {
      this._busy.set(false);
    }
  }

  /** Re-log a saved favorite with one tap (no AI call). */
  async logFavorite(fav: Favorite): Promise<void> {
    if (this._busy()) return;
    this.push({ role: 'user', text: `Registrar: ${fav.name}` });
    this._busy.set(true);
    try {
      await this.persistMeal(
        fav.items,
        fav.meal_type,
        fav.name,
        `Añadido «${fav.name}».`,
      );
    } catch (err) {
      this.push({ role: 'assistant', text: this.errorText(err), error: true });
    } finally {
      this._busy.set(false);
    }
  }

  /**
   * Ask the AI to estimate macros for a single food from its name + quantity.
   * Reuses parseMeal (sends e.g. "150 g de pollo"), returning one combined item.
   * Throws AiError on failure so the caller can show a specific message.
   */
  async estimateMacros(
    name: string,
    quantityG: number,
  ): Promise<MealItem | null> {
    const text = quantityG > 0 ? `${quantityG} g de ${name}` : name;
    const parsed = await this.ai.parseMeal(text, this.buildContext());
    if (!parsed.items.length) return null;

    const totals = parsed.items.reduce(
      (acc, it) => ({
        calories: acc.calories + it.calories,
        protein_g: acc.protein_g + it.protein_g,
        fat_g: acc.fat_g + it.fat_g,
        carbs_g: acc.carbs_g + it.carbs_g,
        fiber_g: acc.fiber_g + it.fiber_g,
        confidence: Math.min(acc.confidence, it.confidence),
      }),
      { calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0, fiber_g: 0, confidence: 1 },
    );

    return {
      name,
      quantity_g: quantityG || parsed.items.reduce((a, it) => a + it.quantity_g, 0),
      ...totals,
    };
  }

  /**
   * Log a manually-entered food/dish and announce it in the chat. An optional
   * `date` ('YYYY-MM-DD') backfills a past day; defaults to today.
   */
  async logManualMeal(
    item: MealItem,
    mealType: MealType,
    date: string = toLocalDateKey(),
  ): Promise<void> {
    if (this._busy()) return;
    this.push({
      role: 'user',
      text: `Añadir: ${item.name} (${item.quantity_g} g)`,
    });
    this._busy.set(true);
    try {
      await this.persistMeal(
        [item],
        mealType,
        item.name,
        `Añadido «${item.name}».`,
        false,
        date,
      );
    } catch (err) {
      this.push({ role: 'assistant', text: this.errorText(err), error: true });
    } finally {
      this._busy.set(false);
    }
  }

  /** Public error mapper so modals can surface consistent AI messages. */
  describeError(err: unknown): string {
    return this.errorText(err);
  }

  /**
   * Insert a meal from ready-made items and announce it in the chat.
   * `showRange` adds a derived plausible range (AI estimates only, not manual
   * entries / favorites which are exact numbers).
   */
  private async persistMeal(
    items: MealItem[],
    mealType: Meal['meal_type'],
    rawText: string,
    note: string,
    showRange = false,
    date: string = toLocalDateKey(),
  ): Promise<void> {
    const mealId = await this.meals.add({
      date,
      logged_at: new Date().toISOString(),
      meal_type: mealType,
      raw_text: rawText,
      total_calories: 0,
      total_protein_g: 0,
      total_fat_g: 0,
      total_carbs_g: 0,
      total_fiber_g: 0,
      items,
    });

    await this.dashboard.refresh();
    // Look up by the meal's own date, so backfilled meals (not on the active
    // day) still resolve for the chat card.
    const meal = (await this.meals.getByDate(date)).find((m) => m.id === mealId);
    void this.haptics.success();
    void this.achievements.check();

    this.push({
      role: 'assistant',
      text: note,
      meal,
      range: showRange ? this.deriveRange(items) : undefined,
      progress: this.currentProgress(),
    });
  }

  /**
   * Plausible min/max for the meal's macros, derived from the totals and the
   * items' confidence (higher confidence → tighter band). Display-only; totals
   * always use the central values.
   */
  private deriveRange(items: MealItem[]): MacroRange {
    const conf = items.length
      ? Math.min(...items.map((it) => it.confidence ?? 0.7))
      : 0.7;
    const margin = 0.08 + (1 - conf) * 0.22; // ~8% (sure) … ~30% (unsure)
    const sum = (pick: (it: MealItem) => number) =>
      items.reduce((a, it) => a + pick(it), 0);
    const span = (v: number) => ({
      min: Math.round(v * (1 - margin)),
      max: Math.round(v * (1 + margin)),
    });
    return {
      calories: span(sum((it) => it.calories)),
      protein_g: span(sum((it) => it.protein_g)),
      carbs_g: span(sum((it) => it.carbs_g)),
      fat_g: span(sum((it) => it.fat_g)),
    };
  }

  async askRecommendation(): Promise<void> {
    if (this._busy()) return;
    this.push({ role: 'user', text: this.tr.translate('chatMsg.whatToEat') });
    this._busy.set(true);
    try {
      const rec = await this.ai.recommendNextMeal(this.buildContext());
      this.push({
        role: 'assistant',
        text: this.tr.translate('chatMsg.recOptions'),
        recommendation: rec,
      });
    } catch (err) {
      this.push({ role: 'assistant', text: this.errorText(err), error: true });
    } finally {
      this._busy.set(false);
    }
  }

  clear(): void {
    this._messages.set([]);
  }

  private buildContext(): AiContext {
    return {
      targets: this.profile.targets(),
      consumedToday: this.consumedToday(),
      localTime: toLocalTime(),
      lang: this.language.lang(),
      diet: this.diet.diet(),
    };
  }

  private currentProgress(): DayProgress {
    const targets = this.profile.targets();
    return {
      targets,
      consumed: this.consumedToday(),
      fiber: {
        target: recommendedFiber(targets.calories),
        consumed: this.dashboard.summary().fiber_g,
      },
    };
  }

  private consumedToday(): NutritionTargets {
    const s = this.dashboard.summary();
    return {
      calories: s.calories,
      protein_g: s.protein_g,
      fat_g: s.fat_g,
      carbs_g: s.carbs_g,
    };
  }

  private push(msg: Omit<ChatMessage, 'id'>): void {
    this._messages.update((list) => [
      ...list,
      { ...msg, id: crypto.randomUUID() },
    ]);
  }

  private errorText(err: unknown): string {
    if (err instanceof AiError) {
      switch (err.kind) {
        case 'no-key':
          return this.tr.translate('aiError.noKey');
        case 'auth':
          return this.tr.translate('aiError.auth');
        case 'rate-limit':
          return this.tr.translate('aiError.rateLimit');
        case 'network':
          return this.tr.translate('aiError.network');
        default:
          return this.tr.translate('aiError.parseFail');
      }
    }
    return this.tr.translate('aiError.unexpected');
  }
}
