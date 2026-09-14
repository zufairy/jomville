import type { kitchen } from '@dovey/shared';

const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyE', 'ShiftLeft', 'ShiftRight']);

/** Keyboard (WASD/arrows, Space grab, E chop, Shift dash) and touch input, sampled at the sim rate. */
export class Controls {
  private keys = new Set<string>();
  private grabQ = false;
  private dashQ = false;
  private useKey = false;
  private useTouch = false;
  private stick = { mx: 0, my: 0 };
  private seq = 0;

  attach(target: Window = window): () => void {
    const typing = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') this.grabQ = true;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.dashQ = true;
      if (e.code === 'KeyE') this.useKey = true;
    };
    const up = (e: KeyboardEvent) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyE') this.useKey = false;
    };
    const blur = () => {
      this.keys.clear();
      this.useKey = false;
    };
    target.addEventListener('keydown', down);
    target.addEventListener('keyup', up);
    target.addEventListener('blur', blur);
    return () => {
      target.removeEventListener('keydown', down);
      target.removeEventListener('keyup', up);
      target.removeEventListener('blur', blur);
    };
  }

  pressGrab() {
    this.grabQ = true;
  }

  pressDash() {
    this.dashQ = true;
  }

  setUse(on: boolean) {
    this.useTouch = on;
  }

  setStick(mx: number, my: number) {
    this.stick = { mx, my };
  }

  next(): kitchen.KitchenInput {
    const k = (...codes: string[]) => (codes.some((c) => this.keys.has(c)) ? 1 : 0);
    let mx = k('KeyD', 'ArrowRight') - k('KeyA', 'ArrowLeft');
    let my = k('KeyS', 'ArrowDown') - k('KeyW', 'ArrowUp');
    if (!mx && !my) {
      mx = this.stick.mx;
      my = this.stick.my;
    }
    const inp = { seq: ++this.seq, mx, my, grab: this.grabQ, use: this.useKey || this.useTouch, dash: this.dashQ };
    this.grabQ = false;
    this.dashQ = false;
    return inp;
  }
}
