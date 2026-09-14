import { kitchen } from '@dovey/shared';
import type { KitchenView } from './view';

export interface ChefDraw {
  id: string;
  x: number;
  y: number;
  fx: number;
  fy: number;
  held: kitchen.Item | null;
  chop: boolean;
  name: string;
  color: string;
  away: boolean;
  me: boolean;
}

export const CHEF_COLORS = ['#ff8a5b', '#5b9dff', '#58c98b', '#f5c542'];
const ING: Record<kitchen.Ingredient, string> = { tomato: '#e5483b', lettuce: '#6cc04a', onion: '#c9a0dc', mushroom: '#a0785a' };

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, stroke?: string) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = Math.max(1, r * 0.15);
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, k: number, color: string) {
  const h = Math.max(4, w * 0.12);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x - w / 2, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x - w / 2 + 1, y + 1, (w - 2) * Math.max(0, Math.min(1, k)), h - 2);
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, color = '#ffffff') {
  ctx.font = `bold ${Math.round(px)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

export function drawItem(ctx: CanvasRenderingContext2D, item: kitchen.Item, cx: number, cy: number, s: number, now: number) {
  if (item.kind === 'ing') {
    if (!item.chopped) return circle(ctx, cx, cy, s * 0.2, ING[item.ing], '#00000040');
    for (const [dx, dy] of [
      [-0.12, 0.05],
      [0.1, -0.06],
      [0.03, 0.12],
    ])
      circle(ctx, cx + dx * s, cy + dy * s, s * 0.09, ING[item.ing], '#00000040');
    return;
  }
  if (item.kind === 'plate') {
    circle(ctx, cx, cy, s * 0.3, '#ffffff', '#cfcfcf');
    if (item.soup) circle(ctx, cx, cy, s * 0.2, ING[item.soup]);
    item.parts.forEach((p, i) => circle(ctx, cx + (i ? 0.09 : -0.09) * s, cy, s * 0.1, ING[p]));
    return;
  }
  circle(ctx, cx, cy, s * 0.32, item.burnt ? '#1b1b1b' : '#4a4a55', '#2a2a30');
  if (!item.contents.length || item.burnt) return;
  circle(ctx, cx, cy, s * (0.1 + 0.04 * item.contents.length), ING[item.contents[0]]);
  if (kitchen.potDone(item)) {
    const danger = item.over / kitchen.BURN_AFTER;
    if (danger > 0.4 && Math.floor(now / (danger > 0.75 ? 120 : 250)) % 2) {
      ctx.lineWidth = s * 0.06;
      ctx.strokeStyle = '#ff3b30';
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.4, 0, Math.PI * 2);
      ctx.stroke();
    }
    label(ctx, '✓', cx, cy, s * 0.3);
  } else {
    bar(ctx, cx, cy + s * 0.34, s * 0.7, item.cook / (kitchen.COOK_PER_ING * kitchen.POT_MAX), '#58c98b');
  }
}

function drawStation(ctx: CanvasRenderingContext2D, st: kitchen.Station, px: number, py: number, s: number, now: number) {
  ctx.fillStyle = '#b97a4c';
  ctx.fillRect(px, py, s, s);
  ctx.fillStyle = '#d99a68';
  ctx.fillRect(px + 2, py + 2, s - 4, s - 6);
  const cx = px + s / 2;
  const cy = py + s / 2;
  switch (st.kind) {
    case 'crate':
      ctx.fillStyle = '#7a4d2e';
      ctx.fillRect(px + s * 0.15, py + s * 0.15, s * 0.7, s * 0.65);
      if (st.ing) circle(ctx, cx, cy, s * 0.2, ING[st.ing], '#00000055');
      return;
    case 'board':
      ctx.fillStyle = '#f1d7a8';
      ctx.fillRect(px + s * 0.15, py + s * 0.2, s * 0.7, s * 0.55);
      break;
    case 'stove':
      ctx.fillStyle = '#3d3d46';
      ctx.fillRect(px + 3, py + 3, s - 6, s - 8);
      circle(ctx, cx, cy, s * 0.36, st.item?.kind === 'pot' && st.item.contents.length && !st.item.burnt ? '#e0663d' : '#55555f');
      break;
    case 'plates':
    case 'return':
      if (st.kind === 'return') {
        ctx.fillStyle = '#9cc7e8';
        ctx.fillRect(px + 4, py + 4, s - 8, s - 10);
      }
      for (let i = 0; i < Math.min(st.count, 4); i++) circle(ctx, cx, cy - i * s * 0.06, s * 0.28, '#ffffff', '#cfcfcf');
      return;
    case 'window':
      ctx.fillStyle = '#ffd35c';
      ctx.fillRect(px + 2, py + 2, s - 4, s - 6);
      label(ctx, 'SERVE', cx, cy, s * 0.2, '#3b2a2a');
      return;
    case 'bin':
      circle(ctx, cx, cy, s * 0.32, '#7d8591', '#4d535c');
      return;
  }
  if (st.item) drawItem(ctx, st.item, cx, cy, s, now);
  if (st.kind === 'board' && st.chop > 0) bar(ctx, cx, py + s * 0.8, s * 0.7, st.chop / kitchen.CHOP_TIME, '#f5c542');
}

export function drawKitchen(ctx: CanvasRenderingContext2D, view: KitchenView, chefs: ChefDraw[], cssW: number, cssH: number, topPad: number, now: number) {
  const { w, h } = view;
  const s = Math.max(8, Math.floor(Math.min(cssW / (w + 0.4), (cssH - topPad) / (h + 0.4))));
  const ox = Math.round((cssW - s * w) / 2);
  const oy = Math.round(topPad + (cssH - topPad - s * h) / 2);
  ctx.fillStyle = '#2b2233';
  ctx.fillRect(0, 0, cssW, cssH);
  const stationAt = new Map(view.stations.map((st) => [st.y * w + st.x, st]));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const px = ox + x * s;
      const py = oy + y * s;
      const st = stationAt.get(y * w + x);
      if (st) drawStation(ctx, st, px, py, s, now);
      else {
        ctx.fillStyle = view.solid[y * w + x] ? '#5b4636' : (x + y) % 2 ? '#f3e2c0' : '#ead4ab';
        ctx.fillRect(px, py, s, s);
      }
    }
  for (const f of view.floor) drawItem(ctx, f.item, ox + f.x * s, oy + f.y * s, s * 0.9, now);
  for (const c of [...chefs].sort((a, b) => a.y - b.y)) {
    const cx = ox + c.x * s;
    const cy = oy + c.y * s;
    ctx.globalAlpha = c.away ? 0.4 : 1;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.3, s * 0.32, s * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    circle(ctx, cx, cy, s * 0.34, c.color, c.me ? '#ffffff' : '#3b2a2a');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - s * 0.18, cy - s * 0.52, s * 0.36, s * 0.2); // chef hat
    circle(ctx, cx + c.fx * s * 0.12 - c.fy * s * 0.1, cy + c.fy * s * 0.12 + c.fx * s * 0.1, s * 0.05, '#3b2a2a');
    circle(ctx, cx + c.fx * s * 0.12 + c.fy * s * 0.1, cy + c.fy * s * 0.12 - c.fx * s * 0.1, s * 0.05, '#3b2a2a');
    if (c.held) drawItem(ctx, c.held, cx + c.fx * s * 0.42, cy + c.fy * s * 0.42, s * 0.8, now);
    if (c.chop) {
      const a = Math.sin(now / 60) * 0.8;
      ctx.strokeStyle = '#dfe6ee';
      ctx.lineWidth = s * 0.06;
      ctx.beginPath();
      ctx.moveTo(cx + c.fx * s * 0.3, cy + c.fy * s * 0.3);
      ctx.lineTo(cx + c.fx * s * 0.3 + Math.cos(a) * s * 0.25, cy + c.fy * s * 0.3 - Math.abs(Math.sin(a)) * s * 0.25);
      ctx.stroke();
    }
    ctx.font = `bold ${Math.max(10, Math.round(s * 0.24))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#3b2a2a';
    ctx.strokeText(c.name, cx, cy - s * 0.55);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(c.name, cx, cy - s * 0.55);
    ctx.globalAlpha = 1;
  }
}
