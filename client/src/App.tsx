import { useEffect, useRef } from 'react';
import { attachGame, detachGame } from './game/instance';
import { useAppStore } from './store';
import { ChatBar } from './ui/ChatBar';
import { ChatFeed } from './ui/ChatFeed';
import { EmoteWheel } from './ui/EmoteWheel';
import { Customizer } from './ui/Customizer';
import { BuildBar } from './ui/BuildBar';
import { RoomBar } from './ui/RoomBar';
import { RoomBrowser } from './ui/RoomBrowser';
import { ProfileSheet } from './ui/ProfileSheet';
import { CallUI } from './ui/CallUI';
import { LoveMeterUI } from './ui/LoveMeterUI';
import { ShopSheet } from './ui/ShopSheet';
import { StyleSheet } from './ui/StyleSheet';
import { DuelUI } from './ui/DuelUI';
import { TableGameUI } from './ui/TableGameUI';
import { Landing } from './ui/Landing';
import { Onboarding } from './ui/Onboarding';
import { VendingSheet } from './ui/VendingSheet';
import { CoinIcon, Icon } from './ui/Icon';
import { routeFromPath } from './router';

const ROUTE = routeFromPath();
/** credits pill is hidden until the economy is ready to show */
const SHOW_COINS = false;

export function App() {
  if (ROUTE.kind === 'landing') return <Landing />;
  return <Play />;
}

function Play() {
  const ref = useRef<HTMLDivElement>(null);
  const status = useAppStore((s) => s.status);
  const toast = useAppStore((s) => s.toast);
  const customizing = useAppStore((s) => s.customizing);
  const setCustomizing = useAppStore((s) => s.setCustomizing);
  const edit = useAppStore((s) => s.edit);
  const setEdit = useAppStore((s) => s.setEdit);
  const room = useAppStore((s) => s.room);
  const browsing = useAppStore((s) => s.browsing);
  const profile = useAppStore((s) => s.profile);
  const me = useAppStore((s) => s.me);
  const shopping = useAppStore((s) => s.shopping);
  const styling = useAppStore((s) => s.styling);
  const setShopping = useAppStore((s) => s.setShopping);
  const coins = useAppStore((s) => s.coins);
  const voiceMic = useAppStore((s) => s.voiceMic);
  const actions = useAppStore((s) => s.actions);
  const cameraFree = useAppStore((s) => s.cameraFree);
  const needsOnboarding = !!me && !me.onboarded;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    attachGame(el);
    return () => detachGame();
  }, []);

  return (
    <>
      <div ref={ref} className="stage" style={{ position: 'absolute', inset: 0 }} />
      <RoomBar />
      <div className="hud">
        {SHOW_COINS && coins !== null && (
          <span className="coin" aria-label={`${coins} coins`}>
            <CoinIcon />
            {coins}
          </span>
        )}
        <div className="tray">
          <button
            className={`hud__btn ${voiceMic ? 'hud__btn--live' : ''}`}
            onClick={() => actions?.toggleVoice()}
            disabled={status !== 'connected'}
            aria-pressed={voiceMic}
            aria-label={voiceMic ? 'close mic' : 'open mic, people nearby hear you'}
            title={voiceMic ? 'mic open: people nearby hear you' : 'open mic for people nearby'}
          >
            <Icon name={voiceMic ? 'mic' : 'micOff'} />
          </button>
          <i className="tray__sep" />
          <button
            className={`hud__btn ${customizing ? 'hud__btn--on' : ''}`}
            onClick={() => setCustomizing(!customizing)}
            aria-label="customize avatar"
            title="wardrobe"
          >
            <Icon name="shirt" />
          </button>
          <button
            className={`hud__btn ${shopping ? 'hud__btn--on' : ''}`}
            onClick={() => setShopping(!shopping)}
            aria-label="shop"
            title="shop"
          >
            <Icon name="bag" />
          </button>
          {room?.isOwner && (
            <button
              className={`hud__btn ${edit.on ? 'hud__btn--on' : ''}`}
              onClick={() => {
                setCustomizing(false);
                setEdit(edit.on ? { on: false } : { on: true, placing: null, placingItem: null, selected: null, moving: false });
              }}
              aria-label="build"
              title="build"
            >
              <Icon name="hammer" />
            </button>
          )}
        </div>
      </div>
      {toast && <div className="toast">{toast}</div>}
      {cameraFree && (
        <button
          className="recenter-btn"
          onClick={() => actions?.recenter()}
          aria-label="recenter camera"
          title="recenter"
        >
          🎯
        </button>
      )}
      <LoveMeterUI />
      <CallUI />
      <DuelUI />
      <TableGameUI />
      <VendingSheet />
      {needsOnboarding && <Onboarding />}
      {profile ? (
        <ProfileSheet />
      ) : shopping ? (
        <ShopSheet />
      ) : styling ? (
        <StyleSheet />
      ) : browsing ? (
        <RoomBrowser />
      ) : customizing ? (
        <Customizer />
      ) : edit.on ? (
        <BuildBar />
      ) : (
        <div className="bottom">
          <div className="bottom__stack">
            <ChatFeed />
            <ChatBar />
          </div>
          <EmoteWheel />
        </div>
      )}
    </>
  );
}
