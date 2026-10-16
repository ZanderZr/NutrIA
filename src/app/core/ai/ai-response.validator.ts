import { z } from 'zod';
import {
  CoachAdvice,
  ParsedMeal,
  ParsedRoutine,
  Recommendation,
} from '@domain/models/ai.model';

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
  sugar_g: macroNumber.default(0),
  sat_fat_g: macroNumber.default(0),
  sodium_mg: macroNumber.default(0),
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

const coachAdviceSchema = z.object({
  tips: z.array(z.string().min(1)).min(1).max(3),
});

// Routine import. `.catch()` (not just `.default()`) on the numeric fields
// absorbs the common lite-model slip of emitting "3" or null for a number
// without burning the one corrective retry. The `.min(1)` on days/exercises is
// the opposite: a deliberate tripwire, since an empty routine is useless and
// the retry is exactly what should happen. The `.max()` caps stop a runaway
// response from inserting hundreds of rows.
const routineCount = z.number().int().nonnegative().finite();

const parsedRoutineExerciseSchema = z.object({
  name: z.string().min(1),
  muscle_group: z.string().default(''),
  unit: z.enum(['kg', 'bw', 'time', 'dist']).catch('kg').default('kg'),
  target_sets: routineCount.max(30).catch(3).default(3),
  target_reps: z.string().default(''),
  target_weight_kg: z.number().nonnegative().finite().catch(0).default(0),
  target_seconds: routineCount.max(36000).catch(0).default(0),
  target_distance_m: z.number().nonnegative().finite().catch(0).default(0),
  rest_seconds: routineCount.max(1800).catch(0).default(0),
  notes: z.string().default(''),
});

const parsedRoutineDaySchema = z.object({
  name: z.string().min(1),
  notes: z.string().default(''),
  exercises: z.array(parsedRoutineExerciseSchema).min(1).max(40),
});

export const parsedRoutineSchema = z.object({
  name: z.string().min(1).catch('Rutina'),
  days: z.array(parsedRoutineDaySchema).min(1).max(31),
  note: z.string().default(''),
});

/** Parse+validate raw model JSON. Throws ZodError on malformed data. */
export function validateParsedMeal(data: unknown): ParsedMeal {
  return parsedMealSchema.parse(data) as ParsedMeal;
}

export function validateRecommendation(data: unknown): Recommendation {
  return recommendationSchema.parse(data);
}

export function validateCoachAdvice(data: unknown): CoachAdvice {
  return coachAdviceSchema.parse(data);
}

export function validateParsedRoutine(data: unknown): ParsedRoutine {
  return parsedRoutineSchema.parse(data) as ParsedRoutine;
}
