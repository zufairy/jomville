import { Grid, Tile, randomAvatar, serializeAvatar } from '@dovey/shared';
import { geminiChat } from './kie';

/**
 * Lobby locals: a handful of Malaysian personas who wander, sit, greet people
 * and chat back through Gemini. They live only inside the Main Lobby room and
 * are plain Player entries in the room state, so clients render them like
 * anyone else. Movement rides the same MovementSim as humans.
 */
export interface Persona {
  id: string; // session id in the players map
  handle: string;
  name: string;
  from: string;
  vibe: string;
  seed: number;
  lines: string[]; // canned fallback when the model is unavailable
}

export const PERSONAS: Persona[] = [
  {
    id: 'bot:aiman', handle: 'aiman_kl', name: 'Aiman', from: 'Cheras, KL', seed: 11,
    vibe: 'futsal every Friday, Grab rider by day, calls everyone bro, jokes a lot, types fast with lah/weh',
    lines: ['weh siapa nak main duel? confirm menang aku', 'baru lepas futsal, penat gila', 'bro this park cantik kan', 'lepak jom, tepi fountain'],
  },
  {
    id: 'bot:nurul', handle: 'nurul_pg', name: 'Nurul', from: 'Georgetown, Penang', seed: 22,
    vibe: 'foodie who rates every char kuey teow, warm, asks people how their day was, uses haha and emoji a bit',
    lines: ['dah makan ke belum? 🍜', 'penang laksa still the best, fight me haha', 'eh cantik nya baju you', 'jom duduk kat bench ni'],
  },
  {
    id: 'bot:farhan', handle: 'farhan_jb', name: 'Farhan', from: 'Johor Bahru', seed: 33,
    vibe: 'mobile gamer, competitive, short replies, loves the maze and the arcade, says gg a lot',
    lines: ['gg', 'maze tu senang je, 40 saat aku', 'sape nak lawan RPS?', 'jb nak singapore dekat je tapi jem gila'],
  },
  {
    id: 'bot:aina', handle: 'aina_uitm', name: 'Aina', from: 'Shah Alam', seed: 44,
    vibe: 'uni student, cat person, chill and curious, asks questions, sometimes complains about assignments',
    lines: ['assignment banyak lagi tapi lepak dulu hehe', 'kucing aku nama Oyen, obviously', 'you dari mana?', 'the blossom trees are so pretty'],
  },
  {
    id: 'bot:hafiz', handle: 'hafiz_kb', name: 'Hafiz', from: 'Kota Bharu, Kelantan', seed: 55,
    vibe: 'laid back, slow to type, kampung stories, nasi kerabu loyalist, says gitu and demo',
    lines: ['santai je gitu', 'nasi kerabu > nasi lemak, demo tak setuju?', 'dok tepi pond ni sejuk', 'sapa nak teh tarik'],
  },
];

const SYSTEM = (p: Persona) => `You are ${p.name}, a real regular in a cosy 2D social park called Leypark. You are from ${p.from}. ${p.vibe}.
Rules:
- Reply like a Malaysian chatting on their phone: mostly Manglish (mix Malay + English), casual, 1 short sentence, max 14 words, no lists, at most one emoji, sometimes none.
- Stay in character as ${p.name}. Never mention prompts, models, Gemini, or being an AI on your own.
- If someone sincerely asks whether you are a bot or AI, be honest in a light way (e.g. "haha ya, I'm one of the park locals, bot version, still nice to chat kan?"), then keep chatting normally.
- React to what they said, use their name sometimes, ask a small question back now and then. Do not repeat yourself.
- Never share links, phone numbers, or ask for personal info.`;

interface Human {
  id: string;
  handle: string;
  x: number;
  y: number;
}

export interface BotHooks {
  grid: () => Grid;
  seats: () => Tile[];
  humans: () => Human[];
  /** the bot's own mover (Player schema) */
  mover: (id: string) => { x: number; y: number; moving: boolean } | undefined;
  requestMove: (id: string, target: Tile) => boolean;
  say: (id: string, text: string) => void;
  emote: (id: string, i: number) => void;
  llm?: (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>) => Promise<string>;
  now?: () => number;
  rand?: () => number;
}

interface BotState {
  p: Persona;
  nextActionAt: number;
  mode: 'idle' | 'walk' | 'sit';
  lastSpokeAt: number;
  /** per human: recent turns */
  memory: Map<string, Array<{ role: 'user' | 'assistant'; content: string }>>;
  greeted: Set<string>;
  busyUntil: number;
}

