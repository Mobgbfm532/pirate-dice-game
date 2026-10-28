// Turns the original AI art in /art into game-ready files in client/public/art.
//
//   npm run art            (from client/)
//
// AI image tools often paint a grey/white checkerboard instead of real transparency.
// For those images we find the checkerboard's two tones on the image border, flood-fill
// from the border through anything matching them, and make it transparent. The fill
// stops at the character's painted rim light, so grey or black clothing inside the
// silhouette is kept. Originals in /art are never modified.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const ART = path.resolve(here, '../../art');
const OUT = path.resolve(here, '../public/art');
mkdirSync(OUT, { recursive: true });

const PREVIEW = process.env.ART_PREVIEW_DIR; // optional: write cut-outs on magenta to check edges

// ONLY=frak,martha (env): redo just those pictures, leaving every other output as it is.
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const wanted = name => !ONLY || ONLY.has(name);

async function readRgba(file) {
    const { data, info } = await sharp(path.join(ART, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
}

const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
const chroma = (d, i) => Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);

// The checkerboard's dark and light tones, from neutral pixels on the image border.
function checkerTones({ data, width, height }) {
    const samples = [];
    const take = (x, y) => { const i = (y * width + x) * 4; if (chroma(data, i) < 20) samples.push(lum(data, i)); };
    for (let x = 0; x < width; x += 2) { take(x, 0); take(x, 1); take(x, height - 1); }
    for (let y = 0; y < height; y += 2) { take(0, y); take(1, y); take(width - 1, y); take(width - 2, y); }
    samples.sort((a, b) => a - b);
    // Two-cluster split around the median, refined a few times (1-D k-means).
    let lo = samples[Math.floor(samples.length * 0.2)], hi = samples[Math.floor(samples.length * 0.8)];
    for (let k = 0; k < 8; k++) {
        const mid = (lo + hi) / 2;
        const a = samples.filter(s => s < mid), b = samples.filter(s => s >= mid);
        lo = a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
        hi = b.reduce((s, v) => s + v, 0) / Math.max(1, b.length);
    }
    return { lo, hi };
}

// Marks checkerboard pixels as background. Returns a Uint8Array mask (1 = background).
//   strict:  only the two checker tones themselves (plus near-perfectly grey pixels between
//            them, where JPEG blurs square edges). For characters in dark grey clothing.
//   pockets: also clear patches of checkerboard the border fill can't reach, e.g. between
//            fingers or boxed in by painted fire. Found as large two-tone grey regions.
function floodCheckerboard(img, { tolerance = 16, maxChroma = 26, strict = false, pockets = false } = {}) {
    const { data, width, height } = img;
    const { lo, hi } = checkerTones(img);
    const min = lo - tolerance, max = hi + tolerance;
    const isChecker = p => {
        const i = p * 4, l = lum(data, i), c = chroma(data, i);
        if (c > maxChroma || l < min || l > max) return false;
        if (!strict) return true;
        return Math.abs(l - lo) <= tolerance || Math.abs(l - hi) <= tolerance || c <= 4;
    };

    const mask = new Uint8Array(width * height);
    const fill = (seeds, accept) => {
        const stack = [];
        const visit = p => { if (!mask[p] && accept(p)) { mask[p] = 1; stack.push(p); } };
        seeds.forEach(visit);
        const region = [];
        while (stack.length) {
            const p = stack.pop();
            region.push(p);
            const x = p % width;
            if (x > 0) visit(p - 1);
            if (x < width - 1) visit(p + 1);
            if (p >= width) visit(p - width);
            if (p < width * (height - 1)) visit(p + width);
        }
        return region;
    };

    const border = [];
    for (let x = 0; x < width; x++) border.push(x, (height - 1) * width + x);
    for (let y = 0; y < height; y++) border.push(y * width, y * width + width - 1);
    fill(border, isChecker);

    if (pockets) {
        const mid = (lo + hi) / 2;
        for (let p = 0; p < width * height; p++) {
            if (mask[p] || !isChecker(p)) continue;
            const region = fill([p], isChecker);
            const dark = region.filter(q => lum(data, q * 4) < mid).length;
            const share = dark / region.length;
            // Keep it (undo) unless it's big and genuinely two-tone like the checkerboard.
            if (region.length < 600 || share < 0.25 || share > 0.75) region.forEach(q => { mask[q] = 2; });
        }
        for (let p = 0; p < mask.length; p++) if (mask[p] === 2) mask[p] = 0;
    }

    return { mask, tones: { lo: Math.round(lo), hi: Math.round(hi) } };
}

// Painted firelight behind a character tints the checkerboard orange, so neither the
// tone test nor the pocket test can see it. Inside a hand-picked box (original pixel
// coordinates) we clear grey checkerboard and bright orange flame.
function eraseFire(img, mask, [x0, y0, x1, y1], greyChroma = 30, minLum = 0, maxLum = 255) {
    const { data, width } = img;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const p = y * width + x, i = p * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const l = lum(data, i);
        const grey = chroma(data, i) <= greyChroma && l >= minLum && l <= maxLum;
        const flame = l > 140 && r > g && g > b && r - b > 80;
        if (grey || flame) mask[p] = 1;
    }
}

