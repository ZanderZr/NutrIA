import { calcBmr, calcTdee, calcTargets } from './nutrition-calculator';
import { applyObjective, weeklyRateKg } from './objective.strategy';
import { computeGoalProgress } from './goal-progress';
import { activityFactor, ProfileInput } from '../models/user-profile.model';

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

describe('nutrition-calculator', () => {
  it('computes Mifflin-St Jeor BMR for males', () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 1780
    expect(calcBmr(male)).toBe(1780);
  });

  it('computes BMR for females', () => {
    const female: ProfileInput = { ...male, sex: 'female' };
    // 1780 - 5 - 161 = 1614 (male base was +5, female is -161)
    expect(calcBmr(female)).toBe(1780 - 5 - 161);
  });

  it('applies the combined activity factor for TDEE', () => {
    // light NEAT (1.3) + 3-4 training days (0.14) = 1.44
    expect(calcTdee(male)).toBeCloseTo(1780 * 1.44, 3);
  });

  it('maintenance keeps calories at TDEE', () => {
    expect(calcTargets(male).calories).toBe(Math.round(calcTdee(male)));
  });

  it('lose_fat moderate applies a ~0.5%/week deficit', () => {
    const t = calcTargets({ ...male, objective: 'lose_fat' });
    const expected = Math.round(calcTdee(male) + (-0.005 * 80 * 7700) / 7);
    expect(t.calories).toBe(expected); // 2759 - 440 ≈ 2319
    expect(t.protein_g).toBe(Math.round(80 * 2.3));
  });

  it('gain_muscle moderate applies a small lean surplus', () => {
    const t = calcTargets({ ...male, objective: 'gain_muscle' });
    const expected = Math.round(calcTdee(male) + (0.002 * 80 * 7700) / 7);
    expect(t.calories).toBe(expected); // 2759 + 176 ≈ 2935
    expect(t.protein_g).toBe(Math.round(80 * 2.0));
  });

  it('never lets calories fall below the BMR / 1200 floor', () => {
    const small: ProfileInput = {
      ...male,
      sex: 'female',
      weight_kg: 50,
      height_cm: 155,
      age: 25,
      daily_activity: 'desk',
      training_days: 0,
      training_minutes: 0,
      objective: 'lose_fat',
      pace: 'aggressive',
    };
    // Raw deficit would drop below BMR; floor clamps to max(bmr, 1200).
    const floor = Math.max(Math.round(calcBmr(small)), 1200);
    expect(calcTargets(small).calories).toBe(floor);
  });

  it('keeps macro calories consistent with the total', () => {
    const t = calcTargets({ ...male, objective: 'lose_fat' });
    const macroKcal = t.protein_g * 4 + t.fat_g * 9 + t.carbs_g * 4;
    expect(Math.abs(macroKcal - t.calories)).toBeLessThanOrEqual(8);
  });

  it('never produces negative carbs', () => {
    const t = calcTargets({ ...male, weight_kg: 150, objective: 'lose_fat', pace: 'aggressive' });
    expect(t.carbs_g).toBeGreaterThanOrEqual(0);
  });
});

describe('activityFactor (two-axis, volume-based)', () => {
  it('desk + no training is sedentary (1.2)', () => {
    expect(activityFactor('desk', 0, 0)).toBeCloseTo(1.2, 5);
  });

  it('combines everyday movement and real training volume', () => {
    // "trains 4×/week × 45 min AND walks 1h/day": on_feet (1.4) + 0.14
    expect(activityFactor('on_feet', 4, 45)).toBeCloseTo(1.54, 5);
  });

  it('distinguishes 2 vs 3 training days (no more buckets)', () => {
    expect(activityFactor('light', 2, 45)).not.toBeCloseTo(
      activityFactor('light', 3, 45),
      5,
    );
    // Longer sessions raise the factor too.
    expect(activityFactor('light', 3, 90)).toBeGreaterThan(
      activityFactor('light', 3, 45),
    );
  });

  it('clamps to a sane maximum', () => {
    expect(activityFactor('physical', 7, 120)).toBeLessThanOrEqual(1.95);
  });
});

describe('objective.strategy', () => {
  it('rate is zero for recomp / maintenance', () => {
    expect(weeklyRateKg('recomp', 'moderate', 80)).toBe(0);
    expect(weeklyRateKg('maintain', 'aggressive', 80)).toBe(0);
  });

  it('deficit direction is negative, surplus positive', () => {
    expect(weeklyRateKg('lose_fat', 'moderate', 80)).toBeLessThan(0);
    expect(weeklyRateKg('gain_muscle', 'moderate', 80)).toBeGreaterThan(0);
  });

  it('exposes the weekly rate on the plan', () => {
    const plan = applyObjective('lose_fat', 'gentle', 80, 2759, 1780);
    expect(plan.weeklyRateKg).toBeCloseTo(-0.0035 * 80, 5);
  });
});

describe('computeGoalProgress', () => {
  it('returns null for objectives without a target weight', () => {
    expect(
      computeGoalProgress({
        objective: 'recomp',
        pace: 'moderate',
        targetWeightKg: null,
        currentWeightKg: 80,
        startWeightKg: 80,
      }),
    ).toBeNull();
  });

  it('computes percent, remaining and an ETA toward the target', () => {
    const p = computeGoalProgress({
      objective: 'lose_fat',
      pace: 'moderate',
      targetWeightKg: 75,
      currentWeightKg: 80,
      startWeightKg: 85,
    })!;
    expect(p.remainingKg).toBe(5);
    expect(p.percent).toBe(50); // 5 of 10 kg done
    expect(p.ratePerWeekKg).toBeCloseTo(-0.4, 5);
    expect(p.etaDate).not.toBeNull();
  });

  it('clamps percent to 100 once reached', () => {
    const p = computeGoalProgress({
      objective: 'lose_fat',
      pace: 'moderate',
      targetWeightKg: 75,
      currentWeightKg: 75,
      startWeightKg: 85,
    })!;
    expect(p.percent).toBe(100);
    expect(p.remainingKg).toBe(0);
    expect(p.etaDate).toBeNull();
  });
});
