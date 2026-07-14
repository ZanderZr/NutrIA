import { z } from 'zod';
import { ParsedMeal, Recommendation } from '@domain/models/ai.model';

const macroNumber = z.number().nonnegative().finite();

/** Flat min/max fields the model returns; folded into a nested range below. */
const rangeInput = z
  .object({
    calories_min: macroNumber,
    calories_max: macroNumber,
    protein_g_min: macroNumber,
    protein_g_max: macroNumber,
    carbs_g_min: macroNumber,
    carbs_g_max: macroNumber,
    fat_g_min: macroNumber,
    fat_g_max: macroNumber,
  })
  .optional();

const span = (lo: number, hi: number) => ({
  min: Math.min(lo, hi),
  max: Math.max(lo, hi),
});

const mealItemSchema = z
  .object({
    name: z.string().min(1),
    quantity_g: macroNumber,
    calories: macroNumber,
    protein_g: macroNumber,
    fat_g: macroNumber,
    carbs_g: macroNumber,
    fiber_g: macroNumber.default(0),
    confidence: z.number().min(0).max(1).default(0.7),
    range: rangeInput,
  })
  .transform(({ range, ...it }) => ({
    ...it,
    range: range
      ? {
          calories: span(range.calories_min, range.calories_max),
          protein_g: span(range.protein_g_min, range.protein_g_max),
          carbs_g: span(range.carbs_g_min, range.carbs_g_max),
          fat_g: span(range.fat_g_min, range.fat_g_max),
        }
      : undefined,
  }));

export const parsedMealSchema = z.object({
  items: z.array(mealItemSchema),
  meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  note: z.string().default(''),
  needs_quantity: z.boolean().default(false),
  pending_food: z.string().default(''),
});

const targetsSchema = z.object({
  calories: macroNumber,
  protein_g: macroNumber,
  fat_g: macroNumber,
  carbs_g: macroNumber,
});

const recommendationOptionSchema = z.object({
  suggestion: z.string().min(1),
  approx: targetsSchema,
  rationale: z.string().default(''),
});

export const recommendationSchema = z.object({
  options: z.array(recommendationOptionSchema).min(1),
});

/** Parse+validate raw model JSON. Throws ZodError on malformed data. */
export function validateParsedMeal(data: unknown): ParsedMeal {
  return parsedMealSchema.parse(data) as ParsedMeal;
}

export function validateRecommendation(data: unknown): Recommendation {
  return recommendationSchema.parse(data);
}
