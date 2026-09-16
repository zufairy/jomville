import { useEffect, useRef, useState } from 'react';
import { HANDLE, RARITY_LABEL, furnitureDef, itemDef } from '@dovey/shared';
import { attachGame, detachGame } from './game/instance';
import { useAppStore } from './store';
import { ChatBar } from './ui/ChatBar';
import { ChatFeed } from './ui/ChatFeed';
import { ItemInfo } from './ui/ItemInfo';
import { EmoteWheel } from './ui/EmoteWheel';
import { Customizer } from './ui/Customizer';
import { BuildBar } from './ui/BuildBar';
import { RoomBar } from './ui/RoomBar';
import { RoomBrowser } from './ui/RoomBrowser';
import { ProfileSheet } from './ui/ProfileSheet';
import { CallUI } from './ui/CallUI';
import { FriendCallWindow } from './ui/FriendCallWindow';
import { FriendCallPopup } from './ui/FriendCallPopup';
import { AdultGate } from './ui/AdultGate';
import { LoveMeterUI } from './ui/LoveMeterUI';
import { ShopSheet } from './ui/ShopSheet';
import { StyleSheet } from './ui/StyleSheet';
import { DuelUI } from './ui/DuelUI';
import { TradeWindow } from './ui/TradeWindow';
import { TableGameUI } from './ui/TableGameUI';
import { KitchenLobby } from './ui/KitchenLobby';
import { KitchenRoundUI } from './ui/KitchenRound';
import { Landing } from './ui/Landing';
import { Onboarding } from './ui/Onboarding';
import { FurniturePreview } from './ui/FurniturePreview';
import { VendingSheet, Showcase } from './ui/VendingSheet';
import { JukeboxSheet } from './ui/JukeboxSheet';
import { CoinIcon, Icon } from './ui/Icon';
import { routeFromPath } from './router';
import { useFriends } from './friends';
import { FriendsSheet } from './ui/FriendsSheet';
import { FriendInvitePopup } from './ui/FriendInvitePopup';
import { GoogleButton } from './ui/GoogleButton';
import { AvatarPreview } from './ui/AvatarPreview';
import { confirmCreditPurchase, fetchInventory, fetchMe, fetchWardrobe, patchMe } from './api';
import { clearDeviceToken } from './identity';

const ROUTE = routeFromPath();
/** credits pill is hidden until the economy is ready to show */
const SHOW_COINS = false;
const PROFILE_STATES = [
  'Johor',
  'Kedah',
  'Kelantan',
  'Melaka',
  'Negeri Sembilan',
  'Pahang',
  'Penang',
  'Perak',
  'Perlis',
  'Sabah',
  'Sarawak',
  'Selangor',
  'Terengganu',
  'Kuala Lumpur',
  'Labuan',
  'Putrajaya',
  'Overseas',
];


export function App() {
  if (ROUTE.kind === 'landing') return <Landing />;
  return <Play />;
}

