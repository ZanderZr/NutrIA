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
  /** Micronutrients (optional; only AI-estimated items carry them). */
  sugar_g?: number;
  sat_fat_g?: number;
  sodium_mg?: number;
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
  total_sugar_g: number;
  total_sat_fat_g: number;
  total_sodium_mg: number;
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
  sugar_g: number;
  sat_fat_g: number;
  sodium_mg: number;
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
    sugar_g: 0,
    sat_fat_g: 0,
    sodium_mg: 0,
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
  | 'total_sugar_g'
  | 'total_sat_fat_g'
  | 'total_sodium_mg'
> {
  return items.reduce(
    (acc, it) => ({
      total_calories: acc.total_calories + it.calories,
      total_protein_g: acc.total_protein_g + it.protein_g,
      total_fat_g: acc.total_fat_g + it.fat_g,
      total_carbs_g: acc.total_carbs_g + it.carbs_g,
      total_fiber_g: acc.total_fiber_g + it.fiber_g,
      total_sugar_g: acc.total_sugar_g + (it.sugar_g ?? 0),
      total_sat_fat_g: acc.total_sat_fat_g + (it.sat_fat_g ?? 0),
      total_sodium_mg: acc.total_sodium_mg + (it.sodium_mg ?? 0),
    }),
    {
      total_calories: 0,
      total_protein_g: 0,
      total_fat_g: 0,
      total_carbs_g: 0,
      total_fiber_g: 0,
      total_sugar_g: 0,
      total_sat_fat_g: 0,
      total_sodium_mg: 0,
    },
  );
}

/** Recommended daily fiber from the Dietary Guidelines: 14 g per 1000 kcal. */
export function recommendedFiber(calorieTarget: number): number {
  return Math.round((calorieTarget / 1000) * 14);
}

/** Rough daily reference limits for micronutrients (general health guidance). */
export const MICRO_LIMITS = {
  /** WHO free-sugar upper guidance (~10% of a 2000 kcal diet). */
  sugar_g: 50,
  /** Saturated fat ~10% of a 2000 kcal diet. */
  sat_fat_g: 22,
  /** Sodium upper reference (~2.3 g/day). */
  sodium_mg: 2300,
};

/** Best-guess meal type from the hour of day (0-23). */
export function inferMealType(hour: number): MealType {
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 22) return 'dinner';
  return 'snack';
}
