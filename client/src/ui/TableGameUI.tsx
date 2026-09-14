import { useEffect, useMemo, useState } from 'react';
import { C4_COLS, C4_ROWS, DOTS_EDGES, DOTS_N, REV_N, TABLE_GAMES, TABLE_GAME_KINDS, TableGameKind, TableState, legalMoves } from '@dovey/shared';
import { useAppStore } from '../store';
import { TableMatchView, tables, useTables } from '../tableGames';
import { VipModal } from './VipModal';
import { PlayersVs } from './PlayerVsCard';

/**
 * Game Den popups: the games menu, matchmaking, and the live board for
 * Connect Four, Tic-Tac-Toe, Reversi and Dots & Boxes. The server validates
 * every move; the board only offers legal ones and animates what changed.
 */
export function TableGameUI() {
  const phase = useTables((s) => s.phase);
  const kind = useTables((s) => s.kind);
  const match = useTables((s) => s.match);
  const ended = useTables((s) => s.ended);
  const theme = useAppStore((s) => s.room?.theme);
  const [showEnded, setShowEnded] = useState(false);

  useEffect(() => {
    if (!ended) return;
    setShowEnded(true);
    const t = setTimeout(() => setShowEnded(false), 2600);
    return () => clearTimeout(t);
  }, [ended]);

  if (phase === 'idle') {
    return (
      <>
        {theme === 'gameroom' && (
          <button className="tg-launch" onClick={() => useTables.getState().openMenu()} aria-label="board games">
            <span className="tg-launch__dice">🎲</span>
            <span>games</span>
          </button>
        )}
        {showEnded && <div className="tg-toast">{ended === 'left' ? 'your opponent left the table' : 'match ended'}</div>}
      </>
    );
  }

  const leaveNow = () => {
    if (phase === 'playing') tables.leave();
    else if (phase === 'queue') tables.cancel();
    else useTables.getState().close();
  };
  const live = phase === 'playing' && !!match && !match.over && !match.bot;
  const title =
    phase === 'playing' && match ? (
      <>
        {TABLE_GAMES[match.kind].icon} {TABLE_GAMES[match.kind].name}
        {match.round > 1 && <span className="tg__round">round {match.round}</span>}
      </>
    ) : phase !== 'menu' && kind ? (
      `${TABLE_GAMES[kind].icon} ${TABLE_GAMES[kind].name}`
    ) : (
      '🎲 game den'
    );

  return (
    <VipModal
      title={title}
      label="board game"
      live={live}
      onExit={leaveNow}
      exitLabel={live ? 'forfeit & exit' : phase === 'waiting' ? 'hide' : 'exit game'}
      wide={phase === 'playing'}
    >
      {phase === 'menu' && <GameMenu />}
      {(phase === 'queue' || phase === 'waiting') && kind && <Matchmaking kind={kind} waiting={phase === 'waiting'} />}
      {phase === 'playing' && match && <MatchView match={match} />}
    </VipModal>
  );
}

