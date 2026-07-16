import {
  objectiveNeedsTargetWeight,
  legacyGoal,
  legacyActivityLevel,
} from './user-profile.model';

describe('objectiveNeedsTargetWeight', () => {
  it('is true only for weight-target objectives', () => {
    expect(objectiveNeedsTargetWeight('lose_fat')).toBe(true);
    expect(objectiveNeedsTargetWeight('gain_muscle')).toBe(true);
    expect(objectiveNeedsTargetWeight('recomp')).toBe(false);
    expect(objectiveNeedsTargetWeight('maintain')).toBe(false);
  });
});

describe('legacyGoal', () => {
  it('maps objectives to the legacy 3-value goal', () => {
    expect(legacyGoal('lose_fat')).toBe('fat_loss');
    expect(legacyGoal('gain_muscle')).toBe('muscle_gain');
    expect(legacyGoal('recomp')).toBe('maintenance');
    expect(legacyGoal('maintain')).toBe('maintenance');
  });
});

describe('legacyActivityLevel', () => {
  it('buckets the combined factor into the legacy levels', () => {
    // desk + no training → factor 1.2 → sedentary
    expect(legacyActivityLevel('desk', 0, 0)).toBe('sedentary');
    // physical + heavy training clamps high → very_active
    expect(legacyActivityLevel('physical', 7, 120)).toBe('very_active');
  });

  it('is monotonic: more activity never lowers the level', () => {
    const order = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
    const low = order.indexOf(legacyActivityLevel('desk', 0, 0));
    const high = order.indexOf(legacyActivityLevel('on_feet', 5, 60));
    expect(high).toBeGreaterThanOrEqual(low);
  });
});
