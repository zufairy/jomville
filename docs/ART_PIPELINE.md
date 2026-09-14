# Avatar & item art pipeline

Goal: premium paper-doll avatars (Habbo-class polish) where head, eyes, hair,
shirt, pants, hat, face item and back item are all separate sprite sheets,
composited by the engine, with eyes animating independently (blink, expressions)
and whole-body actions (wave, dance, sit).

Today the engine draws every part procedurally (`client/src/game/sprites.ts`).
That is the placeholder. The engine already composites layers per frame, keeps
eyes and face items on separate overlays, and bakes one texture per look. The
only change real art needs is: read PNG sheets instead of drawing paths.

---

## 1. The contract (what every sheet must follow)

| thing | value |
|---|---|
| frame size | 64 x 80 logical px, authored at 2x = **128 x 160 px** (retina) |
| feet anchor | (32, 78) logical, (64, 156) px. Every part is placed in the same frame, so parts align by construction. |
| facings | 3 rows: **down, right, up**. Left = right mirrored by the engine (do not draw it). |
| walk | 8 frames per facing. Frame 0 is the idle pose. |
| idle breathe | engine squashes Y by 1.2%, no frames needed |
| actions (optional) | extra rows: `wave` 6f, `dance` 8f, `sit` 1f, `jump` 6f. Same 3 facings. |
| outline | 3 px ink `#3b2a2a` at 2x. Flat colours from the 32-colour palette (`shared/src/avatar.ts`). No gradients, no soft shadow. Cheek blush allowed. |
| head | circle-ish, centre (32, 25) logical, radius ~17. Big head, small body (chibi 1:2.2). |
| eyes | NOT on the body/head sheet. Separate eye sheet, see §2. |
| face items | separate sheet, drawn above eyes (glasses, shades, mask, patch). |
| body types | `masc`, `fem` share head/hair/hat/face/eyes/back; differ in torso/legs/outfit sheets. |

Sheet layout for a body-anchored part (one PNG per part id):

```
row 0: down  [f0 f1 f2 f3 f4 f5 f6 f7]
row 1: right [f0 ... f7]
row 2: up    [f0 ... f7]
row 3+: actions, in manifest order
```

PNG size for walk-only part: 8 x 128 = **1024 px wide**, 3 x 160 = **480 px tall**.

### Layer order (bottom to top)
`back(behind) → hair(back) → legs/pants → torso/outfit → arms → head → eyes → face item → hair(front) → hat → back(front, only when facing up)`

Hair has two sheets: `hair_back` (drawn behind head) and `hair_front`.
Back items have two sheets too: `back_behind` (down/right) and `back_front` (up).

### Eye sheet (§2)
Eyes are a small strip glued to the head. Box: **40 x 24 logical (80 x 48 px)**,
origin at frame (12, 19). Two rows (down, right). Columns, in this order:

`open, half, closed, happy, surprised, sad, heart, wink`

The engine plays blink (`half→closed→half→open`) every 2–6 s and swaps to an
expression for ~2 s when an emote fires. Eye *style* is a config choice
(`round`, `wide`, `sleepy`, `happy`), so ship one eye sheet per style per skin
tone if the white/outline needs tinting, otherwise one per style.

### Face-item sheet
Box **64 x 40 logical (128 x 80 px)**, origin at frame (0, 7). Rows: down, right.

### Manifest
One JSON per part, next to the PNG:

```json
{
  "id": "outfit.hoodie",
  "slot": "outfit",
  "sheet": "outfit.hoodie.png",
  "frame": [128, 160],
  "anchor": [64, 156],
  "facings": ["down", "right", "up"],
  "anims": { "walk": { "row": 0, "frames": 8, "fps": 12 }, "wave": { "row": 3, "frames": 6, "fps": 10 } },
  "tint": "outfitColour",
  "bodyTypes": ["masc", "fem"]
}
```

