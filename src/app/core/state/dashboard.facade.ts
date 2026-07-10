import { Injectable, computed, inject, signal } from '@angular/core';
import { MealRepository } from '@data/repositories/meal.repository';
import {
  DailySummary,
  Meal,
  MealItem,
  emptySummary,
} from '@domain/models/meal.model';
import { NutritionTargets } from '@domain/models/user-profile.model';
import { toLocalDateKey } from '@shared/utils/date.util';
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

  readonly activeDate = this._activeDate.asReadonly();
  readonly meals = this._meals.asReadonly();
  readonly summary = this._summary.asReadonly();

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
    const [meals, summary] = await Promise.all([
      this.repo.getByDate(date),
      this.repo.getDailySummary(date),
    ]);
    this._meals.set(meals);
    this._summary.set(summary);
  }

  async deleteMeal(mealId: number): Promise<void> {
    await this.repo.delete(mealId);
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
      items: meal.items,
    });
    await this.loadDate(toLocalDateKey());
  }

  async updateMealItems(mealId: number, items: MealItem[]): Promise<void> {
    await this.repo.updateItems(mealId, items);
    await this.refresh();
  }
}