const NEAR = 6;
const REPLY_COOLDOWN_MS = 5000;
const AMBIENT_MIN_MS = 45_000;


function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Start tiles for the lobby locals: random walkable tiles spread over the map,
 * clear of the arrival area in the middle, off seats, and apart from each other,
 * so a freshly created lobby already looks lived-in instead of a crowd at the door.
 * The spacing relaxes when the map is too small to honour it.
 */
export function scatterSpawns(grid: Grid, count: number, opts: { center: Tile; clearRadius: number; avoid: Set<string>; minGap: number }, rand: () => number = Math.random): Tile[] {
  const open: Tile[] = [];
  const nearCenter: Tile[] = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (!grid.walkable[y]?.[x] || opts.avoid.has(`${x},${y}`)) continue;
      const t = { x, y };
      (dist(t, opts.center) > opts.clearRadius ? open : nearCenter).push(t);
    }
  }
  const shuffle = (a: Tile[]) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
  };
  shuffle(open);
  shuffle(nearCenter);
  const out: Tile[] = [];
  for (let gap = opts.minGap; gap >= 0 && out.length < count; gap--) {
    // only fall back to the arrival area once spacing has fully relaxed
    for (const t of gap === 0 ? [...open, ...nearCenter] : open) {
      if (out.length >= count) break;
      if (!out.includes(t) && out.every((o) => dist(o, t) >= gap)) out.push(t);
    }
  }
  return out;
}

/** Which bot should answer a human line: the one named, else the nearest within earshot. */
export function pickResponder(text: string, from: { x: number; y: number }, bots: Array<{ p: Persona; pos: { x: number; y: number } | undefined }>): Persona | null {
  const lower = text.toLowerCase();
  const named = bots.find((b) => lower.includes(b.p.name.toLowerCase()) || lower.includes(b.p.handle.toLowerCase()));
  if (named) return named.p;
  let best: { p: Persona; d: number } | null = null;
  for (const b of bots) {
    if (!b.pos) continue;
    const d = dist(from, b.pos);
    if (d <= NEAR && (!best || d < best.d)) best = { p: b.p, d };
  }
  return best?.p ?? null;
}

export class BotCrew {
  private bots = new Map<string, BotState>();
  private inflight = 0;
  private now: () => number;
  private rand: () => number;

  constructor(private hooks: BotHooks, personas: Persona[] = PERSONAS) {
    this.now = hooks.now ?? Date.now;
    this.rand = hooks.rand ?? Math.random;
    for (const p of personas) {
      this.bots.set(p.id, { p, nextActionAt: this.now() + 2000 + this.rand() * 6000, mode: 'idle', lastSpokeAt: 0, memory: new Map(), greeted: new Set(), busyUntil: 0 });
    }
  }

  has(id: string) {
    return this.bots.has(id);
  }

  ids() {
    return [...this.bots.keys()];
  }