`tint` = which config colour recolours the sheet. Author tintable parts in
**pure grey ramps** (e.g. #ffffff / #c8c8c8 / #8c8c8c) so a multiply tint gives
clean flat colours. Non-tintable parts (crown, halo) ship in final colours.

Drop files under `client/public/avatar/<slot>/`. The loader (to write, §5) reads
`client/public/avatar/manifest.json` listing all parts and falls back to the
procedural drawer for any part that is missing, so art can land one piece at a time.

---

## 2. Where the art comes from (pick one, or mix)

**A. Buy a layered base and extend it (fastest to premium).**
- *Mana Seed Character Base* by Seliel the Shaper (itch.io, ~$20). Purpose-built
  paper-doll base with hundreds of layered hair/outfit sheets, 4 facings, walk,
  run, sit, actions. Licence allows commercial use; no redistribution of raw files.
  Frame is 32 x 32 / 64 x 64; we would upscale 2x and re-anchor. Style is
  pixel, warm, cute. Closest to what you described.
- *LPC (Liberated Pixel Cup) character sprites* (free, CC-BY-SA 3.0 / GPL). Huge
  layered library, 64 x 64 frames, walk/slash/cast/etc. Style is more RPG than
  Habbo; needs recolouring to the palette and attribution on the site.
- *Sunnyside World* (itch.io, paid). Very polished but not layered per slot.

**B. Commission.** Brief an artist with §1 verbatim plus 5 reference images.
Ask for: 1 body per type, 8 hair, 6 outfits, 4 pants, 6 hats, 4 face, 4 back,
8 eye states x 4 styles. ~60 sheets. Budget €1.5–4k for a strong pixel/vector
artist. Best result, slowest.

**C. AI generation (Google Flow / Imagen 3, Midjourney, Stable Diffusion + a
sprite-sheet LoRA).** Good for *concepts, single poses, hats and props*. Weak at
consistent 8-frame walk cycles and exact pixel alignment. Realistic workflow:
1. Generate the *character concept* and each *item* as a single front-facing
   image on a flat background (prompts in §3).
2. Clean up in Aseprite/Photoshop: remove background, snap to palette, redraw the
   outline at 3 px, place on the 128 x 160 template.
3. Animate by hand (Aseprite) or use a bone tool (Spine / DragonBones / Rive) on
   the cleaned parts and export frames. Walk cycle: 8 frames = 4 keys + tweens.
4. Side and back views: generate with "same character, side view, character
   sheet" prompts, then fix by hand. Expect 30–50% manual work.

Recommendation: **A for the base body + walk cycles, C for hats/face/back items
and room props, B later for the weekly-rare cosmetics** (that is where premium
matters most and where a human artist's signature sells).

---

## 3. Prompts

Use one *style anchor* paragraph in every prompt so the whole set matches.

**Style anchor**
> chibi character for a cute isometric social game, big round head, tiny body,
> thick dark brown outline (#3b2a2a), flat pastel colours, no gradients, no
> shading except a tiny cheek blush, clean vector-like edges, warm cream
> background (#f6ecd9), centered, full body, front view, no text, no watermark

**Character base (per body type)**
> {style anchor}. A friendly {masculine|feminine} chibi with plain skin tone
> #ffd6a5, no hair, no clothes except plain grey tee (#c8c8c8) and grey shorts
> (#8c8c8c), standing, arms relaxed. Character sheet: front, side, back views
> side by side, same proportions.

**Walk cycle (only if you insist on AI frames)**
> {style anchor}. Sprite sheet, 8 frames of a walk cycle in one row, same
> character every frame, feet on the same baseline, evenly spaced, side view,
> pixel-perfect alignment.

**Hair (one per style)**
> {style anchor}. Only the hair: {short crop | long straight to shoulders |
> high bun | spiky | bob with fringe | ponytail | big curly}. Pure grey ramp
> (#ffffff highlights, #c8c8c8 base, #8c8c8c shade) so it can be tinted. Front,
> side and back views on transparent background, nothing else in frame.

**Outfit**
> {style anchor}. Only the torso garment: {hoodie with front pocket and
> drawstrings | striped tee | overalls with gold buttons | A-line dress |
> varsity jacket}. Grey ramp for tint. Front, side, back. Transparent background.

**Hat**
> {style anchor}. Only the hat, sized for a big chibi head: {baseball cap with
> curved brim | beanie with pom | gold crown with one gem | daisy tucked behind
> ear | glowing halo}. Front, side, back. Transparent background.

**Face item / back item** — same pattern: "only the {round glasses | black
shades | surgical mask | eyepatch}", "only the {feathered white wings | red cape
| small backpack | balloon on a string}".

**Eye states (per style)**
> {style anchor}. Only a pair of big cartoon eyes on transparent background, one
> row of 8 states: open, half-closed, closed, happy squint, surprised wide,
> sad, heart-shaped, wink. Same size and spacing every state.

**Furniture / room props**
> isometric game prop, 2:1 isometric grid, 64 x 32 px tile, thick dark outline,
> flat pastel colours, no gradients, {cozy armchair | round table with lamp |
> potted monstera | arcade cabinet | capsule gacha machine}, front-left facing,
> transparent background.

Negative prompt (SD/MJ): `realistic, gradient, soft shading, blur, text,
watermark, multiple characters, cropped, extra limbs, 3d render`.

Google Flow tip: generate at 1024 px, set "flat illustration" style, keep the
seed for all items in one set, and paste the style anchor first every time.

---

## 4. Manual workflow (what actually makes it look premium)

1. Template: a 128 x 160 PNG with the head circle, feet line, and eye box drawn
   as guides. Author every part on top of it. (Guide: head centre (64, 50) px,
   radius 34; eye box (24, 38)-(104, 86); feet line y = 156.)
2. Outline last, always 3 px, always the same ink. Outline is what makes
   different artists' parts read as one set.
3. Colours: snap to the 32-colour palette. Use the 3-step grey ramp for anything
   tintable.
4. Silhouette test: shrink the frame to 32 x 40. If the hat/back item is not
   readable there, thicken it. Rarity must read across a crowded room.
5. Export: one PNG per part per body type, plus manifest. Run
   `pnpm --filter client check:sheets` (to write) which validates size, anchor,
   and transparent margins.

---

## 5. Engine changes to accept real sheets (next step, ~1 day)

- `client/src/game/partSheets.ts`: load `manifest.json`, `Assets.load` each PNG,
  cache per part id. Tint by drawing the grey sheet to a canvas and multiplying
  with the config colour (keeps outline dark).
- `getSpriteSet(cfg)` becomes: for each layer in order, `drawImage` the part's
  frame for (facing, frame) into the baked canvas; fall back to the procedural
  drawer for parts without a sheet. Eyes and face items keep their own overlays
  exactly as now.
- Actions: `Avatar.play('wave')` selects the action row when the part has it;
  parts without the row hold frame 0 so partial art still animates.
- Customizer preview and landing parade use the same `drawSheet`, so they get
  real art for free.

Nothing above changes the server or the config format: item ids stay
`slot.key`, colours stay palette indices.
