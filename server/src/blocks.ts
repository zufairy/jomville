/**
 * Who may see whom inside a room. Blocking is symmetric in effect: once either
 * side blocks, neither sees the other's chat and neither can call the other.
 *
 * Pure state so it can be tested without a live room; GameRoom keeps one of
 * these per room instance and delegates every visibility decision to it.
 */
export class BlockBook {
  /** sessionId -> user id */
  private users = new Map<string, string>();
  /** sessionId -> user ids hidden from that session, in either direction */
  private hidden = new Map<string, Set<string>>();

  /** Called on join. `pairs` are the user ids already blocked either way. */
  join(sessionId: string, userId: string, pairs: Iterable<string> = []) {
    this.users.set(sessionId, userId);
    this.hidden.set(sessionId, new Set(pairs));
  }

  leave(sessionId: string) {
    this.users.delete(sessionId);
    this.hidden.delete(sessionId);
  }

  userOf(sessionId: unknown): string | null {
    return typeof sessionId === 'string' ? (this.users.get(sessionId) ?? null) : null;
  }

  /** Replace one session's hidden set, e.g. after unblocking. */
  reload(sessionId: string, pairs: Iterable<string>) {
    if (this.users.has(sessionId)) this.hidden.set(sessionId, new Set(pairs));
  }

  /** Apply a fresh block to every session either user is currently using. */
  add(blockerId: string, blockedId: string) {
    for (const [sid, uid] of this.users) {
      if (uid === blockerId) this.hidden.get(sid)?.add(blockedId);
      if (uid === blockedId) this.hidden.get(sid)?.add(blockerId);
    }
  }

  /** Drop a block from live sessions; the database stays the source of truth. */
  remove(blockerId: string, blockedId: string) {
    for (const [sid, uid] of this.users) {
      if (uid === blockerId) this.hidden.get(sid)?.delete(blockedId);
      if (uid === blockedId) this.hidden.get(sid)?.delete(blockerId);
    }
  }

  /** True when these two sessions must not see each other. */
  isHidden(a: string, b: string): boolean {
    if (a === b) return false;
    const ua = this.users.get(a);
    const ub = this.users.get(b);
    if (!ua || !ub) return false;
    return !!this.hidden.get(a)?.has(ub) || !!this.hidden.get(b)?.has(ua);
  }

  /** Of `sessions`, those that may receive something said by `from`. */
  audience(from: string, sessions: Iterable<string>): string[] {
    const out: string[] = [];
    for (const s of sessions) if (s === from || !this.isHidden(from, s)) out.push(s);
    return out;
  }
}
