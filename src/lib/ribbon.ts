/**
 * Pure logic behind the "new exercises" ribbon (AGENTS.md §2.10).
 *
 * Deliberately imports nothing — not even TopicId — so it has no transitive
 * path to anything key-bearing. That is what makes it safe for a CLIENT
 * component to import directly, given isolation.test.ts reads direct imports
 * only (AGENTS.md §6).
 */

export type Batch<Id extends string> = {
  date: string;
  count: number;
  /** The one topic every entry in the batch shares, or null if it spans more than one. */
  topicId: Id | null;
};

/**
 * Groups entries by their maximum addedOn date. Returns null for an empty
 * registry — never happens today, but this function should not assume its
 * caller.
 */
export function latestBatch<Id extends string>(
  entries: readonly { addedOn: string; topicId: Id }[],
): Batch<Id> | null {
  if (entries.length === 0) return null;
  const date = entries.reduce((max, e) => (e.addedOn > max ? e.addedOn : max), entries[0].addedOn);
  const batch = entries.filter((e) => e.addedOn === date);
  const topicIds = new Set(batch.map((e) => e.topicId));
  const topicId = topicIds.size === 1 ? batch[0].topicId : null;
  return { date, count: batch.length, topicId };
}

/** How many days a batch stays announced before the ribbon stops showing it. */
const DEFAULT_WINDOW_DAYS = 30;

function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  // Local-time components, deliberately not `new Date(iso)`: a bare
  // YYYY-MM-DD string is parsed as UTC midnight, which shifts a day
  // backward once formatted in any timezone west of UTC.
  return new Date(year, month - 1, day);
}

/**
 * Whether a batch dated `date` is still recent enough to announce, as of
 * `now`. Takes the clock as a parameter rather than reading it — see design
 * spec §3.1 for why the caller must supply the VIEWER's clock, never one
 * read at build time.
 */
export function isFresh(date: string, now: Date, windowDays: number = DEFAULT_WINDOW_DAYS): boolean {
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysSince = (now.getTime() - parseIsoDate(date).getTime()) / msPerDay;
  return daysSince < windowDays;
}