// Drops specks and leftover patches: keeps only foreground pieces at least 2% the size
// of the biggest one (the character; `minPiece` lowers that share to keep a flying die).
function keepMainShape(img, mask, minPiece = 0.02) {
    const { width, height } = img;
    const label = new Int32Array(width * height).fill(-1);
    const sizes = [];
    for (let s = 0; s < mask.length; s++) {
        if (mask[s] || label[s] >= 0) continue;
        const id = sizes.length;
        let size = 0;
        const stack = [s];
        label[s] = id;
        while (stack.length) {
            const p = stack.pop();
            size++;
            const x = p % width;
            for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width]) {
                if (q >= 0 && q < mask.length && !mask[q] && label[q] < 0) { label[q] = id; stack.push(q); }
            }
        }
        sizes.push(size);
    }
    const biggest = Math.max(...sizes);
    for (let p = 0; p < mask.length; p++) if (!mask[p] && sizes[label[p]] < biggest * minPiece) mask[p] = 1;
}

// Alpha from the mask, with a 1px soft edge so cut-outs don't look jagged.
function applyMask(img, mask) {
    const { data, width, height } = img;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const p = y * width + x;
        if (mask[p]) { data[p * 4 + 3] = 0; continue; }
        let bg = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < width && ny < height && mask[ny * width + nx]) bg++;
        }
        data[p * 4 + 3] = Math.round(255 * (1 - bg / 12));
    }
}

function toSharp({ data, width, height }) {
    return sharp(data, { raw: { width, height, channels: 4 } });
}

async function writePreview(name, img) {
    if (!PREVIEW) return;
    mkdirSync(PREVIEW, { recursive: true });
    await toSharp(img).flatten({ background: '#ff00ff' }).resize({ height: 500 }).jpeg().toFile(path.join(PREVIEW, `${name}.jpg`));
}

// patches: leftover checkerboard boxed in by the character, as
// [x0, y0, x1, y1, maxChroma, minLum, maxLum] in original pixels. maxChroma 255 clears the box.
async function cutOut(file, name, { maxHeight = 720, fireBox = null, patches = [], ...options } = {}) {
    if (!wanted(name)) return;
    const img = await readRgba(file);
    const { mask, tones } = floodCheckerboard(img, options);
    if (fireBox) eraseFire(img, mask, fireBox);
    patches.forEach(([x0, y0, x1, y1, ...limits]) => eraseFire(img, mask, [x0, y0, x1, y1], ...limits));
    keepMainShape(img, mask);
    applyMask(img, mask);
    await writePreview(name, img);
    const trimmed = await toSharp(img).png().toBuffer().then(b => sharp(b).trim({ threshold: 1 }).toBuffer());
    const info = await sharp(trimmed).resize({ height: maxHeight, withoutEnlargement: true }).webp({ quality: 82, alphaQuality: 90 }).toFile(path.join(OUT, `${name}.webp`));
    const removed = Math.round((100 * mask.reduce((s, v) => s + v, 0)) / mask.length);
    console.log(`${name}.webp  ${info.width}x${info.height}  ${Math.round(info.size / 1024)} KB  checker tones ${tones.lo}/${tones.hi}, ${removed}% removed`);
}

// Newer art comes on a flat solid background (the prompts ask for magenta) instead of a
// checkerboard. Flood-fill from the border through anything close to the border's colour,
// then take the background's tint out of the edge pixels (wispy hair over magenta would
// otherwise keep a pink fringe).
function floodFlat(img, { tolerance, minRed, minBlue, pocket, holes = [] }) {
    const { data, width, height } = img;
    const border = [];
    for (let x = 0; x < width; x++) border.push(x, (height - 1) * width + x);
    for (let y = 0; y < height; y++) border.push(y * width, y * width + width - 1);
    const median = c => border.map(p => data[p * 4 + c]).sort((a, b) => a - b)[border.length >> 1];
    const bg = [median(0), median(1), median(2)];
    // Close to the background AND magenta-ish (red and blue both above green): skin and
    // brown cloth in shadow can come close in plain distance, but their blue sits below green.
    const near = p => {
        const i = p * 4, r = data[i], g = data[i + 1], b = data[i + 2];
        return Math.hypot(r - bg[0], g - bg[1], b - bg[2]) < tolerance && r - g > minRed && b - g > minBlue;
    };
    const mask = new Uint8Array(width * height);
    const stack = [];
    const visit = p => { if (!mask[p] && near(p)) { mask[p] = 1; stack.push(p); } };
    border.forEach(visit);
    // Background boxed in by the character (inside a curled horn): filled from a point in it.
    holes.forEach(([x, y]) => visit(y * width + x));
    while (stack.length) {
        const p = stack.pop();
        const x = p % width;
        if (x > 0) visit(p - 1);
        if (x < width - 1) visit(p + 1);
        if (p >= width) visit(p - width);
        if (p < width * (height - 1)) visit(p + width);
    }
    // Pockets of background caught between hair strands: magenta-ish pixels close to the edge.
    const pockets = [];
    for (let p = 0; p < mask.length; p++) {
        if (mask[p] || !near(p)) continue;
        const x = p % width, y = (p - x) / width;
        search: for (let dy = -pocket; dy <= pocket; dy++) for (let dx = -pocket; dx <= pocket; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < width && ny < height && mask[ny * width + nx] === 1) { pockets.push(p); break search; }
        }
    }
    pockets.forEach(p => { mask[p] = 1; });
    return { mask, bg };
}

