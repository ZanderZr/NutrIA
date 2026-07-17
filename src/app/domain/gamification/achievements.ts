import { Objective } from '@domain/models/user-profile.model';

/** The user metrics that unlock achievements. Pure data, no persistence. */
export interface AchievementStats {
  /** Distinct days with at least one logged meal. */
  loggedDays: number;
  /** Current consecutive-day logging streak. */
  currentStreak: number;
  /** Total meals ever logged. */
  totalMeals: number;
  /** Whether the target weight has been reached. */
  goalReached: boolean;
}

export interface Achievement {
  id: string;
  /** ionicon name shown on the badge. */
  icon: string;
  /** Unlocked when this returns true for the given stats. */
  test: (s: AchievementStats) => boolean;
}

/**
 * The achievement catalog. Ordered from easiest to hardest so the grid reads as
 * a progression. Titles/descriptions live in i18n under `ach.<id>.*`.
 */
export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_meal', icon: 'restaurant-outline', test: (s) => s.loggedDays >= 1 },
  { id: 'streak_3', icon: 'flame-outline', test: (s) => s.currentStreak >= 3 },
  { id: 'days_10', icon: 'calendar-outline', test: (s) => s.loggedDays >= 10 },
  { id: 'streak_7', icon: 'flame', test: (s) => s.currentStreak >= 7 },
  { id: 'meals_100', icon: 'nutrition-outline', test: (s) => s.totalMeals >= 100 },
  { id: 'days_50', icon: 'ribbon-outline', test: (s) => s.loggedDays >= 50 },
  { id: 'streak_30', icon: 'bonfire-outline', test: (s) => s.currentStreak >= 30 },
  { id: 'goal_reached', icon: 'trophy-outline', test: (s) => s.goalReached },
];

/** Ids of every achievement the stats currently satisfy. */
export function evaluateUnlocked(stats: AchievementStats): string[] {
  return ACHIEVEMENTS.filter((a) => a.test(stats)).map((a) => a.id);
}

/**
 * Whether the weight goal is met: at/under target for fat loss, at/over target
 * for muscle gain. Recomp/maintenance have no target, so never "reached".
 */
export function isGoalReached(
  objective: Objective,
  targetWeightKg: number | null,
  currentWeightKg: number,
): boolean {
  if (targetWeightKg == null) return false;
  if (objective === 'lose_fat') return currentWeightKg <= targetWeightKg;
  if (objective === 'gain_muscle') return currentWeightKg >= targetWeightKg;
  return false;
}
