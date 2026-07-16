import { computeStreak } from './streak';
import { addDays, toLocalDateKey } from '@shared/utils/date.util';

const today = toLocalDateKey();
const day = (n: number) => addDays(today, n);

describe('computeStreak', () => {
  it('is 0 with no logged days', () => {
    expect(computeStreak([])).toBe(0);
  });

  it('counts consecutive days back from today', () => {
    expect(computeStreak([day(0), day(-1), day(-2)])).toBe(3);
  });

  it('stays alive from yesterday when today is not logged yet', () => {
    // Nothing today, but yesterday + the day before are logged.
    expect(computeStreak([day(-1), day(-2)])).toBe(2);
  });

  it('is 0 when neither today nor yesterday is logged', () => {
    expect(computeStreak([day(-2), day(-3)])).toBe(0);
  });

  it('stops at the first gap', () => {
    // today logged, day(-1) missing → streak is just today.
    expect(computeStreak([day(0), day(-2), day(-3)])).toBe(1);
  });

  it('ignores duplicate date keys', () => {
    expect(computeStreak([day(0), day(0), day(-1)])).toBe(2);
  });
});
