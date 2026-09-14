import { emptyPot } from './items';
import { Ingredient, LevelDef, ParsedLevel, Station, StationKind } from './types';

export const DINER: LevelDef = {
  id: 'diner',
  name: 'Dovey Diner',
  rows: [
    '#TLOMCCWWCPRX#',
    'B............S',
    'C.1........2.C',
    'C...CCCCCC...C',
    'B............S',
    'C...CCCCCC...C',
    'C.3........4.C',
    'C............C',
    '##CCCCCCCCCC##',
  ],
  menu: ['soup_tomato', 'soup_onion', 'soup_mushroom', 'salad', 'salad_tomato'],
  stars: [60, 160, 280],
  plates: 4,
};

export const LEVELS: Record<string, LevelDef> = { diner: DINER };

export function levelDef(id: string): LevelDef | undefined {
  return Object.prototype.hasOwnProperty.call(LEVELS, id) ? LEVELS[id] : undefined;
}

const STATION_CHARS: Record<string, StationKind> = {
  C: 'counter',
  T: 'crate',
  L: 'crate',
  O: 'crate',
  M: 'crate',
  B: 'board',
  S: 'stove',
  P: 'plates',
  W: 'window',
  X: 'bin',
  R: 'return',
};
const CRATE_ING: Record<string, Ingredient> = { T: 'tomato', L: 'lettuce', O: 'onion', M: 'mushroom' };

export function parseLevel(def: LevelDef): ParsedLevel {
  const h = def.rows.length;
  const w = def.rows[0]?.length ?? 0;
  const solid: boolean[] = [];
  const stations: Station[] = [];
  const spawns: Array<{ x: number; y: number }> = [];
  def.rows.forEach((row, y) => {
    if (row.length !== w) throw new Error(`level ${def.id}: row ${y} is ${row.length} wide, expected ${w}`);
    [...row].forEach((ch, x) => {
      if (ch === '.' || /^[1-4]$/.test(ch)) {
        solid.push(false);
        if (ch !== '.') spawns[Number(ch) - 1] = { x: x + 0.5, y: y + 0.5 };
        return;
      }
      solid.push(true);
      if (ch === '#') return;
      const kind = STATION_CHARS[ch];
      if (!kind) throw new Error(`level ${def.id}: unknown tile '${ch}' at ${x},${y}`);
      stations.push({
        kind,
        x,
        y,
        item: kind === 'stove' ? emptyPot() : null,
        ing: CRATE_ING[ch] ?? null,
        chop: 0,
        count: kind === 'plates' ? def.plates : 0,
        v: 0,
      });
    });
  });
  return { w, h, solid, stations, spawns: spawns.filter(Boolean) };
}
