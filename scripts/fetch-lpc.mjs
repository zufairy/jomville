/**
 * Builds the avatar art pack: downloads a curated subset of the Universal LPC
 * Spritesheet collection, crops each sheet down to the walk rows, and writes
 * client/public/lpc/ plus a manifest the client loader reads.
 *
 * Art licence: CC-BY-SA 3.0 / GPL 3.0 (see client/public/lpc/CREDITS.md).
 * Source: github.com/sanderfrenken/Universal-LPC-Spritesheet-Character-Generator
 *
 * LPC "universal" sheets are 64px frames, 13 columns. Walk occupies rows 8..11
 * (north, west, south, east) with 9 frames each; frame 0 is the standing pose.
 * We keep only those 4 rows, which drops ~90% of the bytes.
 *
 *   node scripts/fetch-lpc.mjs
 */
import { mkdir, writeFile, readFile, access, readdir, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';

const REPO = 'sanderfrenken/Universal-LPC-Spritesheet-Character-Generator';
const RAW = `https://raw.githubusercontent.com/${REPO}/master`;
const OUT = new URL('../client/public/lpc/', import.meta.url).pathname;
const CACHE = '/tmp/lpc-cache';

const FRAME = 64;
const WALK_ROW = 8;
const WALK_ROWS = 4;
const WALK_FRAMES = 9;

/**
 * Curated catalog. `dir` is a directory under spritesheets/ that contains
 * `<sex>/<variant>.png`. Variants and body types are discovered from the repo
 * tree, so a path that moves upstream fails loudly instead of silently.
 */
const CATALOG = [
  { slot: 'body', id: 'body', name: 'body', dir: 'body/bodies', z: 10, base: true },
  { slot: 'head', id: 'head', name: 'head', dir: 'head/heads/human', z: 100, base: true },
  { slot: 'eyes', id: 'eyes', name: 'eyes', dir: 'eyes/human/adult', z: 105, base: true, flat: true },

  ...[
    ['afro', 'afro'], ['bob', 'bob'], ['bob_side_part', 'side bob'], ['braid', 'braid'], ['bunches', 'bunches'],
    ['buzzcut', 'buzzcut'], ['curly_long', 'long curls'], ['curly_short', 'short curls'], ['cornrows', 'cornrows'],
    ['long_straight', 'long straight'], ['long_messy', 'long messy'], ['messy1', 'messy'], ['pixie', 'pixie'],
    ['ponytail', 'ponytail'], ['high_ponytail', 'high ponytail'], ['pigtails', 'pigtails'], ['spiked', 'spiked'],
    ['twists_fade', 'twists'], ['dreadlocks_long', 'dreadlocks'], ['page', 'page'], ['princess', 'princess'],
    ['half_up', 'half up'], ['swoop', 'swoop'], ['wavy', 'wavy'], ['idol', 'idol'], ['lob', 'lob'],
  ].map(([k, name]) => ({ slot: 'hair', id: `hair.${k}`, name, dir: `hair/${k}`, z: 130 })),

  // shirts: the catalog. Upstream nests each garment under its family folder.
  ...[
    ['shortsleeve/shortsleeve', 'tee', 'starter'],
    ['shortsleeve/tshirt', 'plain tee', 'starter'],
    ['shortsleeve/shortsleeve_polo', 'polo', 'common'],
    ['longsleeve/longsleeve', 'longsleeve', 'starter'],
    ['longsleeve/laced', 'laced top', 'common'],
    ['sleeveless/sleeveless', 'tank top', 'starter'],
    ['blouse', 'blouse', 'starter'],
    ['blouse_longsleeve', 'long blouse', 'common'],
    ['vest', 'vest', 'common'],
    ['vest_open', 'open vest', 'common'],
    ['tunic', 'tunic', 'common'],
    ['tunic_sara', 'belted tunic', 'rare'],
    ['corset', 'corset', 'rare'],
    ['robe', 'robe', 'epic'],
  ].map(([k, name, rarity]) => ({ slot: 'torso', id: `torso.${k.split('/').pop()}`, name, dir: `torso/clothes/${k}`, z: 35, rarity })),

  // hats
  ...[
    ['cloth/bandana', 'bandana', 'starter'],
    ['headband/tied', 'headband', 'starter'],
    ['cloth/feather_cap', 'feather cap', 'common'],
    ['cloth/hood', 'hood', 'common'],
    ['cloth/hijab', 'hijab', 'starter'],
    ['formal/bowler', 'bowler', 'common'],
    ['formal/tophat', 'top hat', 'rare'],
    ['formal/tiara', 'tiara', 'epic'],
    ['formal/crown', 'crown', 'legendary'],
    ['holiday/christmas', 'santa hat', 'rare'],
    ['holiday/elf', 'elf hat', 'rare'],
  ].map(([k, name, rarity]) => ({ slot: 'hat', id: `hat.${k.split('/').pop()}`, name, dir: `hat/${k}`, z: 140, rarity })),

  ...[
    ['pants', 'pants', 'starter'],
    ['pants2', 'straight pants', 'starter'],
    ['cuffed', 'cuffed jeans', 'starter'],
    ['shorts/shorts', 'shorts', 'starter'],
    ['shorts/short_shorts', 'short shorts', 'common'],
    ['leggings', 'leggings', 'starter'],
    ['leggings2', 'ribbed leggings', 'common'],
    ['hose', 'hose', 'common'],
    ['pantaloons', 'pantaloons', 'common'],
    ['skirts/plain', 'skirt', 'starter'],
    ['skirts/straight', 'pencil skirt', 'common'],
    ['skirts/slit', 'slit skirt', 'rare'],
    ['skirts/overskirt', 'overskirt', 'rare'],
    ['skirts/belle', 'belle skirt', 'rare'],
    ['formal', 'formal trousers', 'common'],
    ['formal_striped', 'striped trousers', 'rare'],
    ['fur', 'fur leggings', 'epic'],
  ].map(([k, name, rarity]) => ({ slot: 'legs', id: `legs.${k.split('/').pop()}`, name, dir: `legs/${k}`, z: 30, rarity })),

  ...[
    ['shoes', 'shoes', 'starter'],
    ['shoes2', 'loafers', 'starter'],
    ['sandals', 'sandals', 'starter'],
    ['slippers', 'slippers', 'starter'],
    ['boots', 'boots', 'common'],
    ['boots2', 'tall boots', 'common'],
    ['boots_fold', 'folded boots', 'common'],
    ['boots_rim', 'rimmed boots', 'rare'],
    ['ghillies', 'ghillies', 'rare'],
    ['socks/ankle', 'ankle socks', 'starter'],
    ['socks/high', 'knee socks', 'common'],
    ['armour/plate', 'plate boots', 'epic'],
  ].map(([k, name, rarity]) => ({ slot: 'feet', id: `feet.${k.split('/').pop()}`, name, dir: `feet/${k}`, z: 25, rarity })),
];

const SEXES = new Set(['male', 'female', 'muscular', 'teen', 'pregnant', 'child', 'adult', 'thin', 'universal']);
/**
 * Body buckets we ship. Upstream files some parts per sex and others once for
 * everyone ('adult', 'universal'); both are kept and the loader falls back
 * across buckets, so a hat filed as 'adult' still lands on a female body.
 */
const KEEP_SEX = new Set(['male', 'female', 'adult', 'universal']);

/**
 * Upstream ships 20-30 colours per garment and 26 per hair style, which would
 * be thousands of sheets. Ship a tight palette per slot instead; the rest stay
 * available to a later run by widening these lists.
 */
const PALETTE = {
  body: ['light', 'amber', 'olive', 'taupe', 'bronze', 'brown', 'black'],
  head: ['light', 'amber', 'olive', 'taupe', 'bronze', 'brown', 'black'],
  eyes: ['blue', 'brown', 'green', 'gray', 'purple', 'orange'],
  hair: ['black', 'blonde', 'ash', 'chestnut', 'redhead', 'platinum', 'white', 'blue', 'pink', 'purple'],
  torso: ['white', 'black', 'red', 'blue', 'green', 'yellow', 'pink', 'purple', 'navy', 'forest', 'sky', 'rose'],
  legs: ['white', 'black', 'red', 'blue', 'green', 'yellow', 'pink', 'purple', 'navy', 'forest', 'sky', 'rose'],
  feet: ['white', 'black', 'red', 'blue', 'green', 'yellow', 'pink', 'purple', 'navy', 'forest', 'sky', 'rose'],
  hat: ['white', 'black', 'red', 'blue', 'green', 'yellow', 'pink', 'purple', 'navy', 'forest', 'sky', 'rose', 'brown', 'gold', 'steel', 'leather'],
};

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** Fetch with an on-disk cache so re-runs are cheap. */
async function fetchCached(url, key) {
  const cached = join(CACHE, key);
  if (await exists(cached)) return readFile(cached);
  const r = await fetch(url);
  if (!r.ok) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  await mkdir(dirname(cached), { recursive: true });
  await writeFile(cached, buf);
  return buf;
}

function isPng(buf) {
  return buf && buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50;
}

/** Keep only the 4 walk rows, so a worn sheet is ~25KB instead of ~150KB. */
function cropWalk(buf) {
  const src = PNG.sync.read(buf);
  const w = WALK_FRAMES * FRAME;
  const h = WALK_ROWS * FRAME;
  if (src.width < w || src.height < (WALK_ROW + WALK_ROWS) * FRAME) return null;
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    const sy = (WALK_ROW * FRAME + y) * src.width * 4;
    src.data.copy(out.data, y * w * 4, sy, sy + w * 4);
  }
  return PNG.sync.write(out, { colorType: 6 });
}

