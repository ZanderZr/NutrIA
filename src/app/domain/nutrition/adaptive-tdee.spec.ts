import { estimateAdaptive, DailyCalories, WeightPoint } from './adaptive-tdee';
import { ProfileInput } from '../models/user-profile.model';
import { addDays, toLocalDateKey } from '@shared/utils/date.util';

const male: ProfileInput = {
  sex: 'male',
  age: 30,
  weight_kg: 80,
  height_cm: 180,
  daily_activity: 'light',
  training_days: 4,
  training_minutes: 45,
  objective: 'maintain',
  pace: 'moderate',
  target_weight_kg: null,
};

const today = toLocalDateKey();
const day = (n: number) => addDays(today, n);

/** 12 logged days at a fixed intake, all inside the window. */
function intake(kcal: number): DailyCalories[] {
  return Array.from({ length: 12 }, (_, i) => ({ date: day(-(i + 1)), calories: kcal }));
}

describe('estimateAdaptive', () => {
  it('returns null without enough logged days', () => {
    const few = intake(2400).slice(0, 5);
    const weights: WeightPoint[] = [
      { date: day(-14), weight_kg: 80 },
      { date: day(-7), weight_kg: 79.6 },
      { date: day(0), weight_kg: 79.3 },
    ];
    expect(estimateAdaptive(male, few, weights)).toBeNull();
  });

  it('returns null without enough weigh-ins', () => {
    expect(
      estimateAdaptive(male, intake(2400), [{ date: day(0), weight_kg: 80 }]),
    ).toBeNull();
  });

  it('estimates a higher-than-intake maintenance while losing weight', () => {
    // ~0.05 kg/day loss over 14 days on ~2400 kcal → TDEE ≈ 2400 + 0.05*7700.
    const weights: WeightPoint[] = [
      { date: day(-14), weight_kg: 80.0 },
      { date: day(-7), weight_kg: 79.6 },
      { date: day(0), weight_kg: 79.3 },
    ];
    const est = estimateAdaptive(male, intake(2400), weights)!;
    expect(est).not.toBeNull();
    expect(est.loggedDays).toBe(12);
    expect(est.ratePerWeek).toBeLessThan(0); // losing
    expect(est.realTdee).toBeGreaterThan(est.avgIntake); // ate below maintenance
    expect(est.realTdee).toBeCloseTo(2785, -1); // ~2785, tolerant to rounding
    expect(est.suggested.calories).toBeGreaterThan(0);
  });

  it('rejects an implausible result far from the formula', () => {
    // Huge intake with no weight change → TDEE way above formula → discarded.
    const flat: WeightPoint[] = [
      { date: day(-14), weight_kg: 80 },
      { date: day(-7), weight_kg: 80 },
      { date: day(0), weight_kg: 80 },
    ];
    expect(estimateAdaptive(male, intake(6000), flat)).toBeNull();
  });
});
