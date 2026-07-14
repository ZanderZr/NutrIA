import { addDays, toLocalDateKey } from '@shared/utils/date.util';

/**
 * Current logging streak: consecutive days with at least one logged meal,
 * counting back from today. A streak still "alive" from yesterday counts even
 * if today has nothing yet (so it doesn't reset before the day is over).
 *
 * @param loggedDatesDesc distinct 'YYYY-MM-DD' keys, newest first
 */
export function computeStreak(loggedDatesDesc: string[]): number {
  const set = new Set(loggedDatesDesc);
  const today = toLocalDateKey();
  const yesterday = addDays(today, -1);

  // Anchor the walk on today if logged, else yesterday if logged, else 0.
  let cursor: string;
  if (set.has(today)) cursor = today;
  else if (set.has(yesterday)) cursor = yesterday;
  else return 0;

  let streak = 0;
  while (set.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}