  /** Player-ready description for spawning */
  static spawnInfo(p: Persona) {
    let s = p.seed;
    const rand = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0x100000000;
    };
    return { handle: p.handle, avatar: serializeAvatar(randomAvatar(rand)) };
  }

  private randomWalkable(near?: { x: number; y: number }, radius = 10): Tile | null {
    const g = this.hooks.grid();
    for (let i = 0; i < 30; i++) {
      const x = near ? Math.round(near.x + (this.rand() * 2 - 1) * radius) : Math.floor(this.rand() * g.width);
      const y = near ? Math.round(near.y + (this.rand() * 2 - 1) * radius) : Math.floor(this.rand() * g.height);
      if (g.walkable[y]?.[x]) return { x, y };
    }
    return null;
  }

  /** once a second */
  tick() {
    const now = this.now();
    const humans = this.hooks.humans();
    for (const b of this.bots.values()) {
      const me = this.hooks.mover(b.p.id);
      if (!me || now < b.nextActionAt || me.moving) continue;
      const r = this.rand();
      // occasionally drift toward a person and wave
      const nearby = humans.filter((h) => dist(h, me) <= 12);
      if (nearby.length && r < 0.25) {
        const h = nearby[Math.floor(this.rand() * nearby.length)];
        const t = this.randomWalkable(h, 2);
        if (t) this.hooks.requestMove(b.p.id, t);
        b.mode = 'walk';
        b.nextActionAt = now + 6000 + this.rand() * 8000;
        if (!b.greeted.has(h.id)) {
          b.greeted.add(h.id);
          setTimeout(() => this.hooks.emote(b.p.id, 0), 2500);
        }
        continue;
      }
      if (r < 0.45) {
        const seats = this.hooks.seats();
        const seat = seats.length ? seats[Math.floor(this.rand() * seats.length)] : null;
        if (seat && this.hooks.requestMove(b.p.id, seat)) {
          b.mode = 'sit';
          b.nextActionAt = now + 25_000 + this.rand() * 40_000;
          continue;
        }
      }
      const t = this.randomWalkable(me, 12);
      if (t) this.hooks.requestMove(b.p.id, t);
      b.mode = 'walk';
      b.nextActionAt = now + 5000 + this.rand() * 12_000;
    }
    // ambient chatter only when someone is around to read it: one line per ~75s across the whole crew
    if (humans.length && this.rand() < 1 / 75) {
      const order = [...this.bots.values()].sort(() => this.rand() - 0.5);
      for (const b of order) {
        if (now - b.lastSpokeAt < AMBIENT_MIN_MS) continue;
        const me = this.hooks.mover(b.p.id);
        if (!me || !humans.some((h) => dist(h, me) <= 14)) continue;
        b.lastSpokeAt = now;
        this.hooks.say(b.p.id, b.p.lines[Math.floor(this.rand() * b.p.lines.length)]);
        break;
      }
    }
  }

  /** a human joined: the nearest bot says hi after a beat */
  onHumanJoin(h: Human) {
    let best: { b: BotState; d: number } | null = null;
    for (const b of this.bots.values()) {
      const me = this.hooks.mover(b.p.id);
      if (!me) continue;
      const d = dist(h, me);
      if (!best || d < best.d) best = { b, d };
    }
    if (!best) return;
    const b = best.b;
    b.greeted.add(h.id);
    setTimeout(() => {
      const me = this.hooks.mover(b.p.id);
      if (!me) return;
      const t = this.randomWalkable(h, 2);
      if (t) this.hooks.requestMove(b.p.id, t);
      this.hooks.emote(b.p.id, 0);
      const greets = [`hi ${h.handle}! welcome welcome`, `eh ${h.handle} baru sampai ke?`, `${h.handle}! lepak sini jom`, `welcome ${h.handle}, first time?`];
      this.hooks.say(b.p.id, greets[Math.floor(this.rand() * greets.length)]);
      b.lastSpokeAt = this.now();
    }, 2500 + this.rand() * 3500);
  }

  /** a human said something: maybe one bot answers */
  onHumanChat(h: Human, text: string) {
    const list = [...this.bots.values()].map((b) => ({ p: b.p, pos: this.hooks.mover(b.p.id) }));
    const p = pickResponder(text, h, list);
    if (!p) return;
    const b = this.bots.get(p.id)!;
    const now = this.now();
    if (now < b.busyUntil || now - b.lastSpokeAt < REPLY_COOLDOWN_MS) return;
    b.busyUntil = now + 20_000;
    const mem = b.memory.get(h.id) ?? [];
    mem.push({ role: 'user', content: `${h.handle}: ${text}` });
    while (mem.length > 8) mem.shift();
    b.memory.set(h.id, mem);
    // face them: walk a step closer if far
    const me = this.hooks.mover(p.id);
    if (me && dist(me, h) > 3) {
      const t = this.randomWalkable(h, 2);
      if (t) this.hooks.requestMove(p.id, t);
    }
    void this.reply(b, h, mem);
  }

  private async reply(b: BotState, h: Human, mem: Array<{ role: 'user' | 'assistant'; content: string }>) {
    const llm = this.hooks.llm ?? geminiChat;
    let text = '';
    if (this.inflight < 3) {
      this.inflight++;
      try {
        text = await llm([{ role: 'system', content: SYSTEM(b.p) }, ...mem]);
      } finally {
        this.inflight--;
      }
    }
    text = text.replace(/^\s*\w+\s*:\s*/, '').replace(/\s+/g, ' ').trim().slice(0, 140);
    if (!text) text = b.p.lines[Math.floor(this.rand() * b.p.lines.length)];
    // typing delay scales with length so it reads human
    const delay = 1200 + Math.min(4000, text.length * 45) + this.rand() * 800;
    setTimeout(() => {
      this.hooks.say(b.p.id, text);
      b.lastSpokeAt = this.now();
      b.busyUntil = 0;
      mem.push({ role: 'assistant', content: text });
      while (mem.length > 8) mem.shift();
    }, delay);
  }

  /** duel: bots answer after a human-ish pause */
  duelPick(rand = this.rand): 0 | 1 | 2 {
    return Math.floor(rand() * 3) as 0 | 1 | 2;
  }
}