// Takes the background's colour back out of pixels near it. Magenta = green plus extra red
// and blue in the background's own proportions, so the blue excess (which skin, hair and
// cloth don't have) measures how much background is mixed in, and the matching share of
// red comes off with it. (Taking equal amounts off left reddish tips on stray hairs.)
function despill(img, mask, bg, radius, skip = null) {
    const redPerBlue = (bg[0] - bg[1]) / Math.max(1, bg[2] - bg[1]);
    const { data, width, height } = img;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const p = y * width + x;
        if (mask[p] || skip?.has(p)) continue;
        let edge = false;
        for (let dy = -radius; dy <= radius && !edge; dy++) for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < width && ny < height && mask[ny * width + nx]) { edge = true; break; }
        }
        if (!edge) continue;
        const i = p * 4, g = data[i + 1];
        const spill = data[i + 2] - g;
        if (spill > 0) { data[i] = Math.max(g, data[i] - spill * redPerBlue); data[i + 2] = g; }
    }
}

// Smoke (or mist) painted over the background: thin grey with the magenta showing through.
// Inside the box (original pixels), each kept pixel that is pinkish grey (red a little
// above green, blue not far below it: smoke, not skin or embers) is unmixed: the red
// excess says how much background is in it, that share becomes transparency, and the
// pixel becomes grey of the smoke's own brightness.
// `minBlue`: how far blue may sit below green (-25); raise it (to 0 or more) when skin or
// leather inside the box would turn grey: over magenta, blue sits above green.
// Returns the alpha to apply after applyMask.
function veil(img, mask, bg, boxes, minBlue = -25) {
    const { data, width } = img;
    const alpha = new Map();
    const excess = Math.max(1, bg[0] - bg[1]);
    for (const [x0, y0, x1, y1] of boxes) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const p = y * width + x, i = p * 4;
        if (mask[p]) continue;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (r - g <= 0 || r - g > 1.3 * excess || b - g < minBlue) continue;
        const a = Math.max(0.05, 1 - (r - g) / excess);
        // Smoke is grey: keep the unmixed brightness (from green), with a touch of warmth.
        const grey = Math.max(0, Math.min(255, (g - (1 - a) * bg[1]) / a));
        data[i] = Math.min(255, Math.round(grey + 6)); data[i + 1] = Math.round(grey); data[i + 2] = Math.max(0, Math.round(grey - 8));
        alpha.set(p, a);
    }
    return alpha;
}

// Coloured smoke (Martha's purple vape smoke) stays coloured instead. Inside the box, each
// kept pixel with blue well above green (purple smoke and the background itself, not skin,
// lips or hair) is repainted in the smoke's colour `tint`, lighter or darker as the painted
// smoke was against the background, and gets its transparency from how far it is from the
// background colour: see-through at `from` (the flood's tolerance), at most `solid` opaque.
// (Taking the background's share out of the colour instead left the smoke nearly black.)
function tintVeil(img, mask, bg, boxes, from, { tint = [170, 130, 200], reach = 45, solid = 0.85 } = {}) {
    const { data, width } = img;
    const alpha = new Map();
    const bgLum = 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2];
    for (const [x0, y0, x1, y1] of boxes) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const p = y * width + x, i = p * 4;
        if (mask[p]) continue;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (b - g < 6 || b - g < 0.3 * (r - g)) continue;
        const a = Math.min(solid, Math.max(0, (Math.hypot(r - bg[0], g - bg[1], b - bg[2]) - from) / (reach - from)));
        const shade = lum(data, i) / bgLum;
        for (let c = 0; c < 3; c++) data[i + c] = Math.min(255, Math.round(tint[c] * shade));
        alpha.set(p, a);
    }
    return alpha;
}

// See-through streaks of one colour painted over the background (Stason's cream swirl trails,
// the motion streaks behind a flying die). Each kept pixel in the boxes that lies on the line from
// the background colour to the streak's `colour` (within `reach`) is unmixed: how far along that
// line it sits is its opacity, and it takes the streak's colour (unmixing each pixel's own colour
// turned the faint ones green). Pixels further along than `solid` (0.8) stay as painted, opaque.
// Skin and cloth lie off the line and are left alone. Returns alpha, like veil.
function unmixTrails(img, mask, bg, { colour, boxes, reach = 30, solid = 0.8 }, alpha = new Map()) {
    const { data, width } = img;
    const d = colour.map((c, k) => c - bg[k]);
    const len2 = d.reduce((s, v) => s + v * v, 0);
    for (const [x0, y0, x1, y1] of boxes) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const p = y * width + x, i = p * 4;
        if (mask[p] || alpha.has(p)) continue;
        const v = [0, 1, 2].map(k => data[i + k] - bg[k]);
        const t = (v[0] * d[0] + v[1] * d[1] + v[2] * d[2]) / len2;
        if (t <= 0 || t >= solid) continue;
        if (Math.hypot(v[0] - t * d[0], v[1] - t * d[1], v[2] - t * d[2]) > reach) continue;
        const a = Math.max(0.04, t);
        for (let k = 0; k < 3; k++) data[i + k] = colour[k];
        alpha.set(p, a);
    }
    return alpha;
}

