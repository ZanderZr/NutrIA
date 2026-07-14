import { DailySummary } from '@domain/models/meal.model';
import { NutritionTargets } from '@domain/models/user-profile.model';

export type MacroKey = 'protein' | 'carbs' | 'fat';

export interface WeeklyInsights {
  daysLogged: number;
  /** Mean calorie adherence over logged days (0..100). */
  avgAdherence: number;
  /** Date keys of the best/worst adherence days (null when <2 logged days). */
  bestDay: string | null;
  worstDay: string | null;
  /** Macro best covered relative to its target, on average. */
  dominantMacro: MacroKey;
}

/** 0..100 adherence of a day's calories to the target (100 = spot on). */
function adherence(calories: number, target: number): number {
  if (target <= 0) return 0;
  return Math.max(0, 100 - (Math.abs(calories - target) / target) * 100);
}

/**
 * Summarise the week from per-day totals: days logged, mean adherence,
 * best/worst day and the macro best covered vs its target. Returns null when
 * there's nothing logged or no calorie target yet.
 */
export function computeWeeklyInsights(
  summaries: DailySummary[],
  targets: NutritionTargets,
): WeeklyInsights | null {
  const logged = summaries.filter((s) => s.calories > 0);
  if (!logged.length || targets.calories <= 0) return null;

  let best = logged[0];
  let worst = logged[0];
  let sum = 0;
  for (const s of logged) {
    const a = adherence(s.calories, targets.calories);
    sum += a;
    if (a > adherence(best.calories, targets.calories)) best = s;
    if (a < adherence(worst.calories, targets.calories)) worst = s;
  }

  const mean = (pick: (s: DailySummary) => number) =>
    logged.reduce((x, s) => x + pick(s), 0) / logged.length;
  const ratio: Record<MacroKey, number> = {
    protein: targets.protein_g > 0 ? mean((s) => s.protein_g) / targets.protein_g : 0,
    carbs: targets.carbs_g > 0 ? mean((s) => s.carbs_g) / targets.carbs_g : 0,
    fat: targets.fat_g > 0 ? mean((s) => s.fat_g) / targets.fat_g : 0,
  };
  const dominantMacro = (Object.keys(ratio) as MacroKey[]).reduce((a, b) =>
    ratio[b] > ratio[a] ? b : a,
  );

  return {
    daysLogged: logged.length,
    avgAdherence: Math.round(sum / logged.length),
    bestDay: logged.length > 1 ? best.date : null,
    worstDay: logged.length > 1 ? worst.date : null,
    dominantMacro,
  };
}
