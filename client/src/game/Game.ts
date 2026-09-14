import { Application, Container, FederatedPointerEvent, Graphics } from 'pixi.js';
import {
  Placement,
  DEFAULT_STYLE,
  RoomMask,
  RoomStyle,
  buildGrid,
  distanceTo,
  FurnitureDef,
  footprint,
  furnitureDef,
  inReach,
  maskAllows,
  parseAvatar,
  placementAt,
  seatAt,
  seatFacing,
  tilesOf,
  validatePlacement,
  ROOM_SIZE,
  TILE_H,
  TILE_W,
  isWalkable,
  makeGrid,
  screenToTileIndex,
  tileToScreen,
} from '@dovey/shared';
import { atlas } from './atlas';
import { Backdrop } from './backdrop';
import { IDLE_DUEL } from '../store';
import { fetchInventory } from '../api';
import { AVATAR_SCALE, Avatar } from './avatar';
import { Camera } from './camera';
import { GestureController } from './gestures';
import { LeaseApp, StageLender } from './stageLease';
import { LocalMover } from './localMover';
import { Net, RemotePlayer } from '../net';
import { BubblePool } from './bubbles';
import { FurnitureSprite } from './furniture';
import { UndoStack, newPlacementId } from '../editor';
import { routeFromPath } from '../router';
import { fetchMe } from '../api';
import type { Me } from '../api';
import { CallManager, unlockAudio } from '../call';
import { ProximityVoice, VoiceSignal } from '../voice';
import { resolveTap } from './tapTarget';
import { arrivalReady } from './useArrival';
import { Fixtures } from './fixtures';
import { WALL_HEIGHT } from './walls';
import { claimDaily, fetchWardrobe } from '../api';
import { sfx } from '../audio';
import { EmotePool } from './emotes';
import { LoveFx } from './loveFx';
import { LabBots } from './labBots';
import { AmbientActors } from './ambient';
import { RideSystem } from './rides';
import { RIDE_SEAT_Z, seatPose } from './seats';
import { BEACH_CRITTERS, DREAM_CRITTERS, WONDER_CRITTERS } from '@dovey/shared';
import { bindLoveSender, love } from '../love';
import { bindTableSender, useTables } from '../tableGames';
import { bindFriendSender, useFriends } from '../friends';
import { useAppStore } from '../store';

function waitForActivation(): Promise<void> {
  const d = document as Document & { prerendering?: boolean };
  if (!d.prerendering) return Promise.resolve();
  return new Promise((resolve) => d.addEventListener('prerenderingchange', () => resolve(), { once: true }));
}

const MARKER_MS = 600;
const ZOOM_KEY = 'dovey.zoom';

