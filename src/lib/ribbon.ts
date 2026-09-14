/**
 * Pure logic behind the "new exercises" ribbon (AGENTS.md §2.10).
 *
 * Deliberately imports nothing — not even TopicId — so it has no transitive
 * path to anything key-bearing. That is what makes it safe for a CLIENT
 * component to import directly, given isolation.test.ts reads direct imports
 * only (AGENTS.md §6).
 */

export type TopicCount<Id extends string> = { topicId: Id; count: number };

export type Batch<Id extends string> = {
  date: string;
  count: number;
  /**
   * One entry per topic touched on that date, sorted by count descending and
   * ties broken by topicId. Ordering by id rather than by any canonical topic
   * order is deliberate: a canonical order would mean importing the topic
   * list, and this module imports nothing (see the docblock above).
   */
  byTopic: TopicCount<Id>[];
};

/**
 * Every release date in the catalogue, NEWEST FIRST, with a per-topic
 * breakdown of each. Feeds both the ribbon (which takes the first entry) and
 * the /updates page (which lists them all).
 */
export function allBatches<Id extends string>(
  entries: readonly { addedOn: string; topicId: Id }[],
): Batch<Id>[] {
  const byDate = new Map<string, Map<Id, number>>();
  for (const entry of entries) {
    let topics = byDate.get(entry.addedOn);
    if (topics === undefined) {
      topics = new Map<Id, number>();
      byDate.set(entry.addedOn, topics);
    }
    topics.set(entry.topicId, (topics.get(entry.topicId) ?? 0) + 1);
  }

  return [...byDate.entries()]
    // Descending: ISO dates compare lexicographically in date order.
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, topics]) => {
      const byTopic = [...topics.entries()]
        .map(([topicId, count]) => ({ topicId, count }))
        .sort((a, b) => b.count - a.count || (a.topicId < b.topicId ? -1 : a.topicId > b.topicId ? 1 : 0));
      return { date, count: byTopic.reduce((n, t) => n + t.count, 0), byTopic };
    });
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
