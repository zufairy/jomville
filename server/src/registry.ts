/**
 * Live population per room slug, in-process. Redis-backed later for multi-node.
 */
class Registry {
  private counts = new Map<string, number>();

  set(slug: string, n: number) {
    if (n <= 0) this.counts.delete(slug);
    else this.counts.set(slug, n);
  }

  get(slug: string): number {
    return this.counts.get(slug) ?? 0;
  }

  /** Populated public rooms, busiest first. */
  populated(): Array<{ slug: string; count: number }> {
    return [...this.counts.entries()].map(([slug, count]) => ({ slug, count })).sort((a, b) => b.count - a.count);
  }
}

export const registry = new Registry();

/**
 * How many of the ids in a room are real people. The park's AI locals live in
 * the same player map, so without this the public "online" count would count
 * them as visitors.
 */
export function humanCount(ids: Iterable<string>, isBot: (id: string) => boolean): number {
  let n = 0;
  for (const id of ids) if (!isBot(id)) n++;
  return n;
}
