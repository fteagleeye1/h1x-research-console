/**
 * Tiny in-process TTL cache for aggregated HackerOne payloads.
 *
 * The dashboard is single-user; this avoids re-hammering the HackerOne API on
 * every page render while still serving reasonably fresh data.
 */

type Entry<T> = {
  value: T;
  expiresAt: number;
};

const store = new Map<string, Entry<unknown>>();

export async function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>
): Promise<T> {
  const hit = store.get(key);

  if (hit && hit.expiresAt > Date.now()) {
    return hit.value as T;
  }

  const value = await loader();

  store.set(key, { value, expiresAt: Date.now() + ttlMs });

  return value;
}

/** Synchronously read a still-fresh cached value without triggering loads. */
export function peekCached<T>(key: string): T | undefined {
  const hit = store.get(key);

  if (hit && hit.expiresAt > Date.now()) {
    return hit.value as T;
  }

  return undefined;
}

/** Run promise-producing tasks with bounded concurrency. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index]);
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker()
  );

  await Promise.all(workers);

  return results;
}