function Play() {
  const [entered, setEntered] = useState(ROUTE.kind === 'room');
  const [checking, setChecking] = useState(true);
  const me = useAppStore((s) => s.me);
  const adoptMe = useAppStore((s) => s.adoptMe);

  useEffect(() => {
    let alive = true;
    void fetchMe()
      .then((m) => {
        if (alive) adoptMe(m);
      })
      .finally(() => {
        if (alive) setChecking(false);
      });
    return () => {
      alive = false;
    };
  }, [adoptMe]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const sessionId = params.get('session_id');
    if (params.get('credits') !== 'success' || !sessionId) return;
    let alive = true;
    void confirmCreditPurchase(sessionId).then((r) => {
      if (!alive) return;
      if ('error' in r) useAppStore.getState().flash(r.error);
      else {
        useAppStore.getState().setCredits(r.coins);
        useAppStore.getState().flash(r.granted ? 'credits added' : 'credits already added');
      }
      history.replaceState(null, '', location.pathname);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (checking && !me) return <PlayBoot />;
  if (!me?.linked) return <GoogleGate />;
  if (!me.onboarded) return <Onboarding />;
  if (!entered) return <ProfileLobby onEnter={() => setEntered(true)} />;
  return <GameShell />;
}

function GameShell() {
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
  const friendsOpen = useFriends((s) => s.open);
  const incomingFriends = useFriends((s) => s.incoming.length);

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
          <button
            className={`hud__btn ${friendsOpen ? 'hud__btn--on' : ''}`}
            onClick={() => useFriends.getState().setOpen(!friendsOpen)}
            aria-label={incomingFriends ? `friends, ${incomingFriends} requests` : 'friends'}
            title="friends"
          >
            <Icon name="friends" />
            {incomingFriends > 0 && <span className="hud__badge">{incomingFriends}</span>}
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
      <FriendCallWindow />
      <FriendCallPopup />
      <AdultGate />
      <DuelUI />
      <TradeWindow />
      <TableGameUI />
      <KitchenLobby />
      <KitchenRoundUI />
      <VendingSheet />
      <JukeboxSheet />
      <FriendInvitePopup />
      {needsOnboarding && <Onboarding />}
      {profile ? (
        <ProfileSheet />
      ) : friendsOpen ? (
        <FriendsSheet />
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
            <ItemInfo />
            <ChatBar />
          </div>
          <EmoteWheel />
        </div>
      )}
    </>
  );
}

function PlayBoot() {
  return (
    <div className="playgate">
      <div className="playgate__panel">
        <div className="boot__mark" />
        <h1>Opening Leypark…</h1>
      </div>
    </div>
  );
}

function GoogleGate() {
  return (
    <div className="playgate">
      <div className="playgate__panel playgate__panel--signin">
        <span className="playgate__eyebrow">Leypark account</span>
        <h1>Sign in with Google to play</h1>
        <p>Your avatar, room, friends, wardrobe and items stay with the same email every time you log in.</p>
        <GoogleButton />
      </div>
    </div>
  );
}

function ProfileLobby({ onEnter }: { onEnter: () => void }) {
  const me = useAppStore((s) => s.me)!;
  const avatar = useAppStore((s) => s.avatar);
  const inventory = useAppStore((s) => s.inventory);
  const instances = useAppStore((s) => s.instances);
  const wardrobe = useAppStore((s) => s.wardrobe);
  const coins = useAppStore((s) => s.coins);
  const friends = useFriends((s) => s.friends);
  const incoming = useFriends((s) => s.incoming.length);
  const setMe = useAppStore((s) => s.setMe);
  const [editing, setEditing] = useState(false);
  const [profileName, setProfileName] = useState(me.handle);
  const [profileState, setProfileState] = useState(me.state ?? '');
  const [profileBirthdate, setProfileBirthdate] = useState(me.birthdate ?? '');
  const [profileErr, setProfileErr] = useState<string | null>(null);

  useEffect(() => {
    void useFriends.getState().load();
    void fetchInventory().then((inv) => {
      if (!inv) return;
      const st = useAppStore.getState();
      st.setInventory(inv.items);
      st.setInstances(inv.instances);
      st.setCoins(inv.coins);
    });
    void fetchWardrobe().then((w) => {
      if (!w) return;
      const st = useAppStore.getState();
      st.setWardrobe(w.owned);
      st.setCredits(w.credits);
    });
  }, []);

  const itemTotal = Object.values(inventory).reduce((sum, n) => sum + n, 0) + instances.length;
  const online = friends.filter((f) => f.online);
  const rarityRank: Record<string, number> = { legendary: 4, epic: 3, rare: 2, common: 1, starter: 0 };
  const topItems = [
    ...(wardrobe ?? [])
      .filter((id) => itemDef(id))
      .map((id) => {
        const def = itemDef(id);
        return { id: `wardrobe:${id}`, defId: id, label: def?.name ?? id, qty: 1, kind: 'wardrobe', rarity: def?.rarity ?? 'common' };
      }),
    ...Object.entries(inventory).filter(([, qty]) => qty > 0).map(([def, qty]) => {
      const f = furnitureDef(def);
      return { id: `furni:${def}`, defId: def, label: f?.name ?? def, qty, kind: 'furniture', rarity: f?.rarity ?? 'common' };
    }),
    ...instances.map((item) => {
      const f = furnitureDef(item.def);
      return { id: `item:${item.id}`, defId: item.def, label: f?.name ?? item.def, qty: 1, kind: 'furniture', rarity: f?.rarity ?? 'common' };
    }),
  ].filter((item, index, all) => all.findIndex(other => other.kind === item.kind && other.defId === item.defId) === index).sort((a, b) => (rarityRank[b.rarity] ?? 0) - (rarityRank[a.rarity] ?? 0) || a.label.localeCompare(b.label))
    .slice(0, 3);

  const logout = () => {
    clearDeviceToken();
    useAppStore.getState().setMe(null);
    location.assign('/play');
  };

  return (
    <div className="profile-home">
      <header className="profile-home__hero">
        <div>
          <span className="playgate__eyebrow">YOUR NEXT GOOD TIME STARTS HERE</span>
          <h1>Hey, {me.handle}!</h1>
          <div className="profile-home__intro">Jom lepak. Your people are one room away.</div>
          <p>
            {me.email ? `${me.email} · ` : ''}{me.state}
            {me.birthdate ? ` · born ${me.birthdate}` : ''}
          </p>
        </div>
        <div className="profile-home__actions">
          <button className="profile-home__logout" type="button" onClick={() => setEditing(true)}>
            Edit profile
          </button>
          <button className="profile-home__logout" type="button" onClick={logout}>
            Logout
          </button>
          <div className="profile-home__avatar" aria-label="your avatar">
            <AvatarPreview cfg={avatar} scale={5} animate />
          </div>
        </div>
      </header>


      {editing && (
        <form
          className="profile-home__edit"
          onSubmit={async (e) => {
            e.preventDefault();
            const h = profileName.trim().toLowerCase();
            if (!HANDLE.test(h)) return setProfileErr('Name must be 3-16 letters, numbers or _');
            if (!profileState || !profileBirthdate) return setProfileErr('State and birthdate are required');
            const r = await patchMe({ handle: h, state: profileState, birthdate: profileBirthdate });
            if ('error' in r) return setProfileErr(r.error);
            setMe(r);
            setProfileErr(null);
            setEditing(false);
          }}
        >
          <label>Name<input value={profileName} maxLength={16} onChange={(e) => setProfileName(e.currentTarget.value)} /></label>
          <label>
            State
            <select value={profileState} onChange={(e) => setProfileState(e.currentTarget.value)}>
              <option value="">Choose your state</option>
              {PROFILE_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>Birthdate<input type="date" value={profileBirthdate} onChange={(e) => setProfileBirthdate(e.currentTarget.value)} /></label>
          {profileErr && <span>{profileErr}</span>}
          <button type="submit">Save profile</button>
          <button type="button" onClick={() => setEditing(false)}>Cancel</button>
        </form>
      )}

      <section className="profile-home__grid">
        <div className="profile-home__card profile-home__card--wide">
          <span className="profile-home__label">Friends online</span>
          <h2>{online.length ? `${online.length} ready to lepak` : 'No friends online yet'}</h2>
          <div className="profile-home__friends">
            {online.slice(0, 4).map((f) => (
              <span key={f.id}>{f.handle}</span>
            ))}
            {!online.length && <span>Enter the lobby and meet someone new.</span>}
          </div>
          {incoming > 0 && <p className="profile-home__note">{incoming} friend request waiting</p>}
        </div>

        <div className="profile-home__card">
          <span className="profile-home__label">Wardrobe</span>
          <h2>{wardrobe ? wardrobe.length : 0}</h2>
          <p>looks unlocked</p>
        </div>

        <div className="profile-home__card">
          <span className="profile-home__label">Items</span>
          <h2>{itemTotal}</h2>
          <p>{coins ?? 0} credits</p>
        </div>

        <div className="profile-home__card profile-home__card--wide">
          <span className="profile-home__label">Your things · Top 3</span>
          <h2>A little collection. A lot of you.</h2>
          <div className="profile-home__items">
            {topItems.length ? (
              topItems.map((item) => (
                <article key={item.id} className={`profile-home__thing profile-home__thing--${item.rarity}`}>
                  <div className="profile-home__item-art">{item.kind === 'wardrobe' ? <Showcase itemId={item.defId} /> : <FurniturePreview id={item.defId} />}</div>
                  <b>{item.label}</b>
                  <small>
                    {RARITY_LABEL[item.rarity as keyof typeof RARITY_LABEL] ?? item.rarity}
                    {item.qty > 1 ? ` · x${item.qty}` : ''}
                  </small>
                </article>
              ))
            ) : (
              <span>Start with your room, then collect furniture and outfits as you play.</span>
            )}
          </div>
        </div>
      </section>

      <button className="profile-home__enter" onClick={onEnter}>
        Let’s lepak  →
      </button>
    </div>
  );
}
