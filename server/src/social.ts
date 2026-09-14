import { RateLimiter } from '@dovey/shared';

/**
 * Who is online and in which room, across every room in this process, so
 * friend requests and invites reach people wherever they are. In-process
 * like the room registry; needs a shared presence store if the server is
 * ever scaled out to several processes.
 */
export interface RoomRef {
  slug: string;
  name: string;
}

type Send = (type: string, payload: unknown) => void;

interface Session {
  sessionId: string;
  room: RoomRef;
  send: Send;
  seq: number;
}

export class Presence {
  private users = new Map<string, Session[]>();
  private seq = 0;

  join(userId: string, sessionId: string, room: RoomRef, send: Send) {
    const list = (this.users.get(userId) ?? []).filter((s) => s.sessionId !== sessionId);
    list.push({ sessionId, room, send, seq: ++this.seq });
    this.users.set(userId, list);
  }

  leave(userId: string, sessionId: string) {
    const list = (this.users.get(userId) ?? []).filter((s) => s.sessionId !== sessionId);
    if (list.length) this.users.set(userId, list);
    else this.users.delete(userId);
  }

  isOnline(userId: string): boolean {
    return this.users.has(userId);
  }

  /** the room of their most recently joined session */
  where(userId: string): RoomRef | null {
    const list = this.users.get(userId);
    if (!list?.length) return null;
    return list.reduce((a, b) => (b.seq > a.seq ? b : a)).room;
  }

  notify(userId: string, type: string, payload: unknown) {
    for (const s of this.users.get(userId) ?? []) {
      try {
        s.send(type, payload);
      } catch (e) {
        console.warn('[presence] send failed', userId, type, e);
      }
    }
  }

  /** This user's sessions, most recently joined last. */
  sessions(userId: string): ReadonlyArray<{ sessionId: string; room: RoomRef }> {
    return (this.users.get(userId) ?? []).map((s) => ({ sessionId: s.sessionId, room: s.room }));
  }

  /** Send to one specific session. Returns whether that session exists. */
  notifySession(userId: string, sessionId: string, type: string, payload: unknown): boolean {
    const s = (this.users.get(userId) ?? []).find((x) => x.sessionId === sessionId);
    if (!s) return false;
    try {
      s.send(type, payload);
    } catch (e) {
      console.warn('[presence] send failed', userId, type, e);
    }
    return true;
  }

  /**
   * A room was renamed: update every session standing in it, and report who
   * needs to hear about it (so callers can re-announce their presence).
   */
  renameRoom(slug: string, name: string): string[] {
    const affected: string[] = [];
    for (const [userId, list] of this.users) {
      let touched = false;
      for (const s of list) {
        if (s.room.slug === slug) {
          s.room = { slug, name };
          touched = true;
        }
      }
      if (touched) affected.push(userId);
    }
    return affected;
  }
}

export const presence = new Presence();

/** One friend-room invite per (inviter, invitee) pair per window, process-wide. */
export const inviteLimit = new RateLimiter(1, 30_000);
