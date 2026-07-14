import { z } from 'zod';
import { ParsedMeal, Recommendation } from '@domain/models/ai.model';

const macroNumber = z.number().nonnegative().finite();

// The plausible range shown in the UI is derived locally (central ± margin from
// confidence), not requested from the model — keeping its JSON output small and
// reliable, especially on lighter models.
const mealItemSchema = z.object({
  name: z.string().min(1),
  quantity_g: macroNumber,
  calories: macroNumber,
  protein_g: macroNumber,
  fat_g: macroNumber,
  carbs_g: macroNumber,
  fiber_g: macroNumber.default(0),
  confidence: z.number().min(0).max(1).default(0.7),
});

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