function loadZoom(): number | null {
  try {
    const raw = sessionStorage.getItem(ZOOM_KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

function saveZoom(z: number) {
  try {
    sessionStorage.setItem(ZOOM_KEY, String(z));
  } catch {
    /* storage unavailable */
  }
}

/** Rocket Lab: deep space behind the room */
const LAB_BG = 0x0b0a1e;
/** themed system rooms paint their own background instead of the owner style colour */
const THEME_BG: Record<string, number> = { lab: LAB_BG, beach: 0xf6a36b, dream: 0xffe1ef, funpark: 0x1a110c, gameroom: 0x120f24 };
/** wandering critters per themed room */
const THEME_CRITTERS = { beach: BEACH_CRITTERS, dream: DREAM_CRITTERS, funpark: WONDER_CRITTERS } as const;

function shadeHex(colour: number, k: number): number {
  const ch = (sh: number) => Math.min(255, Math.round(((colour >> sh) & 255) * k));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

interface Actor {
  avatar: Avatar;
  target: RemotePlayer;
}

export class Game {
  private app = new Application();
  private world = new Container();
  private backdrop = new Backdrop();
  private walls = new Graphics();
  private floor = new Graphics();
  private marker = new Graphics();
  private actorLayer = new Container();
  private fxLayer = new Container();
  private bubbles!: BubblePool;
  private emotes!: EmotePool;
  private size = ROOM_SIZE;
  private theme = 'indoor';
  private mask: RoomMask = null;
  private style: RoomStyle = { ...DEFAULT_STYLE };
  /** walk to this item, then switch it */
  private pendingUse: string | null = null;
  private pendingClose = false;
  /** when the local mover reached a pending use's tile (0 = still walking) */
  private arrivedAt = 0;
  private downAt = 0;
  private rightDown = false;
  private grid = makeGrid(ROOM_SIZE, ROOM_SIZE);
  private camera!: Camera;
  private wasCameraFree = false;
  private lastSavedZoom = 1;
  private gestures = new GestureController({
    onPan: (dx, dy) => this.camera.pan(dx, dy),
    onPinch: (factor, cx, cy) => this.camera.zoomAt(factor, cx, cy),
    onFling: (vx, vy) => this.camera.fling(vx, vy),
    onWheelZoom: (factor, x, y) => this.camera.zoomAt(factor, x, y),
  });
  private net = new Net();

  private me: Avatar | null = null;
  private mover: LocalMover | null = null;
  private actors = new Map<string, Actor>();
  private furniture = new Map<string, FurnitureSprite>();
  private ghost: FurnitureSprite | null = null;
  private undo = new UndoStack();
  private calls = new CallManager({
    invite: (to, video) => this.net.send('call_invite', { to, video }),
    accept: () => this.net.send('call_accept'),
    decline: () => this.net.send('call_decline'),
    end: () => this.net.send('call_end'),
    rtc: (to, data) => this.net.send('rtc', { to, data }),
  });
  private voice = new ProximityVoice(
    (to, data) => this.net.send('vrtc', { to, data }),
    (on) => this.net.send('voice', { on }),
  );
  /** a timer, not the ticker: hidden tabs pause rAF but should keep hearing nearby voices */
  private voiceTimer: ReturnType<typeof setInterval> | null = null;
  private unsubscribeStore: (() => void) | null = null;
  /** sessionIds currently on a call (for the ring effect) */
  private inCall = new Set<string>();
  private ringLayer = new Graphics();
  /** mic badges float over heads, so they draw above the actors */
  private voiceBadges = new Graphics();
  private fixtures = new Fixtures(ROOM_SIZE);
  private ringClock = 0;
  private markerAge = Infinity;
  private initialised = false;
  private lastFx = performance.now();
  private disposed = false;
  private loveFx: LoveFx | null = null;
  private labBots: LabBots | null = null;
  private ambient: AmbientActors | null = null;
  /** carousel horses, teacups, swings, drop tower and the coaster, posed from the clock */
  private rides = new RideSystem(this.actorLayer);
  /** lends this app to full-screen scenes (kitchen rounds) instead of a second Pixi app */
  private lender: StageLender<Container> | null = null;

  async mount(el: HTMLElement) {
    await this.app.init({
      resizeTo: el,
      backgroundColor: 0xf6ecd9,
      antialias: false,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      preference: 'webgl',
    });
    this.initialised = true;
    if (this.disposed) {
      this.app.destroy(true, { children: true });
      return;
    }
    atlas.bind(this.app.renderer);
    el.appendChild(this.app.canvas);
    // Pixi's full types don't line up with the lender's minimal structural interface (DOM/ticker generics)
    this.lender = new StageLender<Container>(this.app as unknown as LeaseApp<Container>);
    if (import.meta.env.DEV) {
      const w = window as unknown as { __game: Game; __store: typeof useAppStore };
      w.__game = this;
      w.__store = useAppStore;
    }

    this.drawFloor();
    this.actorLayer.sortableChildren = true;
    this.world.addChild(this.walls, this.floor, this.marker, this.ringLayer, this.fixtures, this.actorLayer, this.voiceBadges, this.fxLayer);
    this.bubbles = new BubblePool(this.fxLayer);
    this.emotes = new EmotePool(this.fxLayer);
    bindLoveSender((type, data) => this.net.send(type, data));
    bindTableSender((type, data) => this.net.send(type, data));
    bindFriendSender((type, data) => this.net.send(type, data));
    this.calls.onVibe = (v) => {
      if (this.theme === 'love') love.vibe(v);
    };
    useAppStore.getState().setActions({
      say: (text) => this.net.sendChat(text),
      emote: (i) => this.net.sendEmote(i),
      setAvatar: (c) => this.net.sendAvatar(c),
      setRoomMeta: (p) => this.net.sendRoomMeta(p),
      rotateSelected: () => this.rotateSelected(),
      removeSelected: () => this.removeSelected(),
      undo: () => this.undoLast(),
      previewOf: (def) => atlas.preview(def),
      recenter: () => this.camera.follow(),
      useFurniture: (id, close = false) => {
        const f = this.furniture.get(id);
        if (f) this.useItem(f.placement, close);
      },
      callInvite: (peer, handle, video) => this.calls.invite(peer, handle, video),
      callAccept: () => this.calls.accept(),
      callDecline: () => this.calls.decline(),
      callHangup: () => this.calls.hangup(),
      callToggleMic: () => this.calls.toggleMic(),
      callToggleCam: () => this.calls.toggleCam(),
      callVideoEls: () => ({ local: this.calls.localEl, remote: this.calls.remoteEl }),
      toggleVoice: () => void this.voice.setMic(!this.voice.micOn),
      duelInvite: (peer, handle) => {
        this.net.send('duel_invite', { to: peer });
        useAppStore.getState().setDuel({ ...IDLE_DUEL, phase: 'ringing', peer, handle });
      },
      duelAccept: () => this.net.send('duel_accept'),
      duelDecline: () => {
        this.net.send('duel_decline');
        useAppStore.getState().setDuel(IDLE_DUEL);
      },
      duelPick: (pick) => {
        this.net.send('duel_pick', { pick });
        useAppStore.getState().setDuel((d) => ({ ...d, myPick: pick }));
      },
      duelEnd: () => {
        this.net.send('duel_end');
        useAppStore.getState().setDuel(IDLE_DUEL);
      },
      vend: () => {
        this.fixtures.rattle();
        this.net.send('vend');
      },
      block: (sessionId, on) => {
        this.net.sendBlock(sessionId, on);
        if (on) {
          useAppStore.getState().markBlocked(sessionId);
          this.bubbles.drop(sessionId);
        }
      },
      report: (sessionId, reason, note) => this.net.sendReport(sessionId, reason, note),
    });
    this.unsubscribeStore = useAppStore.subscribe((st, prev) => {
      if (st.edit !== prev.edit) this.onEditModeChange();
    });
    this.app.stage.addChild(this.backdrop, this.world);
    this.backdrop.zIndex = -1;

    this.camera = new Camera(this.world, this.worldBounds());
    const centre = tileToScreen(this.size / 2, this.size / 2);
    this.camera.snapTo(centre.x, centre.y);
    const savedZoom = loadZoom();
    if (savedZoom) this.camera.setZoom(savedZoom);

    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = this.app.screen;
    this.app.stage.on('pointertap', (e) => this.onTap(e));
    this.app.stage.on('pointerdown', (e) => {
      this.downAt = performance.now();
      // remember right-button presses: the following tap closes chance furni
      this.rightDown = e.button === 2;
      this.gestures.down({ pointerId: e.pointerId, x: e.global.x, y: e.global.y, button: e.button, t: performance.now() });
    });
    this.app.stage.on('pointermove', (e) => {
      this.gestures.move({ pointerId: e.pointerId, x: e.global.x, y: e.global.y, t: performance.now() });
    });
    const onPointerUp = (e: FederatedPointerEvent) => {
      this.gestures.up({ pointerId: e.pointerId, x: e.global.x, y: e.global.y, t: performance.now() });
    };
    this.app.stage.on('pointerup', onPointerUp);
    this.app.stage.on('pointerupoutside', onPointerUp);
    this.app.stage.on('pointercancel', (e) => {
      this.gestures.cancel({ pointerId: e.pointerId, x: e.global.x, y: e.global.y, t: performance.now() });
    });
    // keep the browser menu away so right-click reaches Pixi
    this.app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // the browser must not scroll/zoom the page on touch — the game owns it
    this.app.canvas.style.touchAction = 'none';
    this.app.canvas.addEventListener(
      'wheel',
      (e) => {
        // a borrowed stage (kitchen round) handles its own zoom
        if (this.lender?.leased) return;
        e.preventDefault();
        const rect = this.app.canvas.getBoundingClientRect();
        this.gestures.wheel({ deltaY: e.deltaY, x: e.clientX - rect.left, y: e.clientY - rect.top });
      },
      { passive: false },
    );

    this.app.ticker.add((t) => {
      // while a full-screen scene borrows the app the world is hidden and frozen
      if (!this.lender?.leased) this.update(t.deltaMS);
    });
    this.voiceTimer = setInterval(() => {
      const peers = [...this.actors].map(([id, a]) => ({ id, x: a.target.x, y: a.target.y, voice: a.target.voice }));
      this.voice.update(this.net.sessionId, this.mover && { x: this.mover.x, y: this.mover.y }, peers);
    }, 250);

    // Chrome may prerender this URL invisibly; don't occupy a room slot until it's shown.
    await waitForActivation();
    if (this.disposed) return;
    window.addEventListener('pagehide', this.onPageHide);
    window.addEventListener('pageshow', this.onPageShow);

    // resolve which room to join: /r/:slug, else my home room (created on first visit)
    const route = routeFromPath();
    let slug = route.kind === 'room' ? route.slug : null;
    const me = await this.fetchMeUntilUp();
    if (this.disposed) return;
    if (me) {
      useAppStore.getState().setMe(me);
      if (!slug) slug = me.lobby || me.home;
      void fetchInventory().then((inv) => {
        if (!inv || this.disposed) return;
        useAppStore.getState().setInventory(inv.items);
        useAppStore.getState().setInstances(inv.instances);
        useAppStore.getState().setCoins(inv.coins);
      });
    }
    if (!slug) {
      useAppStore.getState().setStatus('error');
      return;
    }

    await this.net.connect(
      {
        onReset: () => this.resetWorld(),
        onJoined: () => {
          this.ensureSelf();
          this.voice.rejoin();
          void useFriends.getState().load();
        },
        onVoiceSignal: (from, data) => void this.voice.onSignal(from, data as VoiceSignal),
        onVoiceDrop: (id) => this.voice.drop(id),
        onAdd: (id, p) => this.onPlayerAdd(id, p),
        onChange: (id, p) => this.onPlayerChange(id, p),
        onRemove: (id) => this.onPlayerRemove(id),
        onChat: (id, text, roll) => {
          // muting is local, so drop their lines before they ever reach a bubble
          const st = useAppStore.getState();
          if (st.muted.includes(id) || st.blocked.includes(id)) return;
          this.bubbles.say(id, text, roll);
          const name = this.actors.get(id)?.target.handle || (id === this.net.sessionId ? st.me?.handle : undefined) || 'someone';
          st.pushChat({ id, name, text, roll: !!roll, at: Date.now() });
        },
        onGearUse: (id) => {
          // our own use already played locally when we tapped ourselves
          if (id !== this.net.sessionId) this.actors.get(id)?.avatar.useGear();
        },
        onEmote: (id, i) => {
          this.emotes.pop(id, i);
          this.reactToEmote(id, i);
        },
        onFurnitureAdd: (p) => this.onFurnitureAdd(p),
        onFurnitureChange: (p) => this.onFurnitureChange(p),
        onFurnitureRemove: (id) => this.onFurnitureRemove(id),
        onCallIncoming: (from, handle, video) => this.calls.onIncoming(from, handle, video),
        onCallStart: (peer, video, initiator) => void this.calls.onStart(peer, video, initiator),
        onCallEnd: (reason) => this.calls.onEnd(reason),
        onRtc: (from, data) => void this.calls.onRtc(from, data as { sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit }),
        onCallState: (a, b, on) => {
          for (const id of [a, b]) on ? this.inCall.add(id) : this.inCall.delete(id);
        },
        onVendResult: (r) => this.onVendResult(r as { ok: boolean; reason?: string; credits?: number; itemId?: string }),
        onDuelIncoming: (from, handle) => useAppStore.getState().setDuel({ ...IDLE_DUEL, phase: 'incoming', peer: from, handle }),
        onDuelStart: (peer, handle, you) => useAppStore.getState().setDuel({ ...IDLE_DUEL, phase: 'pick', peer, handle, you }),
        onDuelRound: (r) => {
          const st = useAppStore.getState();
          const you = st.duel.you;
          const won = r.done ? (you === 'a' ? r.score[0] > r.score[1] : r.score[1] > r.score[0]) : null;
          st.setDuel((d) => ({ ...d, phase: r.done ? 'over' : 'reveal', score: r.score, last: { picks: r.picks, winner: r.winner }, won, myPick: null }));
          if (!r.done) setTimeout(() => st.setDuel((d) => (d.phase === 'reveal' ? { ...d, phase: 'pick', round: d.round + 1, last: null } : d)), 1600);
          const me = this.net.sessionId;
          if (me) this.emotes.pop(me, r.winner === 'draw' ? 3 : (r.winner === you) ? 0 : 2);
        },
        onDuelEnd: (reason) => {
          useAppStore.getState().setDuel(IDLE_DUEL);
          useAppStore.getState().flash(reason === 'declined' ? 'they passed on the duel' : 'duel ended');
        },
        onMazeWin: (id, handle, reward) => {
          const a = this.actors.get(id);
          if (a) this.emotes.pop(id, 0);
          if (id !== this.net.sessionId) useAppStore.getState().flash(`${handle} found the maze prize`);
          else useAppStore.getState().flash(`🌟 maze prize! +${reward} coins`);
        },
        onRoomShape: (size, theme, mask) => this.setShape(size, theme, mask),
        onRoomStyle: (style) => this.setStyle(style),
        onCoins: (coins, earned) => {
          useAppStore.getState().setCoins(coins);
          if (earned > 0) useAppStore.getState().flash(`+${earned} coins`);
        },
      },
      useAppStore.getState().avatar,
      slug,
    );
    if (this.disposed) this.net.leave();
    else this.ensureSelf();
    void this.loadWardrobe();
  }

  /**
   * The API can be mid-restart when the page opens (deploys, dev reloads). Keep
   * trying with the same backoff as the socket instead of leaving a dead page.
   */
  private async fetchMeUntilUp(): Promise<Me | null> {
    for (let attempt = 0; !this.disposed; attempt++) {
      try {
        return await fetchMe();
      } catch (e) {
        if (attempt === 0) console.error('[api] me failed, retrying', e);
        useAppStore.getState().setStatus('reconnecting');
        await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** attempt, 10_000)));
      }
    }
    return null;
  }

  private async loadWardrobe() {
    const w = await fetchWardrobe();
    if (!w || this.disposed) return;
    const st = useAppStore.getState();
    st.setWardrobe(w.owned);
    st.setCredits(w.credits);
    const d = await claimDaily();
    if (d?.granted && !this.disposed) {
      useAppStore.getState().setCredits(d.coins);
      useAppStore.getState().flash('daily credits +' + (d.coins - w.credits));
    }
  }

  private onVendResult(r: { ok: boolean; reason?: string; credits?: number; itemId?: string; duplicate?: boolean }) {
    const st = useAppStore.getState();
    if (!r.ok) {
      st.flash(r.reason === 'not_enough_credits' ? 'not enough credits' : 'machine jammed');
      st.setVending(false);
      return;
    }
    st.setVendResult(r as never);
    if (typeof r.credits === 'number') st.setCredits(r.credits);
    if (r.itemId && !r.duplicate && st.wardrobe) st.setWardrobe([...st.wardrobe, r.itemId]);
    // the in-world machine spits the capsule out too (colour by rarity)
    this.fixtures.dispense(String((r as { rarity?: string }).rarity ?? 'common'));
    // authoritative refresh: the server already stored the item, so re-pull the wardrobe
    void fetchWardrobe().then((w) => {
      if (!w || this.disposed) return;
      const s = useAppStore.getState();
      s.setWardrobe(w.owned);
      s.setCredits(w.credits);
    });
  }

  private worldBounds() {
    const S = this.size;
    const left = tileToScreen(0, S);
    const right = tileToScreen(S, 0);
    const bottom = tileToScreen(S, S);
    return { minX: left.x - TILE_W, maxX: right.x + TILE_W, minY: -WALL_HEIGHT - 40, maxY: bottom.y + TILE_H * 2 };
  }

  /** Room shape arrives with the first state patch; redraw the floor and refit the camera. */
  private setShape(size: number, theme: string, mask: RoomMask) {
    const maskKey = mask ? mask.join('|') : '';
    const sameMask = (this.mask ? this.mask.join('|') : '') === maskKey;
    if (size === this.size && theme === this.theme && sameMask) return;
    this.size = size;
    this.theme = theme;
    this.mask = mask;
    if (theme === 'lab') {
      this.app.renderer.background.color = LAB_BG;
      this.backdrop.setTheme('lab', LAB_BG);
      if (!this.labBots) this.labBots = new LabBots(this.actorLayer);
    }
    if ((theme === 'beach' || theme === 'dream' || theme === 'funpark') && !this.ambient) {
      const bg = THEME_BG[theme];
      this.app.renderer.background.color = bg;
      this.backdrop.setTheme(theme, bg);
      this.ambient = new AmbientActors(this.actorLayer, [...THEME_CRITTERS[theme]]);
    }
    if (theme === 'love' && !this.loveFx) {
      this.loveFx = new LoveFx();
      this.fxLayer.addChild(this.loveFx);
    }
    this.drawFloor();
    this.camera.setBounds(this.worldBounds());
    this.rebuildGrid();
    if (!this.me) {
      const centre = tileToScreen(size / 2, size / 2);
      this.camera.snapTo(centre.x, centre.y);
    }
  }

  private setStyle(style: RoomStyle) {
    this.style = style;
    const bg = THEME_BG[this.theme] ?? style.bg;
    this.app.renderer.background.color = bg;
    this.backdrop.setTheme(this.theme, bg);
    this.drawFloor();
  }

  /** Back walls: a rising face along every floor edge that borders void toward the top of the screen. */
  private drawWalls() {
    const g = this.walls;
    g.clear();
    if (!this.style.walls || (this.theme !== 'indoor' && this.theme !== 'love' && this.theme !== 'lab' && this.theme !== 'dream' && this.theme !== 'funpark' && this.theme !== 'gameroom')) return;
    const S = this.size;
    const floorAt = (x: number, y: number) => x >= 0 && y >= 0 && x < S && y < S && maskAllows(this.mask, x, y);
    const H = WALL_HEIGHT;
    const wall =
      this.theme === 'love' ? 0xffb3c6 : this.theme === 'lab' ? 0x2b2458 : this.theme === 'dream' ? 0xffc2da : this.theme === 'funpark' ? 0x7a4a2f : this.theme === 'gameroom' ? 0x33295e : this.style.wall;
    const left = shadeHex(wall, 0.86);
    const right = wall;
    const ink = 0x3b2a2a;
    const skirt = shadeHex(wall, 0.7);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        if (!floorAt(x, y)) continue;
        if (!floorAt(x, y - 1)) {
          // back-right wall along the tile's top-right edge
          const a = tileToScreen(x, y);
          const b = tileToScreen(x + 1, y);
          g.moveTo(a.x, a.y - H).lineTo(b.x, b.y - H).lineTo(b.x, b.y).lineTo(a.x, a.y).closePath().fill(right);
          g.moveTo(a.x, a.y - 6).lineTo(b.x, b.y - 6).lineTo(b.x, b.y).lineTo(a.x, a.y).closePath().fill(skirt);
          g.moveTo(a.x, a.y - H).lineTo(b.x, b.y - H).stroke({ width: 3, color: ink });
        }
        if (!floorAt(x - 1, y)) {
          // back-left wall along the tile's top-left edge
          const a = tileToScreen(x, y);
          const d = tileToScreen(x, y + 1);
          g.moveTo(a.x, a.y - H).lineTo(d.x, d.y - H).lineTo(d.x, d.y).lineTo(a.x, a.y).closePath().fill(left);
          g.moveTo(a.x, a.y - 6).lineTo(d.x, d.y - 6).lineTo(d.x, d.y).lineTo(a.x, a.y).closePath().fill(skirt);
          g.moveTo(a.x, a.y - H).lineTo(d.x, d.y - H).stroke({ width: 3, color: ink });
        }
      }
    // corner post where the two back walls meet
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        if (!floorAt(x, y) || floorAt(x, y - 1) || floorAt(x - 1, y)) continue;
        const a = tileToScreen(x, y);
        g.moveTo(a.x, a.y - H).lineTo(a.x, a.y).stroke({ width: 3, color: ink });
      }
    if (this.theme === 'gameroom') {
      // arcade night: pegboard dots, cyan neon along the top, pink neon skirting
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          if (!floorAt(x, y)) continue;
          const edges: Array<[number, number, number, number]> = [];
          if (!floorAt(x, y - 1)) edges.push([x, y, x + 1, y]);
          if (!floorAt(x - 1, y)) edges.push([x, y, x, y + 1]);
          for (const [x0, y0, x1, y1] of edges) {
            for (let i = 0; i < 3; i++)
              for (let j = 0; j < 4; j++) {
                const s = tileToScreen(x0 + ((x1 - x0) * (i + 0.5)) / 3, y0 + ((y1 - y0) * (i + 0.5)) / 3);
                g.circle(s.x, s.y - 22 - j * 16, 1.3).fill({ color: 0x120f24, alpha: 0.45 });
              }
            const a = tileToScreen(x0, y0);
            const b = tileToScreen(x1, y1);
            g.moveTo(a.x, a.y - H + 8).lineTo(b.x, b.y - H + 8).stroke({ width: 6, color: 0x5ef2ff, alpha: 0.18 });
            g.moveTo(a.x, a.y - H + 8).lineTo(b.x, b.y - H + 8).stroke({ width: 2, color: 0x5ef2ff });
            g.moveTo(a.x, a.y - 9).lineTo(b.x, b.y - 9).stroke({ width: 5, color: 0xff5fa2, alpha: 0.2 });
            g.moveTo(a.x, a.y - 9).lineTo(b.x, b.y - 9).stroke({ width: 1.8, color: 0xff5fa2 });
          }
        }
      return;
    }
    if (this.theme === 'funpark') {
      // slatted walnut boards, a darker wainscot under a brass chair rail, festoon bulbs along the top
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          if (!floorAt(x, y)) continue;
          const edges: Array<[number, number, number, number]> = [];
          if (!floorAt(x, y - 1)) edges.push([x, y, x + 1, y]);
          if (!floorAt(x - 1, y)) edges.push([x, y, x, y + 1]);
          for (const [x0, y0, x1, y1] of edges) {
            for (let k = 1; k < 6; k++) {
              const s = tileToScreen(x0 + ((x1 - x0) * k) / 6, y0 + ((y1 - y0) * k) / 6);
              g.moveTo(s.x, s.y - H + 3).lineTo(s.x, s.y - 4).stroke({ width: 1.2, color: 0x4a2c1b, alpha: 0.55 });
            }
            const a = tileToScreen(x0, y0);
            const b = tileToScreen(x1, y1);
            const rail = H * 0.34;
            g.poly([{ x: a.x, y: a.y - rail }, { x: b.x, y: b.y - rail }, { x: b.x, y: b.y }, { x: a.x, y: a.y }]).fill({ color: 0x2a170d, alpha: 0.3 });
            g.moveTo(a.x, a.y - rail).lineTo(b.x, b.y - rail).stroke({ width: 3, color: 0xe2b24f });
            g.moveTo(a.x, a.y - rail - 2).lineTo(b.x, b.y - rail - 2).stroke({ width: 1, color: 0xffe6a3, alpha: 0.7 });
            const top0 = { x: a.x, y: a.y - H + 12 };
            const top1 = { x: b.x, y: b.y - H + 12 };
            const cx = (top0.x + top1.x) / 2;
            const cy = (top0.y + top1.y) / 2 + 14;
            g.moveTo(top0.x, top0.y).quadraticCurveTo(cx, cy, top1.x, top1.y).stroke({ width: 1, color: 0x1f1510, alpha: 0.9 });
            for (const k of [0.3, 0.7]) {
              const u = 1 - k;
              const px = u * u * top0.x + 2 * u * k * cx + k * k * top1.x;
              const py = u * u * top0.y + 2 * u * k * cy + k * k * top1.y;
              g.circle(px, py + 4, 7).fill({ color: 0xffd98a, alpha: 0.2 });
              g.circle(px, py + 4, 2.2).fill(0xfff1c8);
            }
          }
        }
      return;
    }
    if (this.theme === 'dream') {
      // candy-stripe wallpaper, a white chair rail and a row of little hearts
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          if (!floorAt(x, y)) continue;
          const edges: Array<[number, number, number, number]> = [];
          if (!floorAt(x, y - 1)) edges.push([x, y, x + 1, y]);
          if (!floorAt(x - 1, y)) edges.push([x, y, x, y + 1]);
          for (const [x0, y0, x1, y1] of edges) {
            for (const k of [0.25, 0.75]) {
              const a = tileToScreen(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k);
              g.moveTo(a.x, a.y - H + 4).lineTo(a.x, a.y - 8).stroke({ width: 5, color: 0xffffff, alpha: 0.35 });
            }
            const a = tileToScreen(x0, y0);
            const b = tileToScreen(x1, y1);
            g.moveTo(a.x, a.y - H * 0.42).lineTo(b.x, b.y - H * 0.42).stroke({ width: 3, color: 0xffffff, alpha: 0.9 });
            if ((x0 + y0) % 2 === 0) {
              const m = tileToScreen((x0 + x1) / 2, (y0 + y1) / 2);
              const hy = m.y - H + 20;
              g.circle(m.x - 2.5, hy, 2.8).fill(0xff6f91);
              g.circle(m.x + 2.5, hy, 2.8).fill(0xff6f91);
              g.poly([{ x: m.x - 5.2, y: hy + 1 }, { x: m.x + 5.2, y: hy + 1 }, { x: m.x, y: hy + 7 }]).fill(0xff6f91);
            }
          }
        }
      return;
    }
    if (this.theme !== 'lab') return;
    // neon trim along the top and skirting of the back walls, plus a few running lights
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        if (!floorAt(x, y)) continue;
        const edges: Array<[number, number, number, number]> = [];
        if (!floorAt(x, y - 1)) edges.push([x, y, x + 1, y]);
        if (!floorAt(x - 1, y)) edges.push([x, y, x, y + 1]);
        for (const [x0, y0, x1, y1] of edges) {
          const a = tileToScreen(x0, y0);
          const b = tileToScreen(x1, y1);
          g.moveTo(a.x, a.y - H + 10).lineTo(b.x, b.y - H + 10).stroke({ width: 2, color: 0x7ef9ff, alpha: 0.7 });
          g.moveTo(a.x, a.y - 8).lineTo(b.x, b.y - 8).stroke({ width: 1.5, color: 0xd6a3ff, alpha: 0.6 });
          if ((x0 * 7 + y0 * 3) % 5 === 0) {
            const m = tileToScreen((x0 + x1) / 2, (y0 + y1) / 2);
            g.circle(m.x, m.y - H + 22, 1.5).fill({ color: 0xffffff, alpha: 0.7 });
          }
        }
      }
  }

  private drawFloor() {
    this.drawWalls();
    const g = this.floor;
    g.clear();
    const S = this.size;
    const theme = this.theme;
    const park = theme === 'park';
    const beach = theme === 'beach';
    const harbor = theme === 'harbor' || beach; // beach shares the harbor's water + sand treatment
    const funpark = theme === 'funpark';
    const den = theme === 'gameroom';
    const base = theme === 'lab' ? 0x2c3350 : theme === 'dream' ? 0xfbd9ea : funpark ? 0x7a4b2f : den ? 0x2b2f4a : this.style.floor;
    const lovely = theme === 'love';
    const dream = theme === 'dream';
    const tile = park
      ? [0xa6d977, 0x9bd06c]
      : beach
        ? [0xf7dcaa, 0xf2d29a]
        : harbor
          ? [0xf1dfb4, 0xebd5a4]
          : lovely
            ? [0xffe3ea, 0xffd3df]
            : dream
              ? [0xfff3f8, 0xffdcea]
              : funpark
                ? [0x7d4e31, 0x74482c]
                : den
                  ? [0x2b2f4a, 0x252841]
                  : [base, shadeHex(base, 0.94)];
    const line =
      park ? 0x92c463 : beach ? 0xe6c285 : harbor ? 0xdcc48f : lovely ? 0xf4b6c8 : dream ? 0xf5c3d8 : theme === 'lab' ? 0x3d4b7a : funpark ? 0x563320 : den ? 0x3d4270 : shadeHex(base, 0.85);
    const floorAt = (x: number, y: number) => x >= 0 && y >= 0 && x < S && y < S && maskAllows(this.mask, x, y);

    // water under everything for the harbor: covers the full square plus a margin
    if (harbor) {
      const m = 3;
      const c0 = tileToScreen(-m, -m);
      const c1 = tileToScreen(S + m, -m);
      const c2 = tileToScreen(S + m, S + m);
      const c3 = tileToScreen(-m, S + m);
      g.moveTo(c0.x, c0.y).lineTo(c1.x, c1.y).lineTo(c2.x, c2.y).lineTo(c3.x, c3.y).closePath().fill(beach ? 0x58a8d8 : 0x6cc4e8);
      // gentle wave strokes
      for (let y = -m; y < S + m; y++)
        for (let x = -m; x < S + m; x++) {
          if (floorAt(x, y)) continue;
          if ((x * 3 + y * 5) % 7 !== 0) continue;
          const p = tileToScreen(x + 0.5, y + 0.5);
          g.moveTo(p.x - 10, p.y).quadraticCurveTo(p.x - 5, p.y - 4, p.x, p.y).quadraticCurveTo(p.x + 5, p.y + 4, p.x + 10, p.y).stroke({ width: 1.5, color: 0xffffff, alpha: 0.35 });
        }
    }

    const drop = park ? 10 : harbor ? 14 : 8;
    const soilL = park ? 0x7a5a3a : harbor ? 0xb08a5a : shadeHex(base, 0.7);
    const soilR = park ? 0x9a7248 : harbor ? 0xc79d68 : shadeHex(base, 0.8);

    // cliff/soil faces: for every floor tile whose +y or +x neighbour is void
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        if (!floorAt(x, y)) continue;
        if (!floorAt(x, y + 1)) {
          const a = tileToScreen(x, y + 1);
          const b = tileToScreen(x + 1, y + 1);
          g.moveTo(a.x, a.y).lineTo(b.x, b.y).lineTo(b.x, b.y + drop).lineTo(a.x, a.y + drop).closePath().fill(soilL);
          g.moveTo(a.x, a.y + drop).lineTo(b.x, b.y + drop).stroke({ width: 2, color: 0x3b2a2a });
        }
        if (!floorAt(x + 1, y)) {
          const a = tileToScreen(x + 1, y);
          const b = tileToScreen(x + 1, y + 1);
          g.moveTo(a.x, a.y).lineTo(b.x, b.y).lineTo(b.x, b.y + drop).lineTo(a.x, a.y + drop).closePath().fill(soilR);
          g.moveTo(a.x, a.y + drop).lineTo(b.x, b.y + drop).stroke({ width: 2, color: 0x3b2a2a });
        }
      }

    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        if (!floorAt(x, y)) continue;
        const p = tileToScreen(x, y);
        const light = (x + y) % 2 === 0;
        g.moveTo(p.x, p.y)
          .lineTo(p.x + TILE_W / 2, p.y + TILE_H / 2)
          .lineTo(p.x, p.y + TILE_H)
          .lineTo(p.x - TILE_W / 2, p.y + TILE_H / 2)
          .closePath()
          .fill(light ? tile[0] : tile[1])
          .stroke({ width: park || harbor || funpark || den ? 1 : 2, color: line });
        if (den && (x + y) % 2 === 0) g.circle(p.x, p.y + TILE_H / 2, 1.6).fill({ color: 0x5ef2ff, alpha: 0.22 });
        if (funpark) {
          // walnut planks: board seams, a staggered butt joint, a faint sheen
          for (const k of [1 / 3, 2 / 3]) {
            const a = tileToScreen(x, y + k);
            const b = tileToScreen(x + 1, y + k);
            g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 1, color: 0x4f2e1b, alpha: 0.5 });
          }
          const j = (((x * 7 + y * 3) % 5) / 5) * 0.8 + 0.1;
          const r0 = tileToScreen(x + j, y + 1 / 3);
          const r1 = tileToScreen(x + j, y + 2 / 3);
          g.moveTo(r0.x, r0.y).lineTo(r1.x, r1.y).stroke({ width: 1, color: 0x4f2e1b, alpha: 0.45 });
          const s0 = tileToScreen(x + 0.1, y + 0.16);
          const s1 = tileToScreen(x + 0.7, y + 0.16);
          g.moveTo(s0.x, s0.y).lineTo(s1.x, s1.y).stroke({ width: 1, color: 0xffe0b0, alpha: 0.08 });
        }
        if (park && (x * 7 + y * 13) % 11 === 0) {
          const cx = p.x + ((x * 5) % 3) * 4 - 4;
          const cy = p.y + TILE_H / 2 + ((y * 3) % 3) * 2 - 2;
          g.moveTo(cx - 3, cy + 2).lineTo(cx - 1, cy - 4).lineTo(cx, cy + 2).lineTo(cx + 2, cy - 5).lineTo(cx + 3, cy + 2)
            .stroke({ width: 1.5, color: 0x6fb04e });
        }
        if (theme === 'lab' && (x * 5 + y * 3) % 7 === 0) {
          g.circle(p.x, p.y + TILE_H / 2, 2).fill({ color: 0x7ecbff, alpha: 0.45 });
        }
        if (harbor && (x * 5 + y * 11) % 9 === 0) {
          g.circle(p.x + ((x * 3) % 5) * 3 - 6, p.y + TILE_H / 2 + ((y * 7) % 3) * 2 - 2, 1.5).fill({ color: 0xd8bd86, alpha: 0.8 });
        }
      }
    }

    // outline: every floor edge that borders void
    const ink = 0x3b2a2a;
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        if (!floorAt(x, y)) continue;
        const p0 = tileToScreen(x, y);
        const p1 = tileToScreen(x + 1, y);
        const p2 = tileToScreen(x + 1, y + 1);
        const p3 = tileToScreen(x, y + 1);
        if (!floorAt(x, y - 1)) g.moveTo(p0.x, p0.y).lineTo(p1.x, p1.y).stroke({ width: 3, color: ink });
        if (!floorAt(x + 1, y)) g.moveTo(p1.x, p1.y).lineTo(p2.x, p2.y).stroke({ width: 3, color: ink });
        if (!floorAt(x, y + 1)) g.moveTo(p2.x, p2.y).lineTo(p3.x, p3.y).stroke({ width: 3, color: ink });
        if (!floorAt(x - 1, y)) g.moveTo(p3.x, p3.y).lineTo(p0.x, p0.y).stroke({ width: 3, color: ink });
      }
  }

  private onPlayerAdd(id: string, p: RemotePlayer) {
    const avatar = new Avatar(p.x, p.y, parseAvatar(p.avatar), p.handle);
    this.actorLayer.addChild(avatar);
    this.actors.set(id, { avatar, target: p });
    this.ensureSelf();
  }

  private onPlayerChange(id: string, p: RemotePlayer) {
    const a = this.actors.get(id);
    if (!a) return;
    a.target = p;
    a.avatar.setConfig(parseAvatar(p.avatar));
    if (this.mover && id === this.net.sessionId) this.mover.reconcile(p.x, p.y, p.moving);
  }

  private onPlayerRemove(id: string) {
    const a = this.actors.get(id);
    if (!a) return;
    a.avatar.destroy();
    this.actors.delete(id);
    this.bubbles.drop(id);
    if (a.avatar === this.me) {
      this.me = null;
      this.mover = null;
    }
  }

  /** sessionId is only known after join resolves; bind self lazily on the ticker. */
  private ensureSelf() {
    if (this.me) return;
    const sid = this.net.sessionId;
    if (!sid) return;
    const a = this.actors.get(sid);
    if (!a) return;
    this.me = a.avatar;
    this.mover = new LocalMover(this.grid, a.target.x, a.target.y);
    const p = tileToScreen(a.target.x, a.target.y);
    this.camera.snapTo(p.x, p.y);
  }

  private onTap(e: FederatedPointerEvent) {
    // a drag or pinch that ended under the pointer must not also walk/use
    if (this.gestures.consumeTap()) return;
    // browsers only play nearby voices once the page has had a gesture
    unlockAudio();
    if (!this.mover) return;
    const local = this.world.toLocal(e.global);
    const t = screenToTileIndex(local.x, local.y);
    const edit = useAppStore.getState().edit;
    if (edit.on) return this.onEditTap(t.x, t.y);
    const fx = this.fixtures.hit(local.x, local.y);
    if (fx === 'machine') {
      sfx.tap();
      useAppStore.getState().setVending(true);
      return;
    }
    if (fx === 'door') {
      sfx.tap();
      useAppStore.getState().setBrowsing(true);
      return;
    }
    // tapping yourself plays your gear's special move for everyone in the room
    if (this.me && this.onBody(this.me, local.x, local.y) && this.me.useGear()) {
      this.net.send('gear_use');
      return;
    }
    const hit = this.avatarAt(local.x, local.y);
    if (hit) {
      useAppStore.getState().setProfile({ sessionId: hit.id, handle: hit.handle });
      return;
    }
    const placements = this.placements();
    const action = resolveTap(t, {
      walkable: (x, y) => isWalkable(this.grid, x, y),
      seatAt: (x, y) => seatAt(x, y, placements),
      usableAt: (x, y) => {
        const p = placementAt(x, y, placements);
        return p && furnitureDef(p.def)?.use ? p : null;
      },
      spriteHit: () => {
        const item = this.itemAt(local.x, local.y, (d) => d.use || d.sit);
        return item ? { item, sit: !!furnitureDef(item.def)?.sit } : null;
      },
    });
    if (action.kind === 'walk') this.walkTo(action.x, action.y);
    else if (action.kind === 'use') this.useItem(action.item, e.button === 2 || this.rightDown || performance.now() - this.downAt > 500);
    else if (action.kind === 'seat') this.walkOntoSeat(action.item);
    // item info window: furniture taps select it, floor taps clear it
    const picked = action.kind === 'use' || action.kind === 'seat' ? action.item : action.kind === 'none' ? placementAt(t.x, t.y, placements) : null;
    useAppStore.getState().setSelectedItem(picked);
  }

  private walkTo(x: number, y: number) {
    if (!this.mover?.setTarget({ x, y })) return;
    this.pendingUse = null;
    this.net.sendMove(x, y);
    this.showMarker(x, y);
    this.camera.follow();
  }

  /** Use an item if in reach, else walk next to it and use it on arrival. Long-press / right-click closes dice. */
  private useItem(item: Placement, close = false) {
    if (!this.mover) return;
    const here = { x: Math.round(this.mover.x), y: Math.round(this.mover.y) };
    const kind = furnitureDef(item.def)?.interaction;
    const reachable = kind ? inReach(kind, here.x, here.y, item) : distanceTo(here.x, here.y, item) <= 2;
    if (reachable) {
      if (close && kind) this.net.sendClose(item.id);
      else this.net.sendUse(item.id);
      return;
    }
    const near = this.nearestWalkableAround(item, here);
    if (near && this.mover.setTarget(near)) {
      this.pendingUse = item.id;
      this.pendingClose = close && !!kind;
      this.net.sendMove(near.x, near.y);
      this.showMarker(near.x, near.y);
    }
  }

  /** Walk onto the nearest free tile of a seat (its sprite was tapped over a blocked tile). */
  private walkOntoSeat(seat: Placement) {
    if (!this.mover) return;
    const here = { x: Math.round(this.mover.x), y: Math.round(this.mover.y) };
    const tiles = (tilesOf(seat) ?? []).filter(([x, y]) => isWalkable(this.grid, x, y));
    tiles.sort((p, q) => Math.abs(p[0] - here.x) + Math.abs(p[1] - here.y) - (Math.abs(q[0] - here.x) + Math.abs(q[1] - here.y)));
    if (tiles[0]) this.walkTo(tiles[0][0], tiles[0][1]);
  }

  /** Topmost matching item whose sprite covers the world point (tall items poke above their tile). */
  private itemAt(x: number, y: number, want: (d: FurnitureDef) => boolean): Placement | null {
    let best: { p: Placement; z: number } | null = null;
    for (const f of this.furniture.values()) {
      const d = furnitureDef(f.placement.def);
      if (!d || !want(d)) continue;
      const b = f.getBounds();
      const local = this.world.toGlobal({ x, y });
      if (local.x < b.minX || local.x > b.maxX || local.y < b.minY || local.y > b.maxY) continue;
      if (!best || f.zIndex > best.z) best = { p: f.placement, z: f.zIndex };
    }
    return best?.p ?? null;
  }

  /** Closest walkable tile within reach of an item, preferring the one nearest to us. */
  private nearestWalkableAround(item: Placement, from: { x: number; y: number }) {
    const kind = furnitureDef(item.def)?.interaction;
    const ok = (x: number, y: number) => (kind ? inReach(kind, x, y, item) : distanceTo(x, y, item) <= 1);
    let best: { x: number; y: number; d: number } | null = null;
    for (let y = item.y - 2; y <= item.y + 3; y++)
      for (let x = item.x - 2; x <= item.x + 3; x++) {
        if (!isWalkable(this.grid, x, y) || !ok(x, y)) continue;
        const d = Math.abs(x - from.x) + Math.abs(y - from.y);
        if (!best || d < best.d) best = { x, y, d };
      }
    return best;
  }

  // ---- furniture state sync
  private placements(): Placement[] {
    return [...this.furniture.values()].map((f) => f.placement);
  }

  private rebuildGrid() {
    this.grid = buildGrid(this.size, this.placements(), this.mask);
    this.mover?.setGrid(this.grid);
  }

  private onFurnitureAdd(p: Placement) {
    const f = new FurnitureSprite(p);
    this.furniture.set(p.id, f);
    this.actorLayer.addChild(f);
    this.rebuildGrid();
  }

  private onFurnitureChange(p: Placement) {
    this.furniture.get(p.id)?.setPlacement(p);
    if (useAppStore.getState().selectedItem === p.id) useAppStore.getState().setSelectedItem(p);
    this.rebuildGrid();
  }

  private onFurnitureRemove(id: string) {
    const f = this.furniture.get(id);
    if (!f) return;
    f.destroy({ children: true });
    this.furniture.delete(id);
    this.rebuildGrid();
    if (useAppStore.getState().selectedItem === id) useAppStore.getState().setSelectedItem(null);
    const edit = useAppStore.getState().edit;
    if (edit.on && edit.selected === id) useAppStore.getState().setEdit({ ...edit, selected: null, moving: false });
  }

  // ---- editor
  private onEditModeChange() {
    const edit = useAppStore.getState().edit;
    if (edit.on && useAppStore.getState().selectedItem) useAppStore.getState().setSelectedItem(null);
    for (const [id, f] of this.furniture) f.setSelected(edit.on && edit.selected === id);
    if (!edit.on || !edit.placing) this.hideGhost();
    if (!edit.on) this.undo.clear();
    useAppStore.getState().setUndoCount(this.undo.size);
  }

  private hideGhost() {
    if (this.ghost) {
      this.ghost.destroy({ children: true });
      this.ghost = null;
    }
  }

  private onEditTap(x: number, y: number) {
    const store = useAppStore.getState();
    const edit = store.edit;
    if (!edit.on) return;

    if (edit.placing) {
      const p: Placement = { id: newPlacementId(), def: edit.placing, x, y, rot: 0, ...(edit.placingItem ? { itemId: edit.placingItem } : {}) };
      const d = furnitureDef(edit.placing);
      if (!d) return;
      // centre multi-tile items on the tapped tile
      p.x -= Math.floor((d.w - 1) / 2);
      p.y -= Math.floor((d.h - 1) / 2);
      const err = validatePlacement(p, this.size, this.placements(), this.mask);
      if (err) {
        this.flashGhost(p);
        store.flash(err === 'overlap' ? 'something is in the way' : 'out of the room');
        return;
      }
      this.net.sendPlace(p);
      this.undo.push({ kind: 'remove', id: p.id });
      store.setUndoCount(this.undo.size);
      if (edit.placingItem) {
        // one serial, one placement: hide it from the tray until the server refresh lands
        const itemId = edit.placingItem;
        store.setInstances(store.instances.map((i) => (i.id === itemId ? { ...i, placed: 'here' } : i)));
        store.setEdit({ ...edit, placing: null, placingItem: null, selected: p.id });
        return;
      }
      store.setEdit({ ...edit, selected: p.id });
      return;
    }

    if (edit.moving && edit.selected) {
      const f = this.furniture.get(edit.selected);
      if (!f) return;
      const before = { ...f.placement };
      const next: Placement = { ...before, x, y };
      const d = furnitureDef(before.def)!;
      next.x -= Math.floor((d.w - 1) / 2);
      next.y -= Math.floor((d.h - 1) / 2);
      const err = validatePlacement(next, this.size, this.placements(), this.mask);
      if (err) {
        store.flash('something is in the way');
        return;
      }
      this.net.sendMoveFurniture(next);
      this.undo.push({ kind: 'move', p: before });
      store.setUndoCount(this.undo.size);
      store.setEdit({ ...edit, moving: false });
      return;
    }

    const hit = placementAt(x, y, this.placements());
    store.setEdit({ ...edit, selected: hit?.id ?? null, moving: false });
    this.onEditModeChange();
  }

  private flashGhost(p: Placement) {
    this.hideGhost();
    this.ghost = new FurnitureSprite(p);
    this.ghost.setGhost(true, false);
    this.actorLayer.addChild(this.ghost);
    setTimeout(() => this.hideGhost(), 350);
  }

  private rotateSelected() {
    const store = useAppStore.getState();
    const edit = store.edit;
    if (!edit.on || !edit.selected) return;
    const f = this.furniture.get(edit.selected);
    if (!f) return;
    const before = { ...f.placement };
    const next: Placement = { ...before, rot: ((before.rot + 1) % 4) as 0 | 1 | 2 | 3 };
    if (validatePlacement(next, this.size, this.placements(), this.mask)) {
      store.flash('no room to rotate');
      return;
    }
    this.net.sendMoveFurniture(next);
    this.undo.push({ kind: 'move', p: before });
    store.setUndoCount(this.undo.size);
  }

  private removeSelected() {
    const store = useAppStore.getState();
    const edit = store.edit;
    if (!edit.on || !edit.selected) return;
    const f = this.furniture.get(edit.selected);
    if (!f) return;
    this.net.sendRemove(edit.selected);
    this.undo.push({ kind: 'place', p: { ...f.placement } });
    store.setUndoCount(this.undo.size);
    store.setEdit({ ...edit, selected: null, moving: false });
  }

  private undoLast() {
    const op = this.undo.pop();
    const store = useAppStore.getState();
    store.setUndoCount(this.undo.size);
    if (!op) return;
    if (op.kind === 'remove') this.net.sendRemove(op.id);
    else if (op.kind === 'place') this.net.sendPlace(op.p);
    else this.net.sendMoveFurniture(op.p);
  }

  /** Emotes are also acted out: eyes change, body hops or wiggles. */
  private reactToEmote(id: string, i: number) {
    const a = this.actors.get(id)?.avatar;
    if (!a) return;
    // EMOTES order: 👋 ❤️ 😂 😮 😢 🎉 👍 💤
    const map: Array<{ eyes?: Parameters<typeof a.express>[0]; act?: Parameters<typeof a.act>[0] }> = [
      { eyes: 'happy', act: 'wiggle' },
      { eyes: 'heart' },
      { eyes: 'happy', act: 'wiggle' },
      { eyes: 'surprised', act: 'hop' },
      { eyes: 'sad' },
      { eyes: 'happy', act: 'hop' },
      { eyes: 'wink' },
      { eyes: 'closed' as never },
    ];
    const r = map[i];
    if (!r) return;
    if (r.eyes) a.express(r.eyes, i === 7 ? 3000 : 1800);
    if (r.act) a.act(r.act);
  }

  /** Whether a world point is on an avatar's body, not the transparent rest of its frame. */
  private onBody(av: Avatar, x: number, y: number): boolean {
    return x >= av.x - 14 * AVATAR_SCALE && x <= av.x + 14 * AVATAR_SCALE && y >= av.y - 48 * AVATAR_SCALE && y <= av.y;
  }

  /** Topmost other avatar whose body (not the whole 64px frame) contains the world point. */
  private avatarAt(x: number, y: number): { id: string; handle: string } | null {
    let best: { id: string; handle: string; z: number } | null = null;
    for (const [id, a] of this.actors) {
      if (a.avatar === this.me) continue;
      const ax = a.avatar.x;
      const ay = a.avatar.y;
      if (this.onBody(a.avatar, x, y)) {
        if (!best || a.avatar.zIndex > best.z) best = { id, handle: a.target.handle, z: a.avatar.zIndex };
      }
    }
    return best;
  }

  private drawCallRings(dtMs: number) {
    this.ringClock += dtMs;
    const g = this.ringLayer;
    g.clear();
    if (!this.inCall.size) return;
    const t = (this.ringClock % 1400) / 1400;
    for (const id of this.inCall) {
      const a = this.actors.get(id);
      if (!a) continue;
      const cx = a.avatar.x;
      const cy = a.avatar.y - 2;
      g.ellipse(cx, cy, 26, 13).stroke({ width: 3, color: 0x2fb39b, alpha: 0.9 });
      g.ellipse(cx, cy, 26 + t * 22, 13 + t * 11).stroke({ width: 2, color: 0x2fb39b, alpha: (1 - t) * 0.7 });
    }
  }

  private showMarker(tx: number, ty: number) {
    const p = tileToScreen(tx, ty);
    this.marker.clear();
    this.marker
      .moveTo(p.x, p.y + 2)
      .lineTo(p.x + TILE_W / 2 - 4, p.y + TILE_H / 2)
      .lineTo(p.x, p.y + TILE_H - 2)
      .lineTo(p.x - TILE_W / 2 + 4, p.y + TILE_H / 2)
      .closePath()
      .stroke({ width: 3, color: 0xff8a5b });
    this.markerAge = 0;
  }

  private update(dtMs: number) {
    this.ensureSelf();

    this.markerAge += dtMs;
    this.marker.alpha = Math.max(0, 1 - this.markerAge / MARKER_MS);

    if (this.me && this.mover) {
      this.mover.update(dtMs);
      this.me.tx = this.mover.x;
      this.me.ty = this.mover.y;
      this.me.setDir(this.mover.dir);
      this.me.moving = this.mover.moving;
      if (!this.pendingUse || this.mover.moving) this.arrivedAt = 0;
      else if (!this.arrivedAt) this.arrivedAt = performance.now();
      const server = this.net.sessionId ? this.actors.get(this.net.sessionId)?.target : null;
      if (this.pendingUse && this.arrivedAt && arrivalReady(this.mover, server, performance.now() - this.arrivedAt)) {
        this.arrivedAt = 0;
        const id = this.pendingUse;
        this.pendingUse = null;
        if (this.pendingClose) this.net.sendClose(id);
        else this.net.sendUse(id);
        this.pendingClose = false;
      }
    }

    // others: exponential lerp toward last server position (server ticks at 100ms)
    const k = 1 - Math.exp(-dtMs / 80);
    for (const a of this.actors.values()) {
      if (a.avatar === this.me) continue;
      a.avatar.tx += (a.target.x - a.avatar.tx) * k;
      a.avatar.ty += (a.target.y - a.avatar.ty) * k;
      a.avatar.setDir(a.target.dir);
      a.avatar.moving = a.target.moving || Math.abs(a.target.x - a.avatar.tx) + Math.abs(a.target.y - a.avatar.ty) > 0.05;
    }

    const placements = this.placements();
    // rides move from the wall clock so every visitor sees the same horse carry the same rider
    const clock = Date.now();
    this.rides.sync(placements, this.theme === 'funpark');
    this.rides.tick(clock);
    for (const a of this.actors.values()) {
      const idle = a.avatar === this.me ? !this.mover?.moving : !a.avatar.moving;
      const seat = idle ? seatAt(Math.round(a.avatar.tx), Math.round(a.avatar.ty), placements) : null;
      const ride = seat ? this.rides.rider(seat, Math.round(a.avatar.tx), Math.round(a.avatar.ty), clock) : null;
      let facing = -1;
      if (seat) {
        const sd = furnitureDef(seat.def)!;
        const pose = seatPose(sd.kind);
        facing = seatFacing(seat.rot);
        a.avatar.setSitting(true, ride ? RIDE_SEAT_Z : pose.z, !ride && pose.legs);
        a.avatar.setDir(facing);
        const { w, h } = footprint(sd, seat.rot);
        // facing the viewer the backrest is behind: draw over the seat. Facing away it is in front:
        // draw under the seat so the backrest covers the lower back.
        const towardViewer = facing === 1 || facing === 2;
        const above = towardViewer || !pose.back;
        a.avatar.zBias = seat.x + w + seat.y + h - 1.5 + (above ? 0.1 : -0.05) - (a.avatar.tx + a.avatar.ty);
      } else {
        a.avatar.setSitting(false);
        a.avatar.zBias = 0;
      }
      a.avatar.syncPosition();
      if (seat && !ride) {
        // settle back into the seat, away from the facing direction
        const back = [
          [0, 1],
          [-1, 0],
          [0, -1],
          [1, 0],
        ][facing];
        const o = tileToScreen(back[0] * 0.14, back[1] * 0.14);
        a.avatar.position.set(a.avatar.position.x + Math.round(o.x), a.avatar.position.y + Math.round(o.y));
      }
      if (ride) {
        // riders sit in their moving horse, cup, chair or coaster car
        a.avatar.setDir(ride.dir);
        a.avatar.position.set(ride.x, ride.y);
        a.avatar.zIndex = ride.z;
      }
      a.avatar.tick(dtMs);
    }

    // FX use wall-clock so throttled/hidden tabs don't stretch bubble lifetimes
    const now = performance.now();
    const fxDt = Math.min(now - this.lastFx, 1000);
    this.lastFx = now;

    this.drawCallRings(fxDt);
    this.drawVoice();
    this.fixtures.setVisitor(this.mover ? { x: this.mover.x, y: this.mover.y } : null);
    this.fixtures.tick(fxDt);
    this.loveFx?.tick(fxDt);
    this.labBots?.tick(fxDt);
    this.ambient?.tick(fxDt);
    this.bubbles.tick(fxDt);
    this.bubbles.forEachActive((id, b) => {
      const a = this.actors.get(id);
      if (a) b.position.set(a.avatar.x, a.avatar.y - 72 * AVATAR_SCALE);
    });
    this.emotes.tick(fxDt, (id) => {
      const a = this.actors.get(id);
      // emotes pop 84px above the anchor for a 64px body; lift them to clear the bigger head
      return a ? { x: a.avatar.x, y: a.avatar.y - 84 * (AVATAR_SCALE - 1) } : null;
    });

    const focus = this.me
      ? tileToScreen(this.me.tx, this.me.ty)
      : tileToScreen(this.size / 2, this.size / 2);
    this.camera.update(focus.x, focus.y, this.app.screen.width, this.app.screen.height);
    this.backdrop.update(fxDt, this.app.screen.width, this.app.screen.height, this.world.position.x, this.world.position.y);
    if (this.camera.isFree !== this.wasCameraFree) {
      this.wasCameraFree = this.camera.isFree;
      useAppStore.getState().setCameraFree(this.wasCameraFree);
    }
    if (this.camera.zoom !== this.lastSavedZoom) {
      this.lastSavedZoom = this.camera.zoom;
      saveZoom(this.lastSavedZoom);
    }
  }

  /** Mic badge over anyone with an open mic, and a soft ring under whoever is talking. */
  private drawVoice() {
    const rings = this.ringLayer;
    const badges = this.voiceBadges;
    badges.clear();
    const me = this.net.sessionId;
    const pulse = 0.55 + 0.45 * Math.sin(this.ringClock / 160);
    for (const [id, a] of this.actors) {
      const open = id === me ? this.voice.micOn : a.target.voice;
      if (!open) continue;
      const cx = a.avatar.x;
      const cy = a.avatar.y;
      if (this.voice.speaking.has(id)) {
        rings.ellipse(cx, cy - 2, 22, 11).stroke({ width: 3, color: 0x7ee0c8, alpha: pulse });
      }
      const bx = cx + 14 * AVATAR_SCALE;
      const by = cy - 52 * AVATAR_SCALE;
      badges.circle(bx, by, 7).fill(0x2fb39b).stroke({ width: 2, color: 0x3b2a2a });
      badges.roundRect(bx - 2, by - 4.5, 4, 6, 2).fill(0xffffff);
      badges.moveTo(bx, by + 2).lineTo(bx, by + 4).stroke({ width: 1.5, color: 0xffffff });
    }
  }

  /** The socket dropped: clear the old session's people, furniture and links; the rejoin re-adds them. */
  private resetWorld() {
    this.voice.closeAll();
    this.calls.teardown();
    this.inCall.clear();
    for (const id of [...this.actors.keys()]) this.onPlayerRemove(id);
    for (const id of [...this.furniture.keys()]) this.onFurnitureRemove(id);
    this.hideGhost();
    this.pendingUse = null;
    const st = useAppStore.getState();
    st.setProfile(null);
    st.setDuel(IDLE_DUEL);
    // a rejoin is a new session: the old seat and match are gone server-side
    useTables.getState().reset();
    st.setSessionId(null);
    st.setPlayerCount(0);
  }

  /** Safe to call before init resolves (React StrictMode double-mount). */
  private onPageHide = () => this.net.leave();

  /** Restored from the back/forward cache: the old socket is gone, so rejoin. */
  private onPageShow = (e: PageTransitionEvent) => {
    if (e.persisted && !this.disposed) this.net.resume();
  };

  /** Dev-only inspection hook. */
  debug() {
    const sid = this.net.sessionId;
    const out: Record<string, unknown> = { sid, mover: this.mover && { x: this.mover.x, y: this.mover.y, moving: this.mover.moving } };
    for (const [id, a] of this.actors) out[id] = { ax: a.avatar.tx, ay: a.avatar.ty, sx: a.target.x, sy: a.target.y };
    return out;
  }

  /**
   * Hand this app's canvas and renderer to a full-screen scene (kitchen round):
   * the world is hidden, ignores input and stops updating until release. The
   * page keeps one renderer — a second Pixi app breaks shared GPU state.
   */
  lendStage(root: Container, host: HTMLElement, background?: number): { app: Application; release: () => void } | null {
    if (!this.initialised || this.disposed || !this.lender) return null;
    const bg = this.app.renderer.background.color.toNumber();
    const release = this.lender.lend(root, host);
    if (!release) return null;
    if (background !== undefined) this.app.renderer.background.color = background;
    let done = false;
    return {
      app: this.app,
      release: () => {
        if (done || this.disposed) return;
        done = true;
        this.app.renderer.background.color = bg;
        release();
      },
    };
  }

  /** stop rendering the world while a full-screen minigame covers it */
  setPaused(paused: boolean) {
    if (paused) this.app.ticker?.stop();
    else this.app.ticker?.start();
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    this.calls.teardown();
    if (this.voiceTimer) clearInterval(this.voiceTimer);
    this.voice.teardown();
    this.unsubscribeStore?.();
    useAppStore.getState().setActions(null);
    window.removeEventListener('pagehide', this.onPageHide);
    window.removeEventListener('pageshow', this.onPageShow);
    this.net.leave();
    if (this.initialised) {
      atlas.clear();
      this.app.destroy(true, { children: true });
    }
  }
}
