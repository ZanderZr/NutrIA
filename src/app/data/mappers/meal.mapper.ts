import { Meal, MealItem, MealType } from '@domain/models/meal.model';

export interface MealRow {
  id: number;
  date: string;
  logged_at: string;
  meal_type: string;
  raw_text: string;
  total_calories: number;
  total_protein_g: number;
  total_fat_g: number;
  total_carbs_g: number;
  total_fiber_g: number;
}

export interface MealItemRow {
  id: number;
  meal_id: number;
  name: string;
  quantity_g: number;
  calories: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  fiber_g: number;
  confidence: number;
}

export function rowToMealItem(row: MealItemRow): MealItem {
  return {
    id: row.id,
    meal_id: row.meal_id,
    name: row.name,
    quantity_g: row.quantity_g,
    calories: row.calories,
    protein_g: row.protein_g,
    fat_g: row.fat_g,
    carbs_g: row.carbs_g,
    fiber_g: row.fiber_g,
    confidence: row.confidence,
  };
}

export function rowToMeal(row: MealRow, items: MealItem[]): Meal {
  return {
    id: row.id,
    date: row.date,
    logged_at: row.logged_at,
    meal_type: row.meal_type as MealType,
    raw_text: row.raw_text,
    total_calories: row.total_calories,
    total_protein_g: row.total_protein_g,
    total_fat_g: row.total_fat_g,
    total_carbs_g: row.total_carbs_g,
    total_fiber_g: row.total_fiber_g,
    items,
  };
}
