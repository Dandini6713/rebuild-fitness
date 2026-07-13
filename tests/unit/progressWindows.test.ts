import { describe, expect, it } from '@jest/globals';

import { dayWindow } from '@/domain/nutrition/nutritionDiary';
import {
  dayInBucket,
  formatDayLabel,
  instantInBucket,
  weeklyBuckets,
  windowRange,
} from '@/domain/progress/progressWindows';

const REF = '2026-07-13'; // a Monday, the app's "today"

describe('weeklyBuckets', () => {
  it('returns the requested number of seven-day buckets, oldest first, ending on today', () => {
    const four = weeklyBuckets(REF, 4, 0);
    expect(four).toHaveLength(4);
    expect(four[0]!.index).toBe(0);
    // The last bucket ends on today and starts six days earlier.
    expect(four[3]!.endDay).toBe('2026-07-13');
    expect(four[3]!.startDay).toBe('2026-07-07');
    // The oldest bucket starts 27 days back (28-day window) and spans seven days.
    expect(four[0]!.startDay).toBe('2026-06-16');
    expect(four[0]!.endDay).toBe('2026-06-22');
  });

  it('supports the twelve-week window', () => {
    const twelve = weeklyBuckets(REF, 12, 0);
    expect(twelve).toHaveLength(12);
    expect(twelve[11]!.endDay).toBe('2026-07-13');
    // 84-day window: oldest day is 83 days before today.
    expect(twelve[0]!.startDay).toBe('2026-04-21');
  });

  it('buckets abut exactly — no gap and no overlap between consecutive weeks', () => {
    const buckets = weeklyBuckets(REF, 4, 0);
    for (let i = 1; i < buckets.length; i += 1) {
      const prevEndMs = new Date(buckets[i - 1]!.endIso).getTime();
      const startMs = new Date(buckets[i]!.startIso).getTime();
      // The next bucket starts exactly one millisecond after the previous one ends.
      expect(startMs - prevEndMs).toBe(1);
    }
  });

  it('uses the LOCAL-day boundary, matching the food diary (offset shifts the instants)', () => {
    // In BST (UTC+1, offset -60) the bucket boundaries are the UTC instants of local
    // midnight, so the boundaries differ from the raw-UTC ones.
    const bucketsBst = weeklyBuckets(REF, 4, -60);
    const bucketsUtc = weeklyBuckets(REF, 4, 0);
    expect(bucketsBst[3]!.endIso).toBe(dayWindow('2026-07-13', -60).endIso);
    expect(bucketsBst[3]!.startIso).toBe(dayWindow('2026-07-07', -60).startIso);

    // A reading at 2026-07-06T23:30Z is 2026-07-07T00:30 LOCAL in BST — the start of the
    // last bucket — but in raw UTC it is still 2026-07-06, in the PREVIOUS bucket. So the
    // same wall-clock instant buckets differently, proving the offset matters.
    const boundary = '2026-07-06T23:30:00.000Z';
    expect(instantInBucket(boundary, bucketsBst[3]!)).toBe(true);
    expect(instantInBucket(boundary, bucketsUtc[3]!)).toBe(false);
    expect(instantInBucket(boundary, bucketsUtc[2]!)).toBe(true);
  });
});

describe('windowRange', () => {
  it('spans the whole window as one range for a single fetch', () => {
    const range = windowRange(REF, 4, 0);
    expect(range.startDay).toBe('2026-06-16');
    expect(range.endDay).toBe('2026-07-13');
    expect(range.startIso).toBe(dayWindow('2026-06-16', 0).startIso);
    expect(range.endIso).toBe(dayWindow('2026-07-13', 0).endIso);
  });
});

describe('dayInBucket / instantInBucket', () => {
  it('places a scheduled date (local date) in its bucket', () => {
    const bucket = weeklyBuckets(REF, 4, 0)[3]!;
    expect(dayInBucket('2026-07-10', bucket)).toBe(true);
    expect(dayInBucket('2026-07-06', bucket)).toBe(false); // previous bucket
    expect(dayInBucket('2026-07-13', bucket)).toBe(true); // inclusive end
  });

  it('places a timestamp (UTC instant) in its bucket', () => {
    const bucket = weeklyBuckets(REF, 4, 0)[3]!;
    expect(instantInBucket('2026-07-10T12:00:00.000Z', bucket)).toBe(true);
    expect(instantInBucket('2026-06-30T12:00:00.000Z', bucket)).toBe(false);
  });
});

describe('formatDayLabel', () => {
  it('formats a short British day label', () => {
    expect(formatDayLabel('2026-06-08')).toBe('8 Jun');
    expect(formatDayLabel('2026-12-25')).toBe('25 Dec');
  });
});