async function main() {
  process.stdout.write('reading repo tree…\n');
  const treeRaw = await fetchCached(`https://api.github.com/repos/${REPO}/git/trees/master?recursive=1`, 'tree.json');
  const tree = JSON.parse(treeRaw.toString());
  const all = tree.tree.filter((x) => x.path.endsWith('.png')).map((x) => x.path);

  const manifest = { frame: FRAME, cols: WALK_FRAMES, rows: WALK_ROWS, dirs: ['up', 'left', 'down', 'right'], parts: [] };
  let ok = 0;
  let skipped = 0;

  for (const entry of CATALOG) {
    const prefix = `spritesheets/${entry.dir}/`;
    const part = { id: entry.id, slot: entry.slot, name: entry.name, z: entry.z, base: !!entry.base, rarity: entry.rarity ?? 'starter', variants: [], files: {} };
    // discover <sex>/<variant>.png, or flat <variant>.png for unisex layers
    const found = all.filter((p) => p.startsWith(prefix));
    for (const p of found) {
      const bits = p.slice(prefix.length).replace(/\.png$/, '').split('/');
      let sex = 'unisex';
      let variant = bits[0];
      if (bits.length === 2) {
        // <sex>/<variant>
        if (!SEXES.has(bits[0]) || !KEEP_SEX.has(bits[0])) continue;
        sex = bits[0];
        variant = bits[1];
      } else if (bits.length === 1) {
        // unisex layer, e.g. eyes
        if (!entry.flat) continue;
      } else {
        continue; // deeper than this garment's own directory
      }
      const allow = PALETTE[entry.slot];
      if (allow && !allow.includes(variant)) continue;
      const rel = `${entry.id.replace(/\./g, '_')}__${sex}__${variant}.png`;
      const dest = join(OUT, entry.slot, rel);
      // always rewrite: HTTP is disk-cached, and this lets a re-run repair a
      // pack built by an older version of this script
      const buf = await fetchCached(`${RAW}/${p}`, p.replace(/\//g, '_'));
      if (!isPng(buf)) {
        skipped++;
        continue;
      }
      const cropped = cropWalk(buf);
      if (!cropped) {
        skipped++;
        continue;
      }
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, cropped);
      part.files[`${sex}/${variant}`] = `${entry.slot}/${rel}`;
      if (!part.variants.includes(variant)) part.variants.push(variant);
      ok++;
      if (ok % 40 === 0) process.stdout.write(`\r${ok} sheets  (${entry.id})            `);
    }
    part.variants.sort();
    if (part.variants.length) manifest.parts.push(part);
    else process.stdout.write(`\r!! no sheets for ${entry.id} (${entry.dir})\n`);
  }

  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest));

  // drop sheets no longer referenced, so narrowing the palette shrinks the pack
  const keep = new Set(manifest.parts.flatMap((p) => Object.values(p.files)));
  let pruned = 0;
  for (const slot of new Set(manifest.parts.map((p) => p.slot))) {
    const dir = join(OUT, slot);
    for (const f of await readdir(dir).catch(() => [])) {
      if (f.endsWith('.png') && !keep.has(`${slot}/${f}`)) {
        await unlink(join(dir, f));
        pruned++;
      }
    }
  }

  // one source of truth for both sides: the server validates avatar configs
  // against this, the client builds the customizer from it
  const wardrobe = manifest.parts.map((p) => ({
    id: p.id,
    slot: p.slot,
    name: p.name,
    rarity: p.rarity,
    base: p.base,
    variants: p.variants,
  }));
  await writeFile(
    new URL('../shared/src/wardrobe.generated.ts', import.meta.url).pathname,
    `/* eslint-disable */\n` +
      `// GENERATED by scripts/fetch-lpc.mjs — do not edit by hand.\n` +
      `// Mirrors client/public/lpc/manifest.json so the server can validate looks.\n\n` +
      `export interface WardrobePart {\n  id: string;\n  slot: string;\n  name: string;\n  rarity: string;\n  base: boolean;\n  variants: string[];\n}\n\n` +
      `export const WARDROBE: WardrobePart[] = ${JSON.stringify(wardrobe, null, 1)};\n`,
  );
  const creditsBuf = await fetchCached(`${RAW}/CREDITS.csv`, 'CREDITS.csv');
  await writeFile(
    join(OUT, 'CREDITS.md'),
    `# Avatar art credits\n\nSprites are from the Universal LPC Spritesheet collection:\nhttps://github.com/${REPO}\n\n` +
      `Licensed **CC-BY-SA 3.0** and **GPL 3.0**. Derivative artwork must carry the same licence and\n` +
      `credit the authors below. The licence covers the art in this folder, not the rest of this repo.\n\n` +
      `Regenerate with \`node scripts/fetch-lpc.mjs\`.\n\n## Authors\n\n\`\`\`csv\n${creditsBuf ? creditsBuf.toString() : ''}\n\`\`\`\n`,
  );
  console.log(`\ndone: ${ok} sheets, ${skipped} skipped, ${pruned} pruned, ${manifest.parts.length} parts`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