// A soft edge instead of a hard one (Brodor's cosmic aura, painted darker where it meets the
// background): inside the boxes, kept pixels within `radius` px of the background fade out towards it.
// Returns alpha, like veil.
function feather(img, mask, { boxes, radius = 10 }, alpha = new Map()) {
    const { width, height } = img;
    const inBox = (x, y) => boxes.some(([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1);
    const dist = new Map();
    let front = [];
    for (let p = 0; p < mask.length; p++) if (mask[p]) {
        const x = p % width;
        for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width]) if (q >= 0 && q < mask.length && !mask[q] && !dist.has(q)) { dist.set(q, 1); front.push(q); }
    }
    for (let d = 2; d <= radius && front.length; d++) {
        const next = [];
        for (const p of front) { const x = p % width; for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width]) if (q >= 0 && q < mask.length && !mask[q] && !dist.has(q)) { dist.set(q, d); next.push(q); } }
        front = next;
    }
    dist.forEach((d, p) => { const x = p % width, y = (p - x) / width; if (inBox(x, y)) alpha.set(p, (alpha.get(p) ?? 1) * Math.min(1, d / radius)); });
    return alpha;
}

// Painted smoke taken out of a picture (Frak's cigar since 23 Oct: the game draws its own moving
// smoke, and the painted wisp beside it didn't make sense, the user's call).
//   clear: over the background, the smoke is background (fully see-through).
//   paint: over the body, pale low-colour wisps lighter than their surroundings are repainted
//   in the colour around them (a median of the nearby pixels that aren't smoke); the brass
//   studs and the orange sparks are left alone (too colourful, or far brighter than smoke).
function eraseSmoke(img, mask, bg, { clear, paint }) {
    const { data, width } = img;
    if (clear) {
        const [x0, y0, x1, y1] = clear;
        const excess = Math.max(1, bg[0] - bg[1]);
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
            const p = y * width + x, i = p * 4;
            if (mask[p]) continue;
            const r = data[i], g = data[i + 1], b = data[i + 2];
            if (r - g > 0 && r - g <= 1.3 * excess && b - g >= -25) mask[p] = 1;
        }
    }
    if (paint) {
        const [x0, y0, x1, y1] = paint;
        const R = 18;
        const lumAt = i => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const satAt = i => { const mx = Math.max(data[i], data[i + 1], data[i + 2]), mn = Math.min(data[i], data[i + 1], data[i + 2]); return mx ? (mx - mn) / mx : 0; };
        const median = arr => { arr.sort((a, b) => a - b); return arr[arr.length >> 1]; };
        // The smoke: pale and greyish, and lighter than most of what's around it.
        const smoky = new Uint8Array(width * img.height);
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
            const p = y * width + x, i = p * 4;
            if (mask[p] || satAt(i) > 0.36) continue;
            const around = [];
            for (let dy = -R; dy <= R; dy += 3) for (let dx = -R; dx <= R; dx += 3) {
                const q = (y + dy) * width + (x + dx);
                if (!mask[q]) around.push(lumAt(q * 4));
            }
            const lift = lumAt(i) - median(around);
            if (lift > 5 && lift < 70) smoky[p] = 1;
        }
        // Grow the smoke by a few pixels (its soft edge), then repaint from the pixels around that aren't smoke.
        let grown = smoky;
        for (let step = 0; step < 3; step++) {
            const next = grown.slice();
            for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
                const p = y * width + x;
                if (grown[p - 1] || grown[p + 1] || grown[p - width] || grown[p + width]) next[p] = 1;
            }
            grown = next;
        }
        const out = new Uint8ClampedArray(data);
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
            const p = y * width + x;
            if (!grown[p] || mask[p]) continue;
            const ch = [[], [], []];
            for (let dy = -R; dy <= R; dy += 2) for (let dx = -R; dx <= R; dx += 2) {
                const q = (y + dy) * width + (x + dx);
                if (mask[q] || grown[q]) continue;
                for (let c = 0; c < 3; c++) ch[c].push(data[q * 4 + c]);
            }
            if (ch[0].length < 8) continue;
            for (let c = 0; c < 3; c++) out[p * 4 + c] = median(ch[c]);
        }
        data.set(out);
    }
}

// Options (all optional):
//   tolerance  how close (RGB distance) a pixel must be to the background to be cleared (80)
//   minRed, minBlue  how far red / blue must sit above green for a pixel to count as
//              background (45, 15); raise them if shaded skin or cloth gets holes
//   pocket     clears background caught between hair strands up to this many px from the
//              edge (14)
//   despillRadius  how far in from the edge the background tint is taken out (6)
//   holes      [[x, y], ...]: points (original pixels) inside background that the character
//              boxes in, too far from the edge for pocket (none)
//   smokeBox   [x0, y0, x1, y1]: thin smoke painted over the background in this box turns
//              see-through instead of staying pink (none)
//   noSmoke    { clear, paint }: painted smoke taken out (eraseSmoke)
//   minPiece   pieces apart from the character smaller than this share of it go as specks
//              (0.02); lower it to keep dice flying beside him
//   smokeColour  'grey' (Frak's cigar) turns that smoke grey; 'own' keeps it coloured (lilac)
//              (Martha's purple smoke; pair it with a low tolerance so the flood leaves it);
//              smokeBox may also be a list of boxes
//   trails     { colour, boxes, reach }: see-through streaks of that colour over the background
//              in those boxes turn see-through instead of pink (unmixTrails); a list of them for streaks
//              of different colours (Jaguar's gold sparkles and his potion's red glow)
//   soften     { boxes, radius }: a soft edge fading over that many px in those boxes (feather)
//   fade       { left, right, top, bottom }: fade out over that many px towards those edges of the
//              painting, where it crops the character itself (fadeEdges)
//   glow       { boxes }: a bright glow or flame over the background in those boxes keeps its own
//              warm colours and turns see-through by how bright it is (glowToAlpha)
//   smokeMinBlue  grey smoke only: how far blue may sit below green to count as smoke (-25);
//              raise it to keep skin and leather in the box out (veil)
// A painting that crops the character at its own edge (Jaguar's cloak running off the right side, 27 Oct)
// shows a hard straight line; this fades the picture out over that many px (original) towards each
// edge named: { left, right, top, bottom }.
function fadeEdges({ data, width, height }, { left = 0, right = 0, top = 0, bottom = 0 }) {
    const ramp = (d, n) => { if (!n) return 1; const t = Math.min(1, d / n); return t * t * (3 - 2 * t); };
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const k = Math.min(ramp(x, left), ramp(width - 1 - x, right), ramp(y, top), ramp(height - 1 - y, bottom));
        if (k < 1) data[(y * width + x) * 4 + 3] = Math.round(data[(y * width + x) * 4 + 3] * k);
    }
}

