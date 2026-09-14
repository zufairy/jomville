/**
 * Lends the page's one Pixi app to a full-screen scene (the kitchen round).
 *
 * A second Pixi Application on the page breaks shared GPU state: after it is
 * destroyed the world renderer throws every frame and the stage stays blank.
 * So a scene borrows the world app instead: the world's stage children are
 * hidden and its stage stops taking pointer events, the canvas moves into the
 * scene's host (and resizes to it), and the ticker runs. Release puts all of
 * it back exactly as it was. No Pixi import, so the lifecycle is unit tested.
 */

export interface LeaseCanvas {
  parentNode: { insertBefore(node: never, child: unknown): unknown } | null;
  nextSibling: unknown;
}

export interface LeaseApp<C> {
  stage: {
    children: ReadonlyArray<{ visible: boolean }>;
    eventMode: string;
    addChild(child: C): unknown;
    removeChild(child: C): unknown;
  };
  canvas: LeaseCanvas;
  resizeTo: unknown;
  ticker: { started: boolean; start(): void; stop(): void };
}

export interface LeaseHost {
  appendChild(node: never): unknown;
}

export class StageLender<C> {
  private leasedTo: C | null = null;

  constructor(private app: LeaseApp<C>) {}

  get leased(): boolean {
    return this.leasedTo !== null;
  }

  /** Shows only `root` on the stage, inside `host`. Returns release, or null while already lent. */
  lend(root: C, host: LeaseHost): (() => void) | null {
    if (this.leasedTo !== null) return null;
    const app = this.app;
    const hidden = app.stage.children.filter((c) => c.visible);
    for (const c of hidden) c.visible = false;
    const eventMode = app.stage.eventMode;
    app.stage.eventMode = 'none';
    const canvas = app.canvas;
    const parent = canvas.parentNode;
    const next = canvas.nextSibling;
    const resizeTo = app.resizeTo;
    host.appendChild(canvas as never);
    app.resizeTo = host;
    app.stage.addChild(root);
    const wasStarted = app.ticker.started;
    app.ticker.start();
    this.leasedTo = root;

    let done = false;
    return () => {
      if (done) return;
      done = true;
      app.stage.removeChild(root);
      for (const c of hidden) c.visible = true;
      app.stage.eventMode = eventMode;
      if (parent) parent.insertBefore(canvas as never, next);
      app.resizeTo = resizeTo;
      if (!wasStarted) app.ticker.stop();
      this.leasedTo = null;
    };
  }
}