function GameMenu() {
  return (
    <>
      <p className="tg__sub">pick a game. sit at a table opposite someone, or jump in here.</p>
      <div className="tg-menu">
        {TABLE_GAME_KINDS.map((k, i) => (
          <div key={k} className={`tg-game tg-game--${k}`} style={{ animationDelay: `${i * 60}ms` }}>
            <GameArt kind={k} />
            <div className="tg-game__name">{TABLE_GAMES[k].name}</div>
            <div className="tg-game__blurb">{TABLE_GAMES[k].blurb}</div>
            <div className="tg-game__btns">
              <button className="btn btn--go" onClick={() => tables.queue(k)}>
                quick match
              </button>
              <button className="btn" onClick={() => tables.bot(k)}>
                vs bot
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/** little illustration for each game card */
function GameArt({ kind }: { kind: TableGameKind }) {
  if (kind === 'ttt')
    return (
      <div className="tg-art tg-art--ttt">
        {['x', 'o', '', '', 'x', 'o', '', '', 'x'].map((v, i) => (
          <i key={i}>{v === 'x' ? '✕' : v === 'o' ? '○' : ''}</i>
        ))}
      </div>
    );
  const cells: Record<Exclude<TableGameKind, 'ttt'>, number[]> = {
    c4: [0, 1, 0, -1, 1, 0, 1, 1, 0],
    reversi: [-1, 1, 0, -1, 0, 1, 1, 0, -1],
    dots: [0, -1, 1, 1, 0, -1, -1, 1, 0],
  };
  return (
    <div className={`tg-art tg-art--${kind}`}>
      {cells[kind].map((v, i) => (
        <i key={i} className={v < 0 ? '' : `p${v}`} />
      ))}
    </div>
  );
}

function Matchmaking({ kind, waiting }: { kind: TableGameKind; waiting: boolean }) {
  const g = TABLE_GAMES[kind];
  return (
    <div className="tg-wait">
      <div className="tg-wait__dice" aria-hidden>
        <span>🎲</span>
        <span>🎲</span>
      </div>
      <div className="tg__title">{waiting ? `${g.name} table` : `finding a ${g.name} player`}</div>
      <p className="tg__sub">
        {waiting ? 'waiting for someone to sit opposite you' : 'looking for someone in the room'}
        <span className="tg-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
      </p>
      <div className="tg__btns">
        <button className="btn btn--go" onClick={() => tables.bot(kind)}>
          🤖 play the bot
        </button>
        {!waiting && (
          <button className="btn" onClick={() => tables.cancel()}>
            cancel
          </button>
        )}
      </div>
      {waiting && <p className="tg__hint">stand up to leave the table</p>}
    </div>
  );
}

const SEAT_LABEL: Record<TableGameKind, [string, string]> = {
  c4: ['red', 'yellow'],
  ttt: ['✕', '○'],
  reversi: ['black', 'white'],
  dots: ['pink', 'blue'],
};

function MatchView({ match }: { match: TableMatchView }) {
  const status = useAppStore((s) => s.status);
  const prev = useTables((s) => s.prev);
  const s = match.state;
  const me = match.you;
  const them = me === 0 ? 1 : 0;
  const myTurn = !match.over && s.turn === me && status === 'connected';
  const legal = useMemo(() => new Set(myTurn ? legalMoves(s) : []), [s, myTurn]);
  const play = (m: number) => {
    if (legal.has(m)) tables.move(m);
  };
  const scored = match.kind === 'reversi' || match.kind === 'dots';
  const won = s.winner === me;
  const lost = s.winner === them;

  return (
    <>
      <PlayersVs
        left={{
          sessionId: match.seats?.[me] ?? '',
          name: 'you',
          active: !match.over && s.turn === me,
          score: scored ? s.score[me] : null,
          badge: <span className={`tg-token tg-token--${match.kind} p${me}`}>{match.kind === 'ttt' ? (me === 0 ? '✕' : '○') : ''}</span>,
        }}
        right={{
          sessionId: match.seats?.[them] ?? '',
          name: match.names[them],
          bot: match.bot,
          active: !match.over && s.turn === them,
          score: scored ? s.score[them] : null,
          badge: <span className={`tg-token tg-token--${match.kind} p${them}`}>{match.kind === 'ttt' ? (them === 0 ? '✕' : '○') : ''}</span>,
        }}
      />

      {!match.over && (
        <div className={`tg-turn ${myTurn ? 'tg-turn--me' : ''}`}>
          <span>{myTurn ? 'your turn' : status !== 'connected' ? 'reconnecting…' : `${match.names[them]} is thinking…`}</span>
          <TurnTimer key={`${match.id}:${match.round}:${s.moves}`} endsAt={match.turnEndsAt} />
        </div>
      )}

      <div className={`tg-board-wrap ${myTurn ? 'tg-board-wrap--live' : ''}`}>
        {match.kind === 'c4' && <ConnectFour s={s} legal={legal} onPlay={play} />}
        {match.kind === 'ttt' && <TicTacToe s={s} legal={legal} onPlay={play} />}
        {match.kind === 'reversi' && <Reversi s={s} prev={prev} legal={legal} onPlay={play} />}
        {match.kind === 'dots' && <DotsBoxes s={s} legal={legal} onPlay={play} />}
      </div>

      {match.over && (
        <div className={`tg-result ${won ? 'tg-result--win' : lost ? 'tg-result--lose' : ''}`}>
          {won && <Confetti />}
          <div className="tg-result__title">{won ? '🏆 you win!' : lost ? `${match.names[them]} wins` : "it's a draw"}</div>
          <div className="tg-result__sub">{won ? `+${match.bot ? 5 : 15} coins` : lost ? 'so close. run it back?' : 'evenly matched'}</div>
          <div className="tg__btns">
            <button className="vip__btn" disabled={match.rematch[me] || status !== 'connected'} onClick={() => tables.rematch()}>
              {match.rematch[me] ? (match.rematch[them] ? 'starting…' : 'waiting for them…') : match.rematch[them] ? 'accept rematch' : 'rematch'}
            </button>
          </div>
        </div>
      )}
      {!match.over && <p className="tg__hint">you play {SEAT_LABEL[match.kind][me]}</p>}
    </>
  );
}

function TurnTimer({ endsAt }: { endsAt: number }) {
  const left = Math.max(0, endsAt - performance.now());
  return (
    <div className="tg-timer">
      <i style={{ animationDuration: `${left}ms` }} />
    </div>
  );
}

function Confetti() {
  const bits = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.4,
        dur: 1.2 + Math.random() * 0.9,
        rot: Math.random() * 720 - 360,
        col: ['#ff5f7e', '#ffd23f', '#3ec6ff', '#7cf29a', '#c49bff'][i % 5],
      })),
    [],
  );
  return (
    <div className="tg-confetti" aria-hidden>
      {bits.map((b, i) => (
        <i key={i} style={{ left: `${b.left}%`, background: b.col, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s`, ['--rot' as string]: `${b.rot}deg` }} />
      ))}
    </div>
  );
}

interface BoardProps {
  s: TableState;
  legal: Set<number>;
  onPlay: (m: number) => void;
}

function ConnectFour({ s, legal, onPlay }: BoardProps) {
  const [hover, setHover] = useState(-1);
  const win = new Set(s.line);
  return (
    <div className="c4" onMouseLeave={() => setHover(-1)}>
      <div className="c4__drops">
        {Array.from({ length: C4_COLS }, (_, c) => (
          <i key={c} className={`c4__ghost p${s.turn} ${hover === c && legal.has(c) ? 'on' : ''}`} />
        ))}
      </div>
      <div className="c4__grid">
        {Array.from({ length: C4_COLS }, (_, c) => (
          <button
            key={c}
            className={`c4__col ${legal.has(c) ? 'c4__col--legal' : ''}`}
            onClick={() => onPlay(c)}
            onMouseEnter={() => setHover(c)}
            disabled={!legal.has(c)}
            aria-label={`drop in column ${c + 1}`}
          >
            {Array.from({ length: C4_ROWS }, (_, r) => {
              const i = r * C4_COLS + c;
              const v = s.board[i];
              return (
                <span key={r} className="c4__hole">
                  {v >= 0 && <i key={`${i}:${v}`} className={`c4__disc p${v} ${i === s.last ? 'drop' : ''} ${win.has(i) ? 'win' : ''}`} style={{ ['--rows' as string]: r + 1 }} />}
                </span>
              );
            })}
          </button>
        ))}
      </div>
    </div>
  );
}

function TicTacToe({ s, legal, onPlay }: BoardProps) {
  const win = new Set(s.line);
  return (
    <div className="ttt">
      {s.board.map((v, i) => (
        <button key={i} className={`ttt__cell ${win.has(i) ? 'win' : ''} ${legal.has(i) ? 'ttt__cell--legal' : ''}`} onClick={() => onPlay(i)} disabled={!legal.has(i)} aria-label={`cell ${i + 1}`}>
          {v === 0 && (
            <svg viewBox="0 0 40 40" className={`ttt__mark p0 ${i === s.last ? 'draw' : ''}`}>
              <path d="M10 10 L30 30" />
              <path d="M30 10 L10 30" />
            </svg>
          )}
          {v === 1 && (
            <svg viewBox="0 0 40 40" className={`ttt__mark p1 ${i === s.last ? 'draw' : ''}`}>
              <circle cx="20" cy="20" r="11" />
            </svg>
          )}
        </button>
      ))}
    </div>
  );
}

function Reversi({ s, prev, legal, onPlay }: BoardProps & { prev: TableState | null }) {
  const flipped = new Set(prev ? s.changed : []);
  return (
    <div className="rev" style={{ gridTemplateColumns: `repeat(${REV_N}, 1fr)` }}>
      {s.board.map((v, i) => (
        <button key={i} className={`rev__cell ${legal.has(i) ? 'rev__cell--legal' : ''}`} onClick={() => onPlay(i)} disabled={!legal.has(i)} aria-label={`square ${i + 1}`}>
          {v >= 0 && <i key={`${i}:${v}`} className={`rev__disc p${v} ${flipped.has(i) ? 'flip' : ''} ${i === s.last ? 'place' : ''}`} />}
          {v < 0 && legal.has(i) && <b className="rev__hint" />}
        </button>
      ))}
    </div>
  );
}

function DotsBoxes({ s, legal, onPlay }: BoardProps) {
  const [hover, setHover] = useState(-1);
  const gap = 80 / DOTS_N;
  const H = (DOTS_N + 1) * DOTS_N;
  const edge = (e: number) => {
    if (e < H) {
      const r = Math.floor(e / DOTS_N);
      const c = e % DOTS_N;
      return { x1: 10 + c * gap, y1: 10 + r * gap, x2: 10 + (c + 1) * gap, y2: 10 + r * gap };
    }
    const k = e - H;
    const r = Math.floor(k / (DOTS_N + 1));
    const c = k % (DOTS_N + 1);
    return { x1: 10 + c * gap, y1: 10 + r * gap, x2: 10 + c * gap, y2: 10 + (r + 1) * gap };
  };
  const closed = new Set(s.changed);
  return (
    <svg className="dots" viewBox="0 0 100 100" onMouseLeave={() => setHover(-1)}>
      {s.board.map((v, b) => {
        if (v < 0) return null;
        const r = Math.floor(b / DOTS_N);
        const c = b % DOTS_N;
        return <rect key={`${b}:${v}`} className={`dots__box p${v} ${closed.has(b) ? 'pop' : ''}`} x={10 + c * gap + 1.5} y={10 + r * gap + 1.5} width={gap - 3} height={gap - 3} rx={2.5} />;
      })}
      {Array.from({ length: DOTS_EDGES }, (_, e) => {
        const p = edge(e);
        const owner = s.edges[e];
        return (
          <g key={e}>
            {owner >= 0 && <line {...p} className={`dots__edge p${owner} ${e === s.last ? 'draw' : ''}`} />}
            {owner < 0 && hover === e && legal.has(e) && <line {...p} className={`dots__edge dots__edge--ghost p${s.turn}`} />}
            {owner < 0 && (
              <line {...p} className={`dots__hit ${legal.has(e) ? 'on' : ''}`} onMouseEnter={() => setHover(e)} onClick={() => onPlay(e)} role="button" aria-label={`line ${e + 1}`} />
            )}
          </g>
        );
      })}
      {Array.from({ length: (DOTS_N + 1) * (DOTS_N + 1) }, (_, i) => (
        <circle key={i} className="dots__dot" cx={10 + (i % (DOTS_N + 1)) * gap} cy={10 + Math.floor(i / (DOTS_N + 1)) * gap} r={1.9} />
      ))}
    </svg>
  );
}