// A glow painted over the background (the Ridgeler's golden hammer flame, 28 Oct): inside the
// boxes, every pixel (kept or background) is taken apart as the glow's own colour laid over the
// background at some opacity: the least opacity that keeps the colour possible (GIMP's "colour to
// alpha"). Only where that colour comes out warm (red over green over blue: flame, not his grey
// horns or green coat); bright cores come out opaque, the faint halo nearly clear and gold;
// leftover pink in the boxes goes.
// Returns alpha, like veil.
function glowToAlpha(img, mask, bg, { boxes, min = 0.06, solid = 0.97 }, alpha = new Map()) {
    const { data, width } = img;
    for (const [x0, y0, x1, y1] of boxes) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const p = y * width + x, i = p * 4;
        if (alpha.has(p)) continue;
        let a = 0;
        for (let k = 0; k < 3; k++) {
            const v = data[i + k], b = bg[k];
            a = Math.max(a, v > b ? (v - b) / (255 - b) : (b - v) / b);
        }
        if (a >= solid) continue;
        if (a < min) { if (mask[p]) continue; a = min; }
        const f = [0, 1, 2].map(k => Math.max(0, Math.min(255, Math.round(bg[k] + (data[i + k] - bg[k]) / a))));
        if (!(f[0] >= f[1] && f[1] >= f[2] - 10 && f[0] - f[2] > 60)) {
            // Not flame: still pink (blue over green, red well over it) or dusky rose is the background
            // showing through the faintest wisps; it goes (keep red cloth and leather out of the boxes).
            const r = data[i], g = data[i + 1], b = data[i + 2];
            if (!mask[p] && ((b > g && r - g > 25) || (r - g > 60 && g < 100 && b >= g - 12))) mask[p] = 1;
            continue;
        }
        for (let k = 0; k < 3; k++) data[i + k] = f[k];
        mask[p] = 0;
        alpha.set(p, a);
    }
    return alpha;
}

async function cutOutFlat(file, name, { maxHeight = 720, tolerance = 80, minRed = 45, minBlue = 15, pocket = 14, despillRadius = 6, smokeBox = null, smokeColour = 'grey', holes = [], noSmoke = null, minPiece = 0.02, smokeMinBlue = -25, trails = null, soften = null, fade = null, glow = null } = {}) {
    if (!wanted(name)) return;
    const img = await readRgba(file);
    const { mask, bg } = floodFlat(img, { tolerance, minRed, minBlue, pocket, holes });
    if (noSmoke) eraseSmoke(img, mask, bg, noSmoke);
    keepMainShape(img, mask, minPiece);
    const boxes = !smokeBox ? null : Array.isArray(smokeBox[0]) ? smokeBox : [smokeBox];
    let smoke = !boxes ? null : smokeColour === 'own' ? tintVeil(img, mask, bg, boxes, tolerance) : veil(img, mask, bg, boxes, smokeMinBlue);
    if (glow) smoke = glowToAlpha(img, mask, bg, glow, smoke ?? undefined);
    for (const t of trails ? [].concat(trails) : []) smoke = unmixTrails(img, mask, bg, t, smoke ?? undefined);
    if (soften) smoke = feather(img, mask, soften, smoke ?? undefined);
    despill(img, mask, bg, despillRadius, smoke);
    applyMask(img, mask);
    smoke?.forEach((a, p) => { img.data[p * 4 + 3] = Math.round(img.data[p * 4 + 3] * a); });
    if (fade) fadeEdges(img, fade);
    await writePreview(name, img);
    const trimmed = await toSharp(img).png().toBuffer().then(b => sharp(b).trim({ threshold: 1 }).toBuffer());
    const info = await sharp(trimmed).resize({ height: maxHeight, withoutEnlargement: true }).webp({ quality: 82, alphaQuality: 90 }).toFile(path.join(OUT, `${name}.webp`));
    const removed = Math.round((100 * mask.reduce((s, v) => s + v, 0)) / mask.length);
    console.log(`${name}.webp  ${info.width}x${info.height}  ${Math.round(info.size / 1024)} KB  background rgb(${bg.join(',')}), ${removed}% removed`);
}

