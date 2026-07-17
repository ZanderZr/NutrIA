import {
  ACHIEVEMENTS,
  AchievementStats,
  evaluateUnlocked,
  isGoalReached,
} from './achievements';

const base: AchievementStats = {
  loggedDays: 0,
  currentStreak: 0,
  totalMeals: 0,
  goalReached: false,
};

describe('evaluateUnlocked', () => {
  it('unlocks nothing for a brand-new user', () => {
    expect(evaluateUnlocked(base)).toEqual([]);
  });

  it('unlocks the first-meal badge after one logged day', () => {
    expect(evaluateUnlocked({ ...base, loggedDays: 1 })).toContain('first_meal');
  });

  it('unlocks streak badges cumulatively as the streak grows', () => {
    expect(evaluateUnlocked({ ...base, currentStreak: 3 })).toContain('streak_3');
    const seven = evaluateUnlocked({ ...base, currentStreak: 7 });
    expect(seven).toContain('streak_3');
    expect(seven).toContain('streak_7');
    expect(seven).not.toContain('streak_30');
  });

  it('unlocks day-count and meal-count milestones at their thresholds', () => {
    expect(evaluateUnlocked({ ...base, loggedDays: 50 })).toEqual(
      jasmine.arrayContaining(['first_meal', 'days_10', 'days_50']),
    );
    expect(evaluateUnlocked({ ...base, totalMeals: 100 })).toContain('meals_100');
    expect(evaluateUnlocked({ ...base, totalMeals: 99 })).not.toContain('meals_100');
  });

  it('unlocks the goal badge only when the goal is reached', () => {
    expect(evaluateUnlocked({ ...base, goalReached: true })).toContain('goal_reached');
    expect(evaluateUnlocked(base)).not.toContain('goal_reached');
  });

  it('every catalog id is unique', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('isGoalReached', () => {
  it('is reached when at/under target for fat loss', () => {
    expect(isGoalReached('lose_fat', 75, 75)).toBe(true);
    expect(isGoalReached('lose_fat', 75, 74)).toBe(true);
    expect(isGoalReached('lose_fat', 75, 76)).toBe(false);
  });

  it('is reached when at/over target for muscle gain', () => {
    expect(isGoalReached('gain_muscle', 85, 85)).toBe(true);
    expect(isGoalReached('gain_muscle', 85, 86)).toBe(true);
    expect(isGoalReached('gain_muscle', 85, 84)).toBe(false);
  });

  it('is never reached without a target (recomp / maintenance)', () => {
    expect(isGoalReached('recomp', null, 80)).toBe(false);
    expect(isGoalReached('maintain', null, 80)).toBe(false);
  });
});
