# Duel HD Implementation Plan (part 7 of 7: Task 16, full verification and manual check)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Header, Global Constraints and File Map: `docs/superpowers/plans/2026-09-14-duel-hd.md`. Spec: `docs/superpowers/specs/2026-09-14-duel-hd-design.md`. Tasks 1-15 must be done first. Client tests run in vitest's **node** environment (no DOM); every unit-tested client module is pure TypeScript.

---

## Task 16: Full verification and a manual desktop browser check

**Files:**
- None created. Fix-ups found here go in the file that owns the problem; commit them separately.

**Interfaces:**
- Consumes: everything above.
- Produces: a verified build; the notes of the manual pass go in the final report, not in a file.

- [ ] **Step 1: All suites and types**

Run: `pnpm test && pnpm typecheck`
Expected: shared, server and client vitest runs all pass (new files: `shared/src/duel.test.ts`, `server/src/db.transaction.test.ts`, `server/src/duel.test.ts`, `server/src/repo.duel.test.ts`, `client/src/ui/duel/duelFlow.test.ts`, `stakes.test.ts`, `useDuelTimeline.test.ts`, `client/src/game/duelFx.test.ts`). Every `tsc --noEmit` is clean.

- [ ] **Step 2: Guard the files owned by the other session**

Run:
```bash
git log --format='%h %s' -- client/src/styles.css client/src/ui/ChatBar.tsx client/src/ui/ChatFeed.tsx server/src/bots.ts server/src/bots.test.ts client/src/ui/VendingSheet.tsx client/src/ui/Customizer.tsx client/src/wear.ts | head -20
```
Expected: none of the commit subjects from Tasks 1-15 (`feat(server): Db.transaction…`, `feat(client): duel…`, `test(duel): …`) appear.

- [ ] **Step 3: Build the client and serve it from 2597 through a symlink**

The worktree path contains `/.claude/`, and express `sendFile` 404s on dot segments, so serve the build through a symlink:
```bash
pnpm build
ln -sfn "$(pwd)/client/dist" "$TMPDIR/dovey-duel-dist"
rm -rf "$TMPDIR/dovey-duel-pg"
(PORT=2597 PGLITE_DIR="$TMPDIR/dovey-duel-pg" CLIENT_DIST="$TMPDIR/dovey-duel-dist" pnpm start > "$TMPDIR/dovey-duel-server.log" 2>&1 &)
for i in $(seq 1 60); do curl -sf http://localhost:2597/ > /dev/null && break; sleep 1; done; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:2597/r/gameden
```
Expected: `200`, and the log contains `[dovey] serving client from …/dovey-duel-dist`.

- [ ] **Step 4: Manual pass (desktop Chrome, two windows)**

Open `http://localhost:2597/r/gameden` in a normal window (player A) and in a private window (player B), so the two get different device tokens. Finish onboarding in both. Tick each item:

1. **Stake picker:**
   - [ ] In A, tap B's avatar → "challenge to a duel". The picker shows chips free/25/50/100/250/500, and the chips above A's balance are disabled.
   - [ ] The pot line updates per chip; "send challenge" sends.
2. **Invite:**
   - [ ] B's popup shows the gold stake badge "stake 50 · pot 100".
   - [ ] Accept is enabled. A shows "waiting for … to accept" with animated dots.
   - [ ] Both fighters stand full body, crisp pixel art (no blur), left facing right and right facing left.
3. **Arena:**
   - [ ] After accept, the HUD shows empty pips, ROUND 1 and POT 100, and the timer ring counts down from 20.
   - [ ] The hand buttons are SVG hands (no emoji). Hovering lifts the icon; keys 1/2/3 and R/P/S pick.
4. **Locked pick:**
   - [ ] A picks: A's button glows and the others dim. "locked in" shows at centre and thinking dots appear over B's fighter.
5. **Reveal** (both picked; watch it twice):
   - [ ] The ROCK/PAPER/SCISSORS words beat with pumping fists and three rising ticks.
   - [ ] SHOOT! slams the real hands to the centre with a whoosh.
   - [ ] A white flash, gold sparks and a small screen shake follow, with the clash sound.
   - [ ] The winner's hand pushes through while the loser's hand cracks and flies off.
   - [ ] The winning fighter lunges; the losing fighter flashes red, knocks back and shows a "-1" pop.
   - [ ] A round caption shows. The whole reveal takes about 2 s.
   - [ ] Throw the same hand in both windows once: the hands bump and a grey DRAW stamp lands.
   - [ ] The next round's ring starts only after the reveal ends and shows ≈18 s.
6. **Result:**
   - [ ] **Winner:** VICTORY, a bouncing fighter, confetti, a coin shower, and the counter rising to +100 with coin ticks and a fanfare. "net +50 coins" shows in green.
   - [ ] **Loser:** DEFEAT, a slumped fighter, and "net -50 coins".
   - [ ] "back to room" closes. The coin pills in the room UI match the result.
   - [ ] The world emote pops over the local player after each round.
7. **Forfeit:** start a staked duel, then in B press "forfeit & exit" → "leave". A goes to VICTORY with "… walked out: the pot is yours".
8. **Insufficient:** lower B below the stake by buying in the shop, then challenge B for more than B has. B's accept is disabled and "not enough coins" shows.
9. **Locals:** in `http://localhost:2597/r/mainlobby`, open a local's profile → the picker enables only "free" and shows the note.
10. **Sound:** the speaker toggle in the arena header mutes every sound. Reload: it stays muted. Unmute.
11. **Reduced motion** (DevTools → Rendering → Emulate CSS `prefers-reduced-motion: reduce`):
    - [ ] No shake, sparks, confetti or keyframe motion.
    - [ ] The words, stamp, captions, result and timer ring still work, and the flow still advances.
12. **Mobile width** (DevTools device toolbar, 400×800):
    - [ ] The card is full screen and the stage sits above the hand row.
    - [ ] Hand buttons are ≥96 px (inspect the computed size), fighters are 128 px, and nothing overflows horizontally.
    - [ ] The footer clears the bottom safe area.

For each failure, fix the owning file (`duel.css`, `DuelArena.tsx`, `HandIcon.tsx`, `audio.ts`), re-run `pnpm --filter @dovey/client typecheck && pnpm --filter @dovey/client test && pnpm build`, and re-check the item.

- [ ] **Step 5: Stop the server and remove the symlink**

Run: `lsof -ti tcp:2597 | xargs kill; rm -f "$TMPDIR/dovey-duel-dist"; lsof -ti tcp:2597 || echo stopped`
Expected: `stopped`

- [ ] **Step 6: Commit any fix-ups from the manual pass**

Only if Step 4 changed files:
```bash
git add client/src/ui/duel client/src/audio.ts client/src/game/duelFx.ts
git commit -F - <<'MSG'
fix(client): duel arena polish from the manual browser pass

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VVar73yCd7djZuRCdn4MzF
MSG
```