// A living painting's mask (the devil's three 6s): which parts the shader moves, packed into the
// colour channels of `<name>-mask.webp` at the cut-out's size.
//   red    the flames, spread wide and soft, so they can sway out into the clear background
//   green  the glowing green pips (and her eyes)
//   blue   the flames themselves, tight, for their flicker
// Flames are the bright, saturated yellow-orange; her skin is darker and redder, and the thin
// orange rims round her body drop out when the mask is blurred and cut again.
async function livingMask(name) {
    if (!wanted(name)) return;
    const { data, info } = await sharp(path.join(OUT, `${name}.webp`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height } = info;
    const ramp = (x, a, b) => Math.min(1, Math.max(0, (x - a) / (b - a)));
    const flame = Buffer.alloc(width * height), green = Buffer.alloc(width * height);
    for (let p = 0; p < width * height; p++) {
        const r = data[p * 4], g = data[p * 4 + 1], b = data[p * 4 + 2];
        if (data[p * 4 + 3] < 10) continue;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const s = max ? (max - min) / max : 0;
        let hue = 0;
        if (max !== min) hue = max === r ? (60 * ((g - b) / (max - min)) + 360) % 360 : max === g ? 60 * ((b - r) / (max - min)) + 120 : 60 * ((r - g) / (max - min)) + 240;
        flame[p] = Math.round(255 * ramp(hue, 18, 26) * ramp(-hue, -58, -50) * ramp(s, 0.45, 0.6) * ramp(max / 255, 0.62, 0.74));
        green[p] = Math.round(255 * ramp(g - Math.max(r, b), 25, 65));
    }
    const grey = buf => sharp(buf, { raw: { width, height, channels: 1 } });
    const blurred = async (buf, sigma) => (await grey(buf).blur(sigma).extractChannel(0).raw().toBuffer());
    const open = await blurred(flame, 2.5);                       // thin rims fade below the cut
    const tight = open.map(v => Math.round(255 * ramp(v, 90, 190)));
    const wide = await blurred(Buffer.from(tight.map(v => Math.min(255, v * 2))), 9);
    const packed = Buffer.alloc(width * height * 3);
    for (let p = 0; p < width * height; p++) { packed[p * 3] = wide[p]; packed[p * 3 + 1] = green[p]; packed[p * 3 + 2] = tight[p]; }
    const info2 = await sharp(packed, { raw: { width, height, channels: 3 } }).webp({ lossless: true }).toFile(path.join(OUT, `${name}-mask.webp`));
    if (PREVIEW) await sharp(packed, { raw: { width, height, channels: 3 } }).png().toFile(path.join(PREVIEW, `${name}-mask.png`));
    console.log(`${name}-mask.webp  ${width}x${height}  ${Math.round(info2.size / 1024)} KB`);
}

// The plates image holds three plaques side by side: "2", "4" and a blank one.
async function slotPlates() {
    const img = await readRgba('slot-plates.jpg');
    const { mask } = floodCheckerboard(img);
    applyMask(img, mask);
    await writePreview('slot-plates', img);
    // Each plate is a run of foreground columns.
    const { width, height } = img;
    const columnHasPlate = x => { let n = 0; for (let y = 0; y < height; y++) if (!mask[y * width + x]) n++; return n > height * 0.05; };
    const runs = [];
    let start = -1;
    for (let x = 0; x <= width; x++) {
        const on = x < width && columnHasPlate(x);
        if (on && start < 0) start = x;
        if (!on && start >= 0) { runs.push([start, x]); start = -1; }
    }
    const plates = runs.filter(([a, b]) => b - a > 50).slice(0, 3);
    const names = ['plate-2', 'plate-4', 'plate-blank'];
    const full = await toSharp(img).png().toBuffer();
    for (let i = 0; i < plates.length; i++) {
        const [a, b] = plates[i];
        const crop = await sharp(full).extract({ left: a, top: 0, width: b - a, height }).png().toBuffer();
        const info = await sharp(crop).trim({ threshold: 1 }).resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .webp({ quality: 85, alphaQuality: 90 }).toFile(path.join(OUT, `${names[i]}.webp`));
        console.log(`${names[i]}.webp  ${info.width}x${info.height}  ${Math.round(info.size / 1024)} KB`);
    }
}

// A spot between fights painted as a scene (no cut-out): it fills its scene's stage and
// its round frame, so it keeps its full size.
async function spotScene(file, name) {
    if (!wanted(name)) return;
    const info = await sharp(path.join(ART, file)).resize(1024, 1024, { fit: 'cover', withoutEnlargement: true }).webp({ quality: 80 }).toFile(path.join(OUT, `${name}.webp`));
    console.log(`${name}.webp  ${info.width}x${info.height}  ${Math.round(info.size / 1024)} KB`);
}

async function backdrop() {
    const info = await sharp(path.join(ART, 'tavern-backdrop.jpg')).webp({ quality: 78 }).toFile(path.join(OUT, 'tavern.webp'));
    console.log(`tavern.webp  ${info.width}x${info.height}  ${Math.round(info.size / 1024)} KB`);
    // Outside the Ghoul and Gourd (Sperm McGrath's fight).
    const outside = await sharp(path.join(ART, 'ghoul-gourd-outside.jpg')).webp({ quality: 80 }).toFile(path.join(OUT, 'ghoul-gourd-outside.webp'));
    console.log(`ghoul-gourd-outside.webp  ${outside.width}x${outside.height}  ${Math.round(outside.size / 1024)} KB`);
    // The other two places (26 Oct): the Yawning Portal's hall with its well, the Salty Swallow's gun deck.
    for (const name of ['yawning-portal', 'salty-swallow']) {
        const info = await sharp(path.join(ART, `${name}-backdrop.jpg`)).webp({ quality: 80 }).toFile(path.join(OUT, `${name}.webp`));
        console.log(`${name}.webp  ${info.width}x${info.height}  ${Math.round(info.size / 1024)} KB`);
    }
}

// Tiling wood for the 3D table, and parchment for dialogs (used once per panel, not tiled).
async function surfaces() {
    const textures = path.resolve(here, '../public/textures');
    // Every plank ends in a dark joint at both image edges; trimming one edge's worth means
    // two tiles meet as a single, normal-width joint.
    const planks = await sharp(path.join(ART, 'table-planks.jpg')).metadata();
    const outputs = [
        [sharp(path.join(ART, 'table-planks.jpg')).extract({ left: 0, top: 0, width: planks.width - 6, height: planks.height }), textures, 'table-planks.webp'],
        // The tabletop since 28 Oct: the user's wide painting, laid once over the table (not tiled).
        [sharp(path.join(ART, 'table-wide.jpg')), textures, 'table-wide.webp'],
        [sharp(path.join(ART, 'rail-walnut.jpg')).resize({ width: 1024 }), textures, 'rail-walnut.webp'],
        [sharp(path.join(ART, 'parchment.jpg')).resize({ width: 1024 }), OUT, 'parchment.webp']
    ];
    for (const [image, dir, name] of outputs) {
        const info = await image.webp({ quality: 80 }).toFile(path.join(dir, name));
        console.log(`${name}  ${info.width}x${info.height}  ${Math.round(info.size / 1024)} KB`);
    }
}

if (!ONLY) {
    await surfaces();
    await backdrop();
    await slotPlates();
}
await cutOut('bust-molar.jpg', 'molar', { fireBox: [704, 60, 864, 790], patches: [[684, 300, 760, 700, 85, 110, 190], [668, 555, 760, 705, 255]] });
await cutOut('bust-klarg.jpg', 'klarg', { fireBox: [1005, 230, 1191, 896], patches: [[888, 408, 1006, 515, 30], [1075, 230, 1191, 896, 255]] });
await cutOut('bust-rokr.jpg', 'rokr');
await cutOut('bust-hangman.jpg', 'hangman', { strict: true, tolerance: 9, maxChroma: 12, patches: [[655, 320, 745, 445, 22, 0, 50]] });
await cutOutFlat('bust-jaguar.jpg', 'jaguar', { holes: [[634, 46], [478, 329]], fade: { right: 140 } }); // his second painting (27 Oct), on a flat background (the first: bust-jaguar-v1.jpg, a checkerboard); his cloak runs off the painting's right edge, so it fades out there
await cutOutFlat('bust-thom.jpg', 'thom');
await cutOutFlat('bust-stranger.jpg', 'stranger');
await cutOutFlat('bust-dicer.jpg', 'dicer', { pocket: 60 }); // background shows between the dice and his fingers
await cutOutFlat('bust-pickpocket.jpg', 'pickpocket', { pocket: 40 }); // and behind the hair at the shoulder
// His cigar's painted smoke is taken out (the game draws its own): over the background above his
// shoulder, and over his vest down to the tip.
await cutOutFlat('bust-frak.jpg', 'frak', { noSmoke: { clear: [180, 120, 305, 470], paint: [205, 452, 312, 702] } });
await cutOutFlat('bust-mcgrath.jpg', 'mcgrath');
await cutOutFlat('bust-danhausen.jpg', 'danhausen');
await cutOutFlat('bust-duke.jpg', 'duke', { tolerance: 30, despillRadius: 2, holes: [[380, 280]] }); // purple coat and skin: only the flat background colour goes
await cutOutFlat('bust-martha.jpg', 'martha', { tolerance: 10, smokeBox: [[60, 215, 700, 720], [700, 215, 990, 515]], smokeColour: 'own', holes: [[744, 790]] }); // her purple smoke stays purple and see-through
// 20 Oct: the Yawning Portal's new opponents (not in the game yet), Darren Snakehands and the Wild Magic Hot Tub.
await cutOutFlat('bust-ridgeler.jpg', 'ridgeler', { smokeBox: [630, 470, 1024, 790] }); // the hammer's glow over the background (above the leather grip)
await cutOutFlat('bust-vaelin-inkhand.jpg', 'vaelin-inkhand', { smokeBox: [600, 70, 1010, 700] }); // his inky black flame
await cutOutFlat('bust-stason.jpg', 'stason');
await cutOutFlat('bust-sylvester.jpg', 'sylvester');
await cutOutFlat('bust-darren.jpg', 'darren');
await cutOutFlat('bust-bard.jpg', 'bard');
await cutOutFlat('bust-kram.jpg', 'kram', { holes: [[484, 500]] }); // background enclosed by her hair, left of her cheek
await cutOutFlat('bust-elf-kid.jpg', 'elf-kid', { tolerance: 30, holes: [[238, 1010]] }); // the vial's pink liquid stays; background enclosed between his sleeve and waistcoat
await cutOutFlat('hot-tub.jpg', 'hot-tub');
await spotScene('shrine.jpg', 'shrine');
// 21 Oct: Martha's three disguises, each face held up as a mask (the eye holes and the gap under her wrist go), and Brodor.
await cutOutFlat('bust-martha-frak.jpg', 'martha-frak', { holes: [[772, 576], [873, 607], [760, 830]] });
await cutOutFlat('bust-martha-duke.jpg', 'martha-duke', { tolerance: 30, holes: [[771, 579], [871, 611], [760, 829]] }); // the purple mask stays
await cutOutFlat('bust-martha-danhausen.jpg', 'martha-danhausen', { holes: [[768, 572], [886, 606], [761, 833]] });
await cutOutFlat('bust-brodor.jpg', 'brodor', { holes: [[891, 424], [968, 564], [888, 343], [134, 961], [890, 473], [55, 591], [806, 439], [952, 409], [901, 303], [839, 452], [998, 733], [982, 668], [25, 659], [22, 869], [128, 1011]] });
await cutOutFlat('devil-sixes.jpg', 'devil-sixes', { maxHeight: 900 }); // three 6s: the devil's moment
await livingMask('devil-sixes');
// Ability paintings (26 Oct): shown as the ability's moment plays (ABILITY_ART in Hud).
await cutOutFlat('ability-mind-whip.jpg', 'ability-mind-whip', { maxHeight: 900, holes: [[216, 284], [192, 248], [384, 200], [318, 330], [270, 360], [294, 366], [336, 408], [324, 426], [312, 438]] }); // background inside the ribbon's loop
await cutOutFlat('ability-cursed.jpg', 'ability-cursed', { maxHeight: 900, tolerance: 10, smokeBox: [[150, 700, 720, 1264]], smokeColour: 'own' }); // his purple smoke stays purple, fading out
await cutOutFlat('ability-devil.jpg', 'ability-devil', { maxHeight: 900 });
await cutOutFlat('ability-disguises.jpg', 'ability-disguises', { maxHeight: 900, holes: [[164, 210], [152, 234], [222, 108], [270, 126], [222, 156], [318, 294], [584, 246], [620, 270], [592, 286], [522, 189], [654, 534], [740, 560]] }); // (and the purple mask's horn curl, the white mask's eyes) // inside her raised arm
await cutOutFlat('ability-back-of-the-head.jpg', 'ability-back-of-the-head', { maxHeight: 900, tolerance: 50, minPiece: 0.001, trails: { colour: [215, 185, 150], boxes: [[600, 330, 695, 510], [695, 448, 820, 510]] } });
await cutOutFlat('ability-inkfire.jpg', 'ability-inkfire', { maxHeight: 900, smokeBox: [500, 60, 800, 700], smokeMinBlue: 5 });
await cutOutFlat('ability-flourish.jpg', 'ability-flourish', { maxHeight: 900, tolerance: 50, minPiece: 0.001, trails: { colour: [212, 178, 132], reach: 22, boxes: [[0, 0, 340, 1200], [600, 0, 896, 250], [720, 250, 896, 1200], [600, 680, 720, 1200]] }, holes: [[808, 874], [787, 444], [702, 807], [809, 394], [762, 831], [123, 905], [165, 318], [107, 896], [72, 852], [141, 372], [106, 876], [696, 276], [702, 753]] });
await cutOutFlat('ability-written-in-the-stars.jpg', 'ability-written-in-the-stars', { maxHeight: 900 });
await cutOutFlat('ability-reach-around.jpg', 'ability-reach-around', { maxHeight: 900 });
await cutOutFlat('ability-astral-flood.jpg', 'ability-astral-flood', { maxHeight: 900, soften: { boxes: [[180, 0, 850, 420]], radius: 12 }, holes: [[839, 728], [221, 751], [951, 800], [122, 857], [247, 863], [749, 890], [135, 832], [903, 819], [312, 845], [762, 832], [32, 723], [996, 741], [739, 865], [136, 792], [886, 798]] });
await cutOutFlat('ability-smooth-talk.jpg', 'ability-smooth-talk', { maxHeight: 900, tolerance: 30, holes: [[414, 180], [294, 424]], minPiece: 0.00002, trails: [{ colour: [245, 200, 120], reach: 35, boxes: [[90, 320, 325, 660], [520, 420, 660, 525]] }, { colour: [255, 70, 60], reach: 30, boxes: [[565, 120, 640, 330]] }], fade: { bottom: 60 } }); // his golden sparkle swirls and the potion's red glow stay, see-through
await cutOutFlat('ability-the-cloak.jpg', 'ability-the-cloak', { maxHeight: 900, holes: [[777, 496], [751, 419], [822, 326], [712, 489], [833, 808], [293, 421], [415, 180]], trails: [{ colour: [60, 78, 92], reach: 20, boxes: [[0, 540, 330, 820], [640, 380, 848, 900]] }, { colour: [20, 28, 38], reach: 20, boxes: [[0, 700, 220, 800]] }], fade: { left: 90, right: 40, bottom: 60 } }); // his smoky wisps and the thin cloak's edge stay see-through; background between the folds and the arm
await cutOutFlat('ability-divine-smite.jpg', 'ability-divine-smite', { maxHeight: 900, holes: [[412, 203], [478, 164], [961, 91], [553, 186], [580, 196], [524, 176], [709, 62]], glow: { boxes: [[590, 0, 1024, 440], [680, 440, 1024, 480]] }, fade: { right: 30, bottom: 60 } }); // the hammer's gold flame stays bright and see-through; background between his arm, head and the handle
