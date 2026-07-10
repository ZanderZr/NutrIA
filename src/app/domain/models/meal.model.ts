export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Desayuno',
  lunch: 'Comida',
  dinner: 'Cena',
  snack: 'Snack',
};

/** A single food inside a meal. */
export interface MealItem {
  id?: number;
  meal_id?: number;
  name: string;
  quantity_g: number;
  calories: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  fiber_g: number;
  /** AI confidence 0..1; low values flag estimates the user may want to correct. */
  confidence: number;
}

/** One logged meal = one natural-language message from the user. */
export interface Meal {
  id?: number;
  /** 'YYYY-MM-DD' local date. */
  date: string;
  logged_at: string;
  meal_type: MealType;
  raw_text: string;
  total_calories: number;
  total_protein_g: number;
  total_fat_g: number;
  total_carbs_g: number;
  total_fiber_g: number;
  items: MealItem[];
}

/** Aggregated totals for a single day (computed, not stored). */
export interface DailySummary {
  date: string;
  calories: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  fiber_g: number;
  meal_count: number;
}

export function emptySummary(date: string): DailySummary {
  return {
    date,
    calories: 0,
    protein_g: 0,
    fat_g: 0,
    carbs_g: 0,
    fiber_g: 0,
    meal_count: 0,
  };
}

/** Sum a meal's items into its totals. Single source of truth for meal aggregation. */
export function computeMealTotals(items: MealItem[]): Pick<
  Meal,
  | 'total_calories'
  | 'total_protein_g'
  | 'total_fat_g'
  | 'total_carbs_g'
  | 'total_fiber_g'
> {
  return items.reduce(
    (acc, it) => ({
      total_calories: acc.total_calories + it.calories,
      total_protein_g: acc.total_protein_g + it.protein_g,
      total_fat_g: acc.total_fat_g + it.fat_g,
      total_carbs_g: acc.total_carbs_g + it.carbs_g,
      total_fiber_g: acc.total_fiber_g + it.fiber_g,
    }),
    {
      total_calories: 0,
      total_protein_g: 0,
      total_fat_g: 0,
      total_carbs_g: 0,
      total_fiber_g: 0,
    },
  );
}

/** Recommended daily fiber from the Dietary Guidelines: 14 g per 1000 kcal. */
export function recommendedFiber(calorieTarget: number): number {
  return Math.round((calorieTarget / 1000) * 14);
}

/** Best-guess meal type from the hour of day (0-23). */
export function inferMealType(hour: number): MealType {
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 22) return 'dinner';
  return 'snack';
}
