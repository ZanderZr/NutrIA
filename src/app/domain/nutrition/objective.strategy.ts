import { Objective, Pace } from '../models/user-profile.model';

export interface ObjectivePlan {
  /** Calorie target after applying the pace-based delta to TDEE. */
  calories: number;
  /** Grams of protein per kg of bodyweight. */
  proteinPerKg: number;
  /** Fraction of calories from fat (0..1). */
  fatPercent: number;
  /** Signed target rate of weight change (kg/week); negative = loss. */
  weeklyRateKg: number;
}

/** ~7700 kcal per kg of body mass (used to turn a rate into a daily delta). */
export const KCAL_PER_KG = 7700;

/**
 * Target rate as a fraction of bodyweight per week. Loss rates stay in the
 * "muscle-sparing" range; lean-gain rates are deliberately small to minimise
 * fat gain.
 */
const RATE_PCT: Record<'lose_fat' | 'gain_muscle', Record<Pace, number>> = {
  lose_fat: { gentle: -0.0035, moderate: -0.005, aggressive: -0.0075 },
  gain_muscle: { gentle: 0.001, moderate: 0.002, aggressive: 0.003 },
};

/** High protein preserves lean mass in a deficit / drives growth in a surplus. */
const PROTEIN_PER_KG: Record<Objective, number> = {
  lose_fat: 2.3,
  recomp: 2.2,
  gain_muscle: 2.0,
  maintain: 1.8,
};

/** Signed weekly weight-change target (kg). 0 for recomp / maintenance. */
export function weeklyRateKg(
  objective: Objective,
  pace: Pace,
  weightKg: number,
): number {
  if (objective === 'lose_fat' || objective === 'gain_muscle') {
    return RATE_PCT[objective][pace] * weightKg;
  }
  return 0;
}

/**
 * Strategy: map an objective + pace to a calorie target and macro emphasis.
 * Calories are TDEE plus the daily energy delta implied by the target rate,
 * floored so they never drop below BMR (or a hard 1200 kcal minimum) — a
 * safeguard that, together with high protein, helps preserve muscle.
 */
export function applyObjective(
  objective: Objective,
  pace: Pace,
  weightKg: number,
  tdee: number,
  bmr: number,
): ObjectivePlan {
  const rate = weeklyRateKg(objective, pace, weightKg);
  const dailyDelta = (rate * KCAL_PER_KG) / 7;
  const floor = Math.max(bmr, 1200);
  const calories = Math.max(floor, tdee + dailyDelta);

  return {
    calories,
    proteinPerKg: PROTEIN_PER_KG[objective],
    fatPercent: objective === 'maintain' ? 0.3 : 0.25,
    weeklyRateKg: rate,
  };
}
