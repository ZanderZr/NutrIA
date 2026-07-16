import { computeWeeklyInsights } from './weekly-insights';
import { DailySummary, emptySummary } from '@domain/models/meal.model';
import { NutritionTargets } from '@domain/models/user-profile.model';

const targets: NutritionTargets = {
  calories: 2000,
  protein_g: 150,
  fat_g: 60,
  carbs_g: 200,
};

function day(date: string, over: Partial<DailySummary>): DailySummary {
  return { ...emptySummary(date), ...over };
}

describe('computeWeeklyInsights', () => {
  it('returns null when nothing is logged', () => {
    expect(computeWeeklyInsights([], targets)).toBeNull();
    expect(
      computeWeeklyInsights([day('2026-01-01', { calories: 0 })], targets),
    ).toBeNull();
  });

  it('returns null when there is no calorie target', () => {
    const noTarget = { ...targets, calories: 0 };
    expect(
      computeWeeklyInsights([day('2026-01-01', { calories: 2000 })], noTarget),
    ).toBeNull();
  });

  it('does not name a best/worst day with only one logged day', () => {
    const w = computeWeeklyInsights(
      [day('2026-01-01', { calories: 2000, protein_g: 150 })],
      targets,
    )!;
    expect(w.daysLogged).toBe(1);
    expect(w.bestDay).toBeNull();
    expect(w.worstDay).toBeNull();
    expect(w.avgAdherence).toBe(100); // spot on the target
  });

  it('picks the most and least on-target days', () => {
    const w = computeWeeklyInsights(
      [
        day('2026-01-01', { calories: 2000 }), // perfect
        day('2026-01-02', { calories: 3000 }), // 50% over
      ],
      targets,
    )!;
    expect(w.daysLogged).toBe(2);
    expect(w.bestDay).toBe('2026-01-01');
    expect(w.worstDay).toBe('2026-01-02');
  });

  it('reports the macro best covered vs its target', () => {
    const w = computeWeeklyInsights(
      [
        // protein at target, carbs/fat well under → protein dominates.
        day('2026-01-01', { calories: 2000, protein_g: 150, carbs_g: 50, fat_g: 10 }),
        day('2026-01-02', { calories: 2000, protein_g: 150, carbs_g: 50, fat_g: 10 }),
      ],
      targets,
    )!;
    expect(w.dominantMacro).toBe('protein');
  });
});
