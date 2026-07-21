import { Injectable, computed, inject, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

import { AI_NUTRITION_PORT } from '@core/ai/ai-nutrition.port';
import { SecureConfigService } from '@core/config/secure-config.service';
import { LanguageService } from '@core/i18n/language.service';
import { MealRepository } from '@data/repositories/meal.repository';
import { CoachContext } from '@domain/models/ai.model';
import { addDays, toLocalDateKey } from '@shared/utils/date.util';
import { ProfileFacade } from './profile.facade';
import { WeightFacade } from './weight.facade';

const STORAGE_KEY = 'coach_advice';

/**
 * The weekly AI coach: reads the last 7 days and returns 1-2 actionable tips.
 * Advice is generated on demand (BYOK — user's key), then cached so we don't
 * re-spend tokens on every visit; a refresh regenerates it.
 */
@Injectable({ providedIn: 'root' })
export class CoachFacade {
  private ai = inject(AI_NUTRITION_PORT);
  private meals = inject(MealRepository);
  private profile = inject(ProfileFacade);
  private weight = inject(WeightFacade);
  private language = inject(LanguageService);
  private config = inject(SecureConfigService);

  private readonly _tips = signal<string[]>([]);
  private readonly _generatedAt = signal<string | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal(false);

  readonly tips = this._tips.asReadonly();
  readonly generatedAt = this._generatedAt.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  /** Whether coaching can run at all (needs an API key). */
  readonly available = computed(() => this.config.hasKey());

  /** Load the cached advice (no AI call). */
  async load(): Promise<void> {
    const { value } = await Preferences.get({ key: STORAGE_KEY });
    if (!value) return;
    try {
      const data = JSON.parse(value) as { tips: string[]; at: string };
      this._tips.set(data.tips ?? []);
      this._generatedAt.set(data.at ?? null);
    } catch {
      /* ignore corrupt cache */
    }
  }

  /** Ask the AI to analyse this week and cache the resulting tips. */
  async generate(): Promise<void> {
    if (this._loading()) return;
    this._loading.set(true);
    this._error.set(false);
    try {
      const advice = await this.ai.weeklyCoach(await this.buildContext());
      const at = new Date().toISOString();
      this._tips.set(advice.tips);
      this._generatedAt.set(at);
      await Preferences.set({
        key: STORAGE_KEY,
        value: JSON.stringify({ tips: advice.tips, at, lang: this.language.lang() }),
      });
    } catch {
      this._error.set(true);
    } finally {
      this._loading.set(false);
    }
  }

  private async buildContext(): Promise<CoachContext> {
    const today = toLocalDateKey();
    const summaries = await this.meals.getRangeSummaries(addDays(today, -6), today);
    const days = summaries.map((s) => ({
      date: s.date,
      calories: Math.round(s.calories),
      protein_g: Math.round(s.protein_g),
      carbs_g: Math.round(s.carbs_g),
      fat_g: Math.round(s.fat_g),
    }));

    await this.weight.load();
    const entries = [...this.weight.entries()].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    let weightTrendKgPerWeek: number | null = null;
    if (entries.length >= 2) {
      const first = entries[0];
      const last = entries[entries.length - 1];
      const spanDays =
        (Date.parse(last.date) - Date.parse(first.date)) / 86_400_000;
      if (spanDays > 0) {
        weightTrendKgPerWeek =
          ((last.weight_kg - first.weight_kg) / spanDays) * 7;
      }
    }

    return {
      targets: this.profile.targets(),
      days,
      weightTrendKgPerWeek,
      lang: this.language.lang(),
    };
  }
}
