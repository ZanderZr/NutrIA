import { Objective, Pace, objectiveNeedsTargetWeight } from '../models/user-profile.model';
import { addDays, toLocalDateKey } from '@shared/utils/date.util';
import { weeklyRateKg } from './objective.strategy';

export interface GoalProgress {
  /** kg still to go to reach the target (>= 0). */
  remainingKg: number;
  /** 0..100 completion between the starting weight and the target. */
  percent: number;
  /** Signed target rate (kg/week); negative = losing. */
  ratePerWeekKg: number;
  /** Estimated arrival date ('YYYY-MM-DD') or null if not computable/reached. */
  etaDate: string | null;
}

export interface GoalProgressInput {
  objective: Objective;
  pace: Pace;
  targetWeightKg: number | null;
  /** Latest recorded weight (falls back to profile weight). */
  currentWeightKg: number;
  /** First recorded weight since the goal began (falls back to current). */
  startWeightKg: number;
}

/**
 * Progress toward a target weight plus an ETA derived from the planned rate.
 * Returns null for objectives without a target weight (recomp / maintenance).
 */
export function computeGoalProgress(
  input: GoalProgressInput,
): GoalProgress | null {
  const { objective, pace, targetWeightKg, currentWeightKg, startWeightKg } =
    input;

  if (!objectiveNeedsTargetWeight(objective) || targetWeightKg == null) {
    return null;
  }

  const totalSpan = Math.abs(startWeightKg - targetWeightKg);
  const done = Math.abs(startWeightKg - currentWeightKg);
  const percent =
    totalSpan === 0 ? 100 : Math.max(0, Math.min(100, (done / totalSpan) * 100));

  const remainingKg = Math.max(0, Math.abs(currentWeightKg - targetWeightKg));
  const ratePerWeekKg = weeklyRateKg(objective, pace, currentWeightKg);

  let etaDate: string | null = null;
  if (remainingKg > 0 && ratePerWeekKg !== 0) {
    const weeks = Math.ceil(remainingKg / Math.abs(ratePerWeekKg));
    etaDate = addDays(toLocalDateKey(), weeks * 7);
  }

  return { remainingKg, percent, ratePerWeekKg, etaDate };
}
