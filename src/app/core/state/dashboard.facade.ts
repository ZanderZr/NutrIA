import { Injectable, computed, inject, signal } from '@angular/core';
import { MealRepository } from '@data/repositories/meal.repository';
import {
  DailySummary,
  Meal,
  MealItem,
  emptySummary,
} from '@domain/models/meal.model';
import { NutritionTargets } from '@domain/models/user-profile.model';
import { computeStreak } from '@domain/insights/streak';
import { toLocalDateKey, addDays } from '@shared/utils/date.util';
import { ProfileFacade } from './profile.facade';

/**
 * Owns the "active day" view: the selected date, its meals, the computed
 * summary and the remaining macros vs the profile targets. The chat and
 * dashboard screens read these signals; both stay in sync automatically.
 */
@Injectable({ providedIn: 'root' })
export class DashboardFacade {
  private repo = inject(MealRepository);
  private profileFacade = inject(ProfileFacade);

  private readonly _activeDate = signal<string>(toLocalDateKey());
  private readonly _meals = signal<Meal[]>([]);
  private readonly _summary = signal<DailySummary>(
    emptySummary(toLocalDateKey()),
  );
  private readonly _streak = signal(0);
  private readonly _loaded = signal(false);

  readonly activeDate = this._activeDate.asReadonly();
  readonly meals = this._meals.asReadonly();
  readonly summary = this._summary.asReadonly();
  /** Consecutive days with at least one logged meal (up to today). */
  readonly streak = this._streak.asReadonly();
  /** False until the first refresh completes — drives loading skeletons. */
  readonly loaded = this._loaded.asReadonly();

  /** Macros still available today (never below zero for display purposes). */
  readonly remaining = computed<NutritionTargets>(() => {
    const t = this.profileFacade.targets();
    const s = this._summary();
    return {
      calories: t.calories - s.calories,
      protein_g: t.protein_g - Math.round(s.protein_g),
      fat_g: t.fat_g - Math.round(s.fat_g),
      carbs_g: t.carbs_g - Math.round(s.carbs_g),
    };
  });

  /** Progress 0..1 for the calorie ring. */
  readonly calorieProgress = computed(() => {
    const t = this.profileFacade.targets().calories;
    return t > 0 ? Math.min(1, this._summary().calories / t) : 0;
  });

  async loadDate(date: string): Promise<void> {
    this._activeDate.set(date);
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const date = this._activeDate();
    const [meals, summary, loggedDates] = await Promise.all([
      this.repo.getByDate(date),
      this.repo.getDailySummary(date),
      this.repo.getLoggedDates(),
    ]);
    this._meals.set(meals);
    this._summary.set(summary);
    this._streak.set(computeStreak(loggedDates));
    this._loaded.set(true);
  }

  async deleteMeal(mealId: number): Promise<void> {
    await this.repo.delete(mealId);
    await this.refresh();
  }

  /** Re-insert a previously deleted meal (with its items) on its own day. */
  async restoreMeal(meal: Meal): Promise<void> {
    await this.repo.add({
      date: meal.date,
      logged_at: meal.logged_at,
      meal_type: meal.meal_type,
      raw_text: meal.raw_text,
      total_calories: 0,
      total_protein_g: 0,
      total_fat_g: 0,
      total_carbs_g: 0,
      total_fiber_g: 0,
      total_sugar_g: 0,
      total_sat_fat_g: 0,
      total_sodium_mg: 0,
      items: meal.items,
    });
    await this.refresh();
  }

  /** Copy a meal's items into today as a new entry. */
  async repeatMeal(meal: Meal): Promise<void> {
    await this.repo.add({
      date: toLocalDateKey(),
      logged_at: new Date().toISOString(),
      meal_type: meal.meal_type,
      raw_text: meal.raw_text,
      total_calories: 0,
      total_protein_g: 0,
      total_fat_g: 0,
      total_carbs_g: 0,
      total_fiber_g: 0,
      total_sugar_g: 0,
      total_sat_fat_g: 0,
      total_sodium_mg: 0,
      items: meal.items,
    });
    await this.loadDate(toLocalDateKey());
  }

  async updateMealItems(mealId: number, items: MealItem[]): Promise<void> {
    await this.repo.updateItems(mealId, items);
    await this.refresh();
  }

  /** How many meals were logged on a given day. */
  async mealCountOn(date: string): Promise<number> {
    return (await this.repo.getDailySummary(date)).meal_count;
  }

  /** Copy every meal from one day into another; returns how many were copied. */
  async copyDay(from: string, to: string): Promise<number> {
    const meals = await this.repo.getByDate(from);
    for (const m of meals) {
      await this.repo.add({
        date: to,
        logged_at: new Date().toISOString(),
        meal_type: m.meal_type,
        raw_text: m.raw_text,
        total_calories: 0,
        total_protein_g: 0,
        total_fat_g: 0,
        total_carbs_g: 0,
        total_fiber_g: 0,
        total_sugar_g: 0,
        total_sat_fat_g: 0,
        total_sodium_mg: 0,
        items: m.items,
      });
    }
    await this.refresh();
    return meals.length;
  }

  /** 'YYYY-MM-DD' for the day before the active date. */
  previousDay(): string {
    return addDays(this._activeDate(), -1);
  }
}
