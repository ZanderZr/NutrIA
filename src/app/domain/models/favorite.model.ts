import { MealItem, MealType } from './meal.model';

/** A saved meal the user can re-log with one tap. */
export interface Favorite {
  id?: number;
  name: string;
  meal_type: MealType;
  total_calories: number;
  total_protein_g: number;
  total_fat_g: number;
  total_carbs_g: number;
  total_fiber_g: number;
  items: MealItem[];
}
