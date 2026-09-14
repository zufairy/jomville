import { describe, expect, it } from 'vitest';
import { LeaseApp, StageLender } from './stageLease';

function fakeApp() {
  const worldHost = { kids: [] as unknown[], appendChild(n: unknown) { this.kids.push(n); }, insertBefore(n: unknown, before: unknown) { const i = this.kids.indexOf(before); this.kids.splice(i < 0 ? this.kids.length : i, 0, n); } };
  const canvas = { parentNode: worldHost as LeaseApp<object>['canvas']['parentNode'], nextSibling: null as unknown };
  worldHost.kids.push(canvas);
  const world = { visible: true };
  const backdrop = { visible: true };
  const alreadyHidden = { visible: false };
  const app = {
    stage: {
      children: [backdrop, world, alreadyHidden] as Array<{ visible: boolean }>,
      eventMode: 'static',
      addChild(c: { visible: boolean }) { this.children.push(c); },
      removeChild(c: { visible: boolean }) { this.children.splice(this.children.indexOf(c), 1); },
    },
    canvas,
    resizeTo: worldHost as unknown,
    ticker: { started: false, start() { this.started = true; }, stop() { this.started = false; } },
  };
  return { app, worldHost, canvas, world, backdrop, alreadyHidden };
}

describe('StageLender (one Pixi app for world and kitchen)', () => {
  it('shows only the borrowed scene, in its host, with the ticker running', () => {
    const f = fakeApp();
    const lender = new StageLender<{ visible: boolean }>(f.app);
    const kitchen = { visible: true };
    const host = { kids: [] as unknown[], appendChild(n: unknown) { this.kids.push(n); } };
    const release = lender.lend(kitchen, host)!;
    expect(lender.leased).toBe(true);
    expect(f.world.visible).toBe(false);
    expect(f.backdrop.visible).toBe(false);
    expect(f.app.stage.children).toContain(kitchen);
    expect(f.app.stage.eventMode).toBe('none');
    expect(host.kids).toContain(f.canvas);
    expect(f.app.resizeTo).toBe(host);
    expect(f.app.ticker.started).toBe(true);
    // a second borrower is refused while lent
    expect(lender.lend({ visible: true }, host)).toBeNull();
    release();
  });

  it('release restores the world exactly, twice is harmless, and it can be lent again', () => {
    const f = fakeApp();
    const lender = new StageLender<{ visible: boolean }>(f.app);
    const kitchen = { visible: true };
    const host = { appendChild() {} };
    const release = lender.lend(kitchen, host)!;
    release();
    release();
    expect(lender.leased).toBe(false);
    expect(f.world.visible).toBe(true);
    expect(f.backdrop.visible).toBe(true);
    // something the world had hidden itself stays hidden
    expect(f.alreadyHidden.visible).toBe(false);
    expect(f.app.stage.children).not.toContain(kitchen);
    expect(f.app.stage.eventMode).toBe('static');
    expect(f.worldHost.kids).toContain(f.canvas);
    expect(f.app.resizeTo).toBe(f.worldHost);
    // the world was paused before the round: stays paused after
    expect(f.app.ticker.started).toBe(false);
    // round -> play again -> second round
    const again = lender.lend({ visible: true }, host);
    expect(again).not.toBeNull();
    again!();
    expect(f.world.visible).toBe(true);
  });
});
