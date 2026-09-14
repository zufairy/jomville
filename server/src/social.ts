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
    for (const s of this.users.get(userId) ?? []) s.send(type, payload);
  }
}

export const presence = new Presence();
