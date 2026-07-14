import { NutritionTargets, ProfileInput } from '../models/user-profile.model';
import { KCAL_PER_KG } from './objective.strategy';
import { calcTargetsWithTdee, calcTdee } from './nutrition-calculator';

/** A logged day's total energy (only days with meals are passed in). */
export interface DailyCalories {
  date: string;
  calories: number;
}

/** A body-weight measurement. */
export interface WeightPoint {
  date: string;
  weight_kg: number;
}

export interface AdaptiveEstimate {
  /** Maintenance calories derived from real intake vs weight change. */
  realTdee: number;
  /** Maintenance the Mifflin-St Jeor formula predicted (for comparison). */
  formulaTdee: number;
  /** Average logged daily intake over the window. */
  avgIntake: number;
  /** Measured weight-change rate (kg/week; negative = losing). */
  ratePerWeek: number;
  loggedDays: number;
  spanDays: number;
  /** Goal-adjusted targets computed from the real TDEE. */
  suggested: NutritionTargets;
}

/** Minimum data before we dare suggest anything (avoid noise-driven advice). */
const MIN_LOGGED_DAYS = 10;
const MIN_SPAN_DAYS = 10;
const MIN_WEIGHTS = 3;

/** Least-squares slope of weight over time → kg per day. */
function slopePerDay(points: WeightPoint[]): number | null {
  const t0 = Date.parse(points[0].date);
  const xs = points.map((p) => (Date.parse(p.date) - t0) / 86_400_000);
  const ys = points.map((p) => p.weight_kg);
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  return den === 0 ? null : num / den;
}

/**
 * Estimate real maintenance calories from the last `windowDays` of data:
 *   TDEE ≈ average intake − (weight change per day × 7700).
 * Returns null unless there's enough consistent data, and clamps the result to
 * a sane range so a bad week can't produce dangerous advice.
 */
export function estimateAdaptive(
  input: ProfileInput,
  dailyCalories: DailyCalories[],
  weights: WeightPoint[],
  windowDays = 21,
): AdaptiveEstimate | null {
  const today = Date.now();
  const inWindow = (d: string) =>
    (today - Date.parse(d)) / 86_400_000 <= windowDays;

  const days = dailyCalories.filter((d) => d.calories > 0 && inWindow(d.date));
  const pts = weights
    .filter((w) => inWindow(w.date))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (days.length < MIN_LOGGED_DAYS || pts.length < MIN_WEIGHTS) return null;

  const spanDays =
    (Date.parse(pts[pts.length - 1].date) - Date.parse(pts[0].date)) /
    86_400_000;
  if (spanDays < MIN_SPAN_DAYS) return null;

  const ratePerDay = slopePerDay(pts);
  if (ratePerDay === null) return null;

  const avgIntake =
    days.reduce((a, d) => a + d.calories, 0) / days.length;
  const realTdee = avgIntake - ratePerDay * KCAL_PER_KG;

  const formulaTdee = calcTdee(input);
  // Reject implausible results (measurement noise, under-logging, etc.).
  if (
    realTdee < 1000 ||
    realTdee > 6000 ||
    realTdee < formulaTdee * 0.6 ||
    realTdee > formulaTdee * 1.6
  ) {
    return null;
  }

  return {
    realTdee: Math.round(realTdee),
    formulaTdee: Math.round(formulaTdee),
    avgIntake: Math.round(avgIntake),
    ratePerWeek: ratePerDay * 7,
    loggedDays: days.length,
    spanDays: Math.round(spanDays),
    suggested: calcTargetsWithTdee(input, realTdee),
  };
}
