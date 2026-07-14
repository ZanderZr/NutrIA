import {
  activityFactor,
  ProfileInput,
  NutritionTargets,
} from '../models/user-profile.model';
import { applyObjective } from './objective.strategy';

/**
 * Basal Metabolic Rate — Mifflin-St Jeor equation.
 * Male:   10*kg + 6.25*cm - 5*age + 5
 * Female: 10*kg + 6.25*cm - 5*age - 161
 */
export function calcBmr(input: ProfileInput): number {
  const base =
    10 * input.weight_kg + 6.25 * input.height_cm - 5 * input.age;
  return input.sex === 'male' ? base + 5 : base - 161;
}

/** Total Daily Energy Expenditure = BMR × combined activity factor. */
export function calcTdee(input: ProfileInput): number {
  return (
    calcBmr(input) *
    activityFactor(
      input.daily_activity,
      input.training_days,
      input.training_minutes,
    )
  );
}

/**
 * Full target computation: TDEE → goal-adjusted calories → macro split.
 * Protein is anchored to body weight (g/kg), fat to a % of calories,
 * carbohydrates take the remainder. 1g protein/carb = 4 kcal, 1g fat = 9 kcal.
 */
export function calcTargets(input: ProfileInput): NutritionTargets {
  return calcTargetsWithTdee(input, calcTdee(input));
}

/**
 * Same target computation as {@link calcTargets} but with an explicit TDEE, so
 * a data-derived (adaptive) maintenance estimate can drive the goal instead of
 * the Mifflin-St Jeor formula. Objective/pace macro logic is unchanged.
 */
export function calcTargetsWithTdee(
  input: ProfileInput,
  tdee: number,
): NutritionTargets {
  const bmr = calcBmr(input);
  const { calories, proteinPerKg, fatPercent } = applyObjective(
    input.objective,
    input.pace,
    input.weight_kg,
    tdee,
    bmr,
  );

  // For fat loss with a lower goal weight, anchor protein to the TARGET weight,
  // not the current one: you don't need to feed protein to the fat you're
  // shedding. This keeps intake high enough to preserve muscle without
  // over-inflating the number (e.g. 97 kg → goal 85 kg at 2.3 g/kg ≈ 196 g, not
  // 223 g). Other goals keep using current weight.
  const proteinRefKg =
    input.objective === 'lose_fat' &&
    input.target_weight_kg != null &&
    input.target_weight_kg < input.weight_kg
      ? input.target_weight_kg
      : input.weight_kg;
  const protein_g = Math.round(proteinRefKg * proteinPerKg);
  const fat_g = Math.round((calories * fatPercent) / 9);
  const remainingKcal = calories - protein_g * 4 - fat_g * 9;
  const carbs_g = Math.max(0, Math.round(remainingKcal / 4));

  return {
    calories: Math.round(calories),
    protein_g,
    fat_g,
    carbs_g,
  };
}
