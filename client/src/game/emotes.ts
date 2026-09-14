import { Container, Text, TextStyle } from 'pixi.js';
import { EMOTES } from '@dovey/shared';

const STYLE = new TextStyle({ fontSize: 28 });
const LIFE = 900;

interface Live {
  t: Text;
  age: number;
  id: string;
}

/** Pooled emoji pops above avatars. Spammable by design. */
export class EmotePool {
  private free: Text[] = [];
  private live: Live[] = [];

  constructor(private layer: Container, size = 32) {
    for (let i = 0; i < size; i++) {
      const t = new Text({ text: '', style: STYLE });
      t.anchor.set(0.5, 1);
      t.visible = false;
      t.resolution = 2;
      layer.addChild(t);
      this.free.push(t);
    }
  }

  pop(id: string, i: number) {
    const t = this.free.pop() ?? this.recycleOldest();
    t.text = EMOTES[i] ?? EMOTES[0];
    t.visible = true;
    t.alpha = 1;
    t.scale.set(0.5);
    this.live.push({ t, age: 0, id });
  }

  private recycleOldest(): Text {
    const oldest = this.live.reduce((a, x) => (x.age > a.age ? x : a));
    this.live.splice(this.live.indexOf(oldest), 1);
    return oldest.t;
  }

  /** @param at resolves an avatar's world position by id; returns null if gone */
  tick(dtMs: number, at: (id: string) => { x: number; y: number } | null) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const e = this.live[i];
      e.age += dtMs;
      const p = at(e.id);
      const k = e.age / LIFE;
      if (!p || k >= 1) {
        e.t.visible = false;
        this.free.push(e.t);
        this.live.splice(i, 1);
        continue;
      }
      const pop = k < 0.2 ? 0.5 + 0.7 * (k / 0.2) : k < 0.35 ? 1.2 - 0.2 * ((k - 0.2) / 0.15) : 1;
      e.t.scale.set(pop);
      e.t.position.set(p.x, p.y - 84 - k * 40);
      e.t.alpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
    }
  }
}
