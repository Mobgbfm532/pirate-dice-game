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
    await toSharp(img).flatten({ background: '#ff00ff' }).resize({ height: 500 }).jpeg().toFile(path.join(PREVIEW, `${name.replaceAll('/', '-')}.jpg`));
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
function floodFlat(img, { tolerance, minRed, minBlue, pocket, holes = [], redOverBlue = -Infinity, green = false, background = null }) {
    const { data, width, height } = img;
    const border = [];
    for (let x = 0; x < width; x++) border.push(x, (height - 1) * width + x);
    for (let y = 0; y < height; y++) border.push(y * width, y * width + width - 1);
    const median = c => border.map(p => data[p * 4 + c]).sort((a, b) => a - b)[border.length >> 1];
    const bg = background ?? [median(0), median(1), median(2)]; // (background: when dark paint fills most of the border)
    // Close to the background AND magenta-ish (red and blue both above green): skin and
    // brown cloth in shadow can come close in plain distance, but their blue sits below green.
    const near = p => {
        const i = p * 4, r = data[i], g = data[i + 1], b = data[i + 2];
        // A green screen (`green`, 4 Nov: Mystery Flavour's lime): green well above red and blue
        // instead (brass sits close in plain distance, but its red is above its green).
        if (green) return Math.hypot(r - bg[0], g - bg[1], b - bg[2]) < tolerance && g - r > 8 && g - b > 60;
        return Math.hypot(r - bg[0], g - bg[1], b - bg[2]) < tolerance && r - g > minRed && b - g > minBlue && r - b > redOverBlue;
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
// Over a green screen the spill is green. Near the edge, a pixel whose green stands above its red
// (brass and wood keep red above green) is part background: how much, from how far green sits
// above blue against the background's own; that share turns see-through and is taken out of its
// colour (the violet smoke's soft edge). Returns the alpha to apply after applyMask.
function despillGreen(img, mask, bg, radius) {
    const alpha = new Map();
    const span = Math.max(1, bg[1] - bg[2]);
    const { data, width, height } = img;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const p = y * width + x;
        if (mask[p]) continue;
        // (radius Infinity, `green: 'all'`: everywhere, not only by the edge; for a painting with no
        // green of its own, whose see-through magic encloses pockets of the background: Áéd's, 13 Nov)
        let edge = radius === Infinity;
        for (let dy = -radius; dy <= radius && !edge; dy++) for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < width && ny < height && mask[ny * width + nx]) { edge = true; break; }
        }
        if (!edge) continue;
        const i = p * 4, r = data[i], g = data[i + 1], b = data[i + 2];
        if (g <= r + 2) continue;
        const t = Math.min(1, Math.max(0, (g - b) / span));
        if (t <= 0) continue;
        const a = 1 - t;
        alpha.set(p, a < 0.15 ? 0 : a);
        if (a >= 0.15) for (let c = 0; c < 3; c++) data[i + c] = Math.max(0, Math.min(255, Math.round((data[i + c] - t * bg[c]) / a)));
        data[i + 1] = Math.min(data[i + 1], Math.max(data[i], data[i + 2]));
    }
    return alpha;
}

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
//              warm colours and turns see-through by how bright it is (glowToAlpha); colour: 'light'
//              for a cool or pale flame (cyan, white) instead of a warm one
//   redOverBlue  how far red must sit above blue to count as background (none): on a crimson
//              background, keeps violet that has as much blue as red (Purple Haze's smoke)
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
function glowToAlpha(img, mask, bg, { boxes, min = 0.06, solid = 0.97, colour = 'warm' }, alpha = new Map()) {
    const light = colour === 'light' || colour === 'cyan';
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
        if (a < min) { if (mask[p] || light) continue; a = min; }
        const f = [0, 1, 2].map(k => Math.max(0, Math.min(255, Math.round(bg[k] + (data[i + k] - bg[k]) / a))));
        // 'light' (the Lady's Grace candle, 29 Oct): a cyan flame and its pale glow; any bright colour
        // with plenty of green and some blue (cyan, white, pale gold) is glow; the wick and pink are not.
        // 'cyan' (Yvesil's staff, 9 Nov): only a glow with plenty of blue in it; her green hand isn't.
        const isGlow = colour === 'cyan' ? f[1] >= 150 && f[2] >= 150 : light ? f[1] >= 160 && f[2] >= 90 : f[0] >= f[1] && f[1] >= f[2] - 10 && f[0] - f[2] > 60;
        if (!isGlow) {
            // Not flame: still pink (blue over green, red well over it) or dusky rose is the background
            // showing through the faintest wisps; it goes (keep red cloth and leather out of the boxes).
            const r = data[i], g = data[i + 1], b = data[i + 2];
            if (!mask[p] && ((b > g && r - g > 25) || (r - g > 60 && g < 100 && b >= g - 12))) mask[p] = 1;
            continue;
        }
        for (let k = 0; k < 3; k++) data[i + k] = f[k];
        mask[p] = 0;
        // 'light': the faint outer glow fades in from nothing (no ring at `min`) and fades out over
        // the box's last 24 px (no straight line where the box ends).
        alpha.set(p, light ? a * Math.min(1, (a - min) / min) * Math.min(1, (y1 - y) / 24) : a);
    }
    return alpha;
}

// Item icons (Thom's Thonics, 28 Oct; Elf Bars, keepsakes next): `icon: 320` fits the trimmed
// cut-out inside a square of that many px, a few px in from each side, centred on transparency.
async function squareIcon(trimmed, size, pad = Math.round(size / 40)) {
    const inner = size - 2 * pad;
    const fitted = await sharp(trimmed).resize({ width: inner, height: inner, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
    return sharp(fitted).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } });
}

async function cutOutFlat(file, name, { maxHeight = 720, tolerance = 80, minRed = 45, minBlue = 15, pocket = 14, despillRadius = 6, smokeBox = null, smokeColour = 'grey', holes = [], noSmoke = null, minPiece = 0.02, smokeMinBlue = -25, trails = null, soften = null, fade = null, glow = null, icon = null, redOverBlue = -Infinity, green = false } = {}) {
    if (!wanted(name)) return;
    const img = await readRgba(file);
    const { mask, bg } = floodFlat(img, { tolerance, minRed, minBlue, pocket, holes, redOverBlue, green });
    if (noSmoke) eraseSmoke(img, mask, bg, noSmoke);
    keepMainShape(img, mask, minPiece);
    const boxes = !smokeBox ? null : Array.isArray(smokeBox[0]) ? smokeBox : [smokeBox];
    let smoke = !boxes ? null : smokeColour === 'own' ? tintVeil(img, mask, bg, boxes, tolerance) : veil(img, mask, bg, boxes, smokeMinBlue);
    if (glow) smoke = glowToAlpha(img, mask, bg, glow, smoke ?? undefined);
    for (const t of trails ? [].concat(trails) : []) smoke = unmixTrails(img, mask, bg, t, smoke ?? undefined);
    if (soften) smoke = feather(img, mask, soften, smoke ?? undefined);
    if (green) { const a = despillGreen(img, mask, bg, green === 'all' ? Infinity : despillRadius); a.forEach((v, p) => { smoke = smoke ?? new Map(); smoke.set(p, Math.min(smoke.get(p) ?? 1, v)); }); }
    else despill(img, mask, bg, despillRadius, smoke);
    applyMask(img, mask);
    smoke?.forEach((a, p) => { img.data[p * 4 + 3] = Math.round(img.data[p * 4 + 3] * a); });
    if (fade) fadeEdges(img, fade);
    await writePreview(name, img);
    const trimmed = await toSharp(img).png().toBuffer().then(b => sharp(b).trim({ threshold: 1 }).toBuffer());
    const sized = icon ? await squareIcon(trimmed, icon) : sharp(trimmed).resize({ height: maxHeight, withoutEnlargement: true });
    mkdirSync(path.dirname(path.join(OUT, name)), { recursive: true });
    const info = await sized.webp({ quality: 82, alphaQuality: 90 }).toFile(path.join(OUT, `${name}.webp`));
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
    // The Salty Swallow at sea (the user's, 9 Nov): the gun deck under way, for its four fights and
    // its scenes; the ship leaving harbour, for the scene as it sets sail; and the ship at the quay, for
    // Skipper Bren's welcome (the user's second harbour painting, 9 Nov).
    for (const name of ['salty-swallow-at-sea', 'salty-swallow-sets-sail', 'salty-swallow-quay']) {
        const info = await sharp(path.join(ART, `${name}.jpg`)).webp({ quality: 80 }).toFile(path.join(OUT, `${name}.webp`));
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

// A box blur of a one-channel map, done twice (near enough a soft Gaussian).
function blur(src, size, radius) {
    let a = src, b = new Float32Array(size * size);
    for (let pass = 0; pass < 4; pass++) {
        const horizontal = pass % 2 === 0;
        for (let j = 0; j < size; j++) {
            let sum = 0, count = 0;
            const at = k => (horizontal ? j * size + k : k * size + j);
            for (let k = 0; k <= radius; k++) { sum += a[at(k)]; count++; }
            for (let k = 0; k < size; k++) {
                b[at(k)] = sum / count;
                if (k + radius + 1 < size) { sum += a[at(k + radius + 1)]; count++; }
                if (k - radius >= 0) { sum -= a[at(k - radius)]; count--; }
            }
        }
        [a, b] = [b, a];
    }
    return a;
}

// The blobs where a map is over a cut-off, away from the face's rim: each one's middle, its size
// (the larger of its width and height) and whether it is roundish (fills its box like a circle).
function blobsOver(map, size, cutoff) {
    const seen = new Uint8Array(size * size), out = [];
    const inside = (x, y) => Math.min(x, y, size - 1 - x, size - 1 - y) > size * 0.1;
    for (let start = 0; start < size * size; start++) {
        if (seen[start] || map[start] <= cutoff || !inside(start % size, (start / size) | 0)) continue;
        const stack = [start];
        seen[start] = 1;
        let n = 0, sx = 0, sy = 0, x0 = size, y0 = size, x1 = 0, y1 = 0;
        while (stack.length) {
            const i = stack.pop(), x = i % size, y = (i / size) | 0;
            n++; sx += x; sy += y;
            x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
            for (const j of [i - 1, i + 1, i - size, i + size]) {
                const jx = j % size, jy = (j / size) | 0;
                if (j < 0 || j >= size * size || seen[j] || Math.abs(jx - x) > 1 || map[j] <= cutoff || !inside(jx, jy)) continue;
                seen[j] = 1;
                stack.push(j);
            }
        }
        const w = x1 - x0 + 1, h = y1 - y0 + 1, fill = n / (w * h);
        out.push({ x: sx / n, y: sy / n, size: Math.max(w, h), round: fill > 0.6 && fill < 0.92 && Math.max(w, h) / Math.min(w, h) < 1.35 });
    }
    return out;
}

// Opponents' own dice (3 Nov, the user's paintings): art/dice-<id>.jpg, six faces in a 3 by 2 grid
// (1-2-3, 4-5-6) on a plain background, each opponent's id as in TAVERN_ENCOUNTERS. Each face is
// found by where it differs from the background, cut to its outer edge and laid out at 512 px in
// a 3 by 2 sheet (textures/dice/<id>.webp). The pips' engraving can't be guessed from darkness on
// a coloured die (light pips on dark faces, gold on red), so it is found here: a pip is wherever the
// face's middle differs from the face's own colour (textures/dice/<id>-cut.webp, white high).
// (McGrath keeps the Molar's id; his painting is dice-mcgrath.jpg.)
const DICE_SETS = ['molar', 'frak', 'danhausen', 'duke', 'martha', 'sylvester', 'vaelin', 'stason', 'ridgeler', 'brodor', 'klarg', 'rokr', 'aed', 'hangman', 'jaguar']; // (the Yawning Portal's and the ship's, the user's, 13 Nov)
const LIFT = { power: 1.25, vivid: 1.05 }; // how much lighter (1: as painted) and more vivid (1.5 and 1.2 until 5 Nov: neon on the table)
const LAYOUT_SETS = new Set(['stason', 'ridgeler', 'brodor', 'klarg', 'jaguar']);
const PIP_LAYOUT = [[[0, 0]], [[1, -1], [-1, 1]], [[1, -1], [0, 0], [-1, 1]], [[-1, -1], [1, -1], [-1, 1], [1, 1]], [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]]];
// (13 Nov, the user's) The silver sets stay darker, like steel: lifted, they came out nearly white on the table.
const LIFT_FOR = { stason: { power: 0.7, vivid: 1 }, ridgeler: { power: 0.7, vivid: 1 } };
const CLEAN = { detail: 0.35, radius: 40 }; // how much of the painting's broad colour stays (0: one even colour), and how broad
const RING_ONE = { duke: [214, 172, 76], hangman: [226, 214, 186] }; // the Duke's gold; the Hangman's bone (13 Nov: his dark red 1 sank into the black wood)
const diceFile = id => `dice-${id === 'molar' ? 'mcgrath' : id}.jpg`;
async function diceSheets() {
    const dir = path.resolve(here, '../public/textures/dice');
    mkdirSync(dir, { recursive: true });
    const F = 512;
    const dist = (d, i, c) => Math.hypot(d[i] - c[0], d[i + 1] - c[1], d[i + 2] - c[2]);
    const median = values => { const s = [...values].sort((a, b) => a - b); return s[s.length >> 1]; };
    for (const id of (process.env.SETS ? process.env.SETS.split(',') : DICE_SETS)) { // (SETS=a,b: only those)
        const { data, width, height } = await readRgba(diceFile(id));
        // The background: the median colour along the border.
        const edge = [[], [], []];
        for (let x = 0; x < width; x += 3) for (const y of [2, height - 3]) { const i = (y * width + x) * 4; for (let c = 0; c < 3; c++) edge[c].push(data[i + c]); }
        for (let y = 0; y < height; y += 3) for (const x of [2, width - 3]) { const i = (y * width + x) * 4; for (let c = 0; c < 3; c++) edge[c].push(data[i + c]); }
        const bg = edge.map(median);
        const faces = [], cuts = [], found = [], fars = [];
        for (let n = 0; n < 6; n++) {
            const cx0 = Math.round((n % 3) * width / 3), cx1 = Math.round((n % 3 + 1) * width / 3);
            const cy0 = Math.round(Math.floor(n / 3) * height / 2), cy1 = Math.round((Math.floor(n / 3) + 1) * height / 2);
            // The face's box: rows and columns with a good run of non-background pixels.
            const cols = new Array(cx1 - cx0).fill(0), rows = new Array(cy1 - cy0).fill(0);
            for (let y = cy0; y < cy1; y++) for (let x = cx0; x < cx1; x++) {
                if (dist(data, (y * width + x) * 4, bg) > 40) { cols[x - cx0]++; rows[y - cy0]++; }
            }
            const span = (counts, min) => [counts.findIndex(v => v > min), counts.length - 1 - [...counts].reverse().findIndex(v => v > min)];
            const [x0, x1] = span(cols, (cy1 - cy0) * 0.15), [y0, y1] = span(rows, (cx1 - cx0) * 0.15);
            const box = { left: cx0 + x0, top: cy0 + y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
            const face = await sharp(path.join(ART, diceFile(id))).extract(box).resize(F, F, { fit: 'fill' }).removeAlpha().raw().toBuffer();
            // The face's own colour: the median over a ring between its rim and its pips.
            const ring = [[], [], []];
            for (let y = 0; y < F; y += 2) for (let x = 0; x < F; x += 2) {
                const e = Math.min(x, y, F - 1 - x, F - 1 - y) / F;
                if (e > 0.1 && e < 0.16) { const i = (y * F + x) * 3; for (let c = 0; c < 3; c++) ring[c].push(face[i + c]); }
            }
            const own = ring.map(median);
            // How far each point is from the face's colour, softened so a pip's highlight counts
            // as pip; then the highest cut-off that leaves exactly as many round blobs as the face
            // has pips. Each pip is engraved as a clean disc where its blob is.
            const far = new Float32Array(F * F);
            for (let i = 0; i < F * F; i++) far[i] = Math.hypot(face[i * 3] - own[0], face[i * 3 + 1] - own[1], face[i * 3 + 2] - own[2]);
            fars.push(Float32Array.from(far));
            const soft = blur(far, F, 6);
            let pips = null;
            for (let t = 110; t >= 20 && !pips; t -= 5) {
                const blobs = blobsOver(soft, F, t).filter(b => b.round && b.size > F * 0.06 && b.size < F * 0.3);
                if (blobs.length === n + 1) pips = blobs;
            }
            // (A 1 painted close to its face's colour, as the Duke's crimson on red, may not stand out
            // enough: it sits in the middle, the size of the set's other pips.)
            // (13 Nov: pips that run into a face's engraving, as on Stason's filigree, aren't round blobs;
            // such a face's pips are placed by the standard layout, measured from the set's other faces, below.)
            if (!pips && n > 0) console.log(`dice ${id}: the ${n + 1} pips on face ${n + 1} not found; placed by the set's layout`);
            if (!pips && n === 0) console.log(`dice ${id}: the 1 blends into its face; engraved in the middle`);
            found.push(pips);
            faces.push({ input: face, raw: { width: F, height: F, channels: 3 }, left: (n % 3) * F, top: Math.floor(n / 3) * F });
        }
        // (13 Nov) Sets whose pips sit among engraving, shine or knots (LAYOUT_SETS): the pips are placed by the
        // standard layout fitted to the whole set (its offset from the middle where the pips differ most from the
        // face, each pip then nudged onto its own), and sized where the difference falls away.
        let fitR = null;
        if (LAYOUT_SETS.has(id)) {
            const at = (m, x, y) => m[Math.round(Math.min(F - 1, Math.max(0, y))) * F + Math.round(Math.min(F - 1, Math.max(0, x)))];
            const c = F / 2;
            // How much a disc of radius rr at (x, y) stands out from the ring just around it.
            const disc = (m, x, y, rr) => {
                let inside = 0, ni = 0, ring = 0, nr = 0;
                for (let k = 0.15; k <= 1.45; k += 0.1) for (let a = 0; a < 24; a++) {
                    const v = at(m, x + Math.cos(a * Math.PI / 12) * k * rr, y + Math.sin(a * Math.PI / 12) * k * rr);
                    if (k < 0.9) { inside += v; ni++; } else if (k > 1.1) { ring += v; nr++; }
                }
                return inside / ni - ring / nr;
            };
            // The set's layout: the offset and the pip radius that stand out most over every pip of the set.
            let best = -Infinity, g = F * 0.25, pr = F * 0.1;
            for (let t = Math.round(F * 0.21); t <= F * 0.29; t += 2) for (let rr = Math.round(F * 0.06); rr <= F * 0.12; rr += 2) {
                let sum = 0, cnt = 0;
                fars.forEach((m, n) => PIP_LAYOUT[n].forEach(([dx, dy]) => { sum += disc(m, c + dx * t, c + dy * t, rr); cnt++; }));
                if (sum / cnt > best) { best = sum / cnt; g = t; pr = rr; }
            }
            // Each pip nudged (a few px) to where its own disc stands out most.
            fars.forEach((m, n) => {
                found[n] = PIP_LAYOUT[n].map(([dx, dy]) => {
                    let bx = c + dx * g, by = c + dy * g, top = -Infinity;
                    const x0 = bx, y0 = by;
                    for (let y = y0 - 10; y <= y0 + 10; y += 2) for (let x = x0 - 10; x <= x0 + 10; x += 2) { const v = disc(m, x, y, pr); if (v > top) { top = v; bx = x; by = y; } }
                    return { x: bx, y: by, size: 0 };
                });
            });
            fitR = pr / 1.04;
            console.log(`dice ${id}: laid out (offset ${g} px, pip radius ${fitR} px)`);
        }
        const r = fitR ?? median(found.flat().filter(Boolean).map(b => b.size)) / 2 * 1.04;
        // A face whose pips weren't found gets the standard layout (2 and 3 on the top-right to bottom-left
        // diagonal, 6 in two columns), its offset from the middle the median of the set's found pips.
        const offs = found.slice(1).flat().filter(Boolean).flatMap(b => [Math.abs(b.x - F / 2), Math.abs(b.y - F / 2)]).filter(d => d > F * 0.1);
        if (found.some((p, n) => !p && n > 0)) {
            if (!offs.length) throw new Error(`dice-${id}: no pips found on any face`);
            const g = median(offs), c = F / 2;
            const LAYOUT = [null, [[1, -1], [-1, 1]], [[1, -1], [0, 0], [-1, 1]], [[-1, -1], [1, -1], [-1, 1], [1, 1]], [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]]];
            found.forEach((p, n) => { if (!p && n > 0) found[n] = LAYOUT[n].map(([dx, dy]) => ({ x: c + dx * g, y: c + dy * g })); });
        }
        // Clean, even faces (the user, 3 Nov: the painted dice looked "abrasive" beside the ivory ones).
        // A painting of a die face carries its own lighting: bright streaks, a dark rim, a painted
        // bevel, brush grain; on a lit 3D die that doubled up and looked harsh. So each face's surface
        // (all but its pips) is redrawn as its own colour, evenly, keeping only a gentle trace of the
        // painting's broad colour changes (CLEAN.detail: Martha's mother-of-pearl, a bone's yellowing),
        // and the 3D die adds the light and the worn edges as on the ivory dice. Lighter too (the
        // user, 3 Nov: on a phone the coloured dice sank into the dark felt): the colour is lifted,
        // darks most, and made a little more vivid. Since 5 Nov (the user: as with the ivory dice) each pip
        // is redrawn too, a clean disc of its own colour: the painted ones had pale halos and smudges.
        const L = LIFT_FOR[id] ?? LIFT;
        const lift = rgb => {
            const lifted = rgb.map(v => 255 * (1 - Math.pow(1 - v / 255, L.power)));
            const grey = 0.299 * lifted[0] + 0.587 * lifted[1] + 0.114 * lifted[2];
            return lifted.map(v => Math.min(255, Math.max(0, grey + (v - grey) * L.vivid)));
        };
        found.forEach((pips, n) => {
            const face = faces[n].input;
            const centres = pips ?? [{ x: F / 2, y: F / 2 }];
            const keep = n === 0 && RING_ONE[id] ? F * 0.15 + 3 : r * 0.96;
            const weight = new Float32Array(F * F); // 0 on a pip, 1 on the surface
            for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) {
                const near = Math.min(...centres.map(b => Math.hypot(x - b.x, y - b.y)));
                weight[y * F + x] = Math.min(1, Math.max(0, (near - keep) / 6));
            }
            // The surface's broad colour: a wide blur of the surface alone (pips left out), and the
            // surface's own median colour, which it is drawn towards.
            const w = blur(Float32Array.from(weight), F, CLEAN.radius); // (blur works in place)
            const broad = [0, 1, 2].map(c => {
                const ch = new Float32Array(F * F);
                for (let i = 0; i < F * F; i++) ch[i] = face[i * 3 + c] * weight[i];
                return blur(ch, F, CLEAN.radius);
            });
            const mid = [0, 1, 2].map(c => median(Array.from({ length: F * F }, (_, i) => i).filter(i => weight[i] > 0.99 && i % 7 === 0).map(i => face[i * 3 + c])));
            // Each pip's own colour, from its middle (read before the surface is redrawn).
            const pipColours = n === 0 && RING_ONE[id] ? [] : centres.map(b => {
                const inside = [[], [], []];
                for (let y = Math.round(b.y - r * 0.6); y <= b.y + r * 0.6; y++) for (let x = Math.round(b.x - r * 0.6); x <= b.x + r * 0.6; x++) {
                    if (Math.hypot(x - b.x, y - b.y) > r * 0.6) continue;
                    const i = (y * F + x) * 3;
                    for (let c = 0; c < 3; c++) inside[c].push(face[i + c]);
                }
                return inside.map(median);
            });
            for (let i = 0; i < F * F; i++) {
                const k = weight[i];
                if (k <= 0) continue;
                const even = [0, 1, 2].map(c => mid[c] + ((w[i] > 0.05 ? broad[c][i] / w[i] : mid[c]) - mid[c]) * CLEAN.detail);
                const v = lift(even);
                for (let c = 0; c < 3; c++) face[i * 3 + c] = Math.round(face[i * 3 + c] * (1 - k) + v[c] * k);
            }
            // (13 Nov) A pip close to its face's colour (Brodor's gold studs on gold) gets a dark rim, like a stud's.
            const surface = lift(mid);
            pipColours.forEach((colour, p) => {
                const b = centres[p];
                const rim = Math.hypot(colour[0] - surface[0], colour[1] - surface[1], colour[2] - surface[2]) < 60;
                for (let y = Math.max(0, Math.floor(b.y - r - 2)); y <= Math.min(F - 1, b.y + r + 2); y++) for (let x = Math.max(0, Math.floor(b.x - r - 2)); x <= Math.min(F - 1, b.x + r + 2); x++) {
                    const edge = Math.min(1, Math.max(0, r + 0.75 - Math.hypot(x - b.x, y - b.y)));
                    if (edge <= 0) continue;
                    const i = (y * F + x) * 3;
                    const shade = rim && Math.hypot(x - b.x, y - b.y) > r * 0.74 ? 0.45 : 1;
                    for (let c = 0; c < 3; c++) face[i + c] = Math.round(face[i + c] * (1 - edge) + colour[c] * shade * edge);
                }
            });
        });
        // A 1 that blends into its face (the Duke's crimson on red) is repainted brighter red in a
        // ring of the set's own pip colour (RING_ONE), so it reads from across the table.
        const ringColour = RING_ONE[id];
        if (ringColour) {
            const face = faces[0].input, R = F * 0.15; // (over the whole painted pip)
            for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) {
                const d = Math.hypot(x - F / 2, y - F / 2);
                if (d > R + 1) continue;
                const edge = Math.min(1, Math.max(0, R + 0.5 - d));
                const shade = 1 - 0.25 * Math.max(0, (x + y - F) / (2 * R)); // lit from the top left
                const to = (d < R * 0.72 ? [222, 32, 40] : ringColour).map(c => c * shade);
                const i = (y * F + x) * 3;
                for (let c = 0; c < 3; c++) face[i + c] = Math.round(face[i + c] * (1 - edge) + to[c] * edge);
            }
        }
        found.forEach((pips, n) => {
            pips ??= [{ x: F / 2, y: F / 2 }];
            const radius = n === 0 && ringColour ? F * 0.15 : r;
            const cut = Buffer.alloc(F * F);
            for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) {
                let pip = 0;
                for (const b of pips) pip = Math.max(pip, Math.min(1, Math.max(0, (radius - Math.hypot(x - b.x, y - b.y)) / 4 + 0.5)));
                cut[y * F + x] = Math.round(255 * (1 - pip));
            }
            cuts.push({ input: cut, raw: { width: F, height: F, channels: 1 }, left: (n % 3) * F, top: Math.floor(n / 3) * F });
        });
        const a = await sharp({ create: { width: F * 3, height: F * 2, channels: 3, background: { r: 0, g: 0, b: 0 } } }).composite(faces).webp({ quality: 88 }).toFile(path.join(dir, `${id}.webp`));
        await sharp({ create: { width: F * 3, height: F * 2, channels: 3, background: { r: 255, g: 255, b: 255 } } }).composite(cuts).grayscale().webp({ quality: 90 }).toFile(path.join(dir, `${id}-cut.webp`));
        console.log(`dice ${id}  ${Math.round(a.size / 1024)} KB`);
    }
}

// The intro film's paintings (the user's, 5 Nov). The foreground frame keeps its full size, not trimmed:
// the film places its left and right parts by where they stand in the painting.
async function introFilm() {
    if (!wanted('intro')) return;
    mkdirSync(path.join(OUT, 'intro'), { recursive: true });
    for (const name of ['town', 'door']) {
        const info = await sharp(path.join(ART, `intro-${name}.jpg`)).webp({ quality: 82 }).toFile(path.join(OUT, 'intro', `${name}.webp`));
        console.log(`intro/${name}.webp  ${info.width}x${info.height}  ${Math.round(info.size / 1024)} KB`);
    }
    const img = await readRgba('intro-foreground.jpg');
    const { mask, bg } = floodFlat(img, { tolerance: 80, minRed: 45, minBlue: 15, pocket: 14, holes: [[688, 384], [1105, 310], [1215, 232]], background: [img.data[(384 * img.width + 688) * 4], img.data[(384 * img.width + 688) * 4 + 1], img.data[(384 * img.width + 688) * 4 + 2]] });
    despill(img, mask, bg, 6, null);
    applyMask(img, mask);
    await writePreview('intro-foreground', img);
    const info = await toSharp(img).webp({ quality: 80, alphaQuality: 90 }).toFile(path.join(OUT, 'intro', 'foreground.webp'));
    console.log(`intro/foreground.webp  ${info.width}x${info.height}  ${Math.round(info.size / 1024)} KB  background rgb(${bg.join(',')})`);
}

// The sea die (the user's painting, 9 Nov: sea-green glass, pearl pips, a pink pearl 1, barnacles):
// its six faces cut from their magenta, side by side in one strip, 1 to 6 (`sea-die.webp`, 256 px each).
async function seaDie() {
    if (!wanted('sea-die')) return;
    const img = await readRgba('dice-sea.jpg');
    const { mask } = floodFlat(img, { tolerance: 80, minRed: 45, minBlue: 15, pocket: 14 });
    applyMask(img, mask);
    const { data, width, height } = img;
    const S = 256, faces = [];
    for (let n = 0; n < 6; n++) {
        const cx0 = Math.round((n % 3) * width / 3), cx1 = Math.round((n % 3 + 1) * width / 3);
        const cy0 = Math.round(Math.floor(n / 3) * height / 2), cy1 = Math.round((Math.floor(n / 3) + 1) * height / 2);
        let x0 = cx1, x1 = cx0, y0 = cy1, y1 = cy0;
        for (let y = cy0; y < cy1; y++) for (let x = cx0; x < cx1; x++) if (data[(y * width + x) * 4 + 3] > 128) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        const full = await toSharp(img).png().toBuffer();
        faces.push(await sharp(full).extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }).resize(S, S, { fit: 'fill' }).png().toBuffer());
    }
    const info = await sharp({ create: { width: S * 6, height: S, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite(faces.map((input, i) => ({ input, left: i * S, top: 0 }))).webp({ quality: 86, alphaQuality: 90 }).toFile(path.join(OUT, 'sea-die.webp'));
    console.log(`sea-die.webp  ${info.width}x${info.height}  ${Math.round(info.size / 1024)} KB`);
}

if (!ONLY || ONLY.has('dice')) await diceSheets();
// Rokr's Starry Form: the face hidden dice wear (the user's painting, 9 Nov), cut from inside its painted rim.
if (wanted('starry')) {
    const { width, height } = await sharp(path.join(ART, 'dice-starry.jpg')).metadata();
    const inset = Math.round(width * 0.07);
    const info = await sharp(path.join(ART, 'dice-starry.jpg')).extract({ left: inset, top: inset, width: width - inset * 2, height: height - inset * 2 }).resize(512, 512).webp({ quality: 88 }).toFile(path.resolve(here, '../public/textures/dice/starry.webp'));
    console.log(`dice/starry.webp  ${info.width}x${info.height}  ${Math.round(info.size / 1024)} KB`);
}
await introFilm();
if (!ONLY) {
    await surfaces();
    await backdrop();
    await slotPlates();
}
await cutOut('bust-molar.jpg', 'molar', { fireBox: [704, 60, 864, 790], patches: [[684, 300, 760, 700, 85, 110, 190], [668, 555, 760, 705, 255]] });
await cutOutFlat('bust-klarg.jpg', 'klarg', { holes: [[1000, 310]], fade: { left: 140 } }); // (background between the die and his fingers) // his second painting (13 Nov), on magenta; his cloak runs off the painting's left edge (the first: bust-klarg-v1.jpg, cut with cutOut)
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
// The Salty Swallow's crew (the user's paintings, 9 Nov).
await cutOutFlat('bust-yvesil.jpg', 'yvesil', { holes: [[851, 319]], glow: { boxes: [[990, 0, 1260, 768]], colour: 'cyan', min: 0.1 } }); // the staff's cyan glow stays soft and see-through, her hand as it is (it was cut ragged, 9 Nov) stays soft and see-through (it was cut ragged, 9 Nov)
await cutOutFlat('bust-jorvash.jpg', 'jorvash', { holes: [[977, 483], [565, 604], [1016, 483]] });
// Áéd, the dragon sorcerer (the user's, 11 Nov): after Rokr aboard the Salty Swallow.
await cutOutFlat('bust-aed.jpg', 'aed', { redOverBlue: 22 }); // (the violet heart and wisps are bluer than the pink background: kept)
await cutOutFlat('bust-bren.jpg', 'bren', { holes: [[760, 766]] }); // Skipper Bren on the quay (9 Nov); the gap between his arm and his side
// The flying snake that brings Brodor's letter from the docks (the user's, 10 Nov).
await cutOutFlat('flying-snake.jpg', 'flying-snake', { maxHeight: 640, holes: [[482, 286], [420, 876], [432, 911]] }); // behind its neck, under the scroll; inside the tail's curl
// The sea die's dial and its needle (the user's, 9 Nov): the needle turns about the middle of its hub's ring.
await cutOutFlat('sea-dial.jpg', 'sea-dial', { maxHeight: 768 });
await cutOutFlat('sea-dial-needle.jpg', 'sea-dial-needle', { holes: [[703, 665]], maxHeight: 768 });
await seaDie();
await cutOutFlat('bust-kram.jpg', 'kram', { holes: [[484, 500]] }); // background enclosed by her hair, left of her cheek
await cutOutFlat('bust-elf-kid.jpg', 'elf-kid', { tolerance: 30, holes: [[238, 1010]] }); // the vial's pink liquid stays; background enclosed between his sleeve and waistcoat
await cutOutFlat('hot-tub.jpg', 'hot-tub');
await spotScene('shrine.jpg', 'shrine');
await spotScene('shrine-ship.jpg', 'shrine-ship'); // (aboard the Salty Swallow, the user's, 10 Nov)
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
await cutOutFlat('ability-reach-around.jpg', 'ability-reach-around', { maxHeight: 900, fade: { left: 90, right: 40, bottom: 60 } }); // his second painting (13 Nov; the first: ability-reach-around-v1.jpg, which klarg-paw.cjs cut the paw from)
await cutOutFlat('ability-astral-flood.jpg', 'ability-astral-flood', { maxHeight: 900, soften: { boxes: [[180, 0, 850, 420]], radius: 12 }, holes: [[839, 728], [221, 751], [951, 800], [122, 857], [247, 863], [749, 890], [135, 832], [903, 819], [312, 845], [762, 832], [32, 723], [996, 741], [739, 865], [136, 792], [886, 798]] });
await cutOutFlat('ability-smooth-talk.jpg', 'ability-smooth-talk', { maxHeight: 900, tolerance: 30, holes: [[414, 180], [294, 424]], minPiece: 0.00002, trails: [{ colour: [245, 200, 120], reach: 35, boxes: [[90, 320, 325, 660], [520, 420, 660, 525]] }, { colour: [255, 70, 60], reach: 30, boxes: [[565, 120, 640, 330]] }], fade: { bottom: 60 } }); // his golden sparkle swirls and the potion's red glow stay, see-through
await cutOutFlat('ability-the-cloak.jpg', 'ability-the-cloak', { maxHeight: 900, holes: [[777, 496], [751, 419], [822, 326], [712, 489], [833, 808], [293, 421], [415, 180]], trails: [{ colour: [60, 78, 92], reach: 20, boxes: [[0, 540, 330, 820], [640, 380, 848, 900]] }, { colour: [20, 28, 38], reach: 20, boxes: [[0, 700, 220, 800]] }], fade: { left: 90, right: 40, bottom: 60 } }); // his smoky wisps and the thin cloak's edge stay see-through; background between the folds and the arm
// The ship's (the user's paintings, 9 Nov).
await cutOutFlat('ability-starry-form.jpg', 'ability-starry-form', { maxHeight: 900, minPiece: 0.0005, holes: [[678, 161], [262, 348], [251, 643], [287, 674], [895, 464], [1042, 335], [428, 338], [222, 616], [978, 374], [848, 240], [169, 488], [444, 363], [948, 302]] });
await cutOutFlat('ability-penitent-stare.jpg', 'ability-penitent-stare', { maxHeight: 900 });
await cutOutFlat('ability-ace-of-spades.jpg', 'ability-ace-of-spades', { maxHeight: 900, holes: [[315, 373]] });
await cutOutFlat('ability-all-in.jpg', 'ability-all-in', { maxHeight: 900, minPiece: 0.0005, holes: [[823, 505], [404, 534], [923, 611]] });
// Áéd's Unlimited Power (the user's, 13 Nov): painted on lime green, as his violet magic sits close to magenta.
await cutOutFlat('ability-unlimited-power.jpg', 'ability-unlimited-power', { maxHeight: 900, green: 'all' });
await cutOutFlat('ability-divine-smite.jpg', 'ability-divine-smite', { maxHeight: 900, holes: [[412, 203], [478, 164], [961, 91], [553, 186], [580, 196], [524, 176], [709, 62]], glow: { boxes: [[590, 0, 1024, 440], [680, 440, 1024, 480]] }, fade: { right: 30, bottom: 60 } }); // the hammer's gold flame stays bright and see-through; background between his arm, head and the handle
// Thom's Thonics (28 Oct): the bottles as square item icons (shelf ~28 px, Thom's cart ~40 px, the drinking moment ~200 px)
await cutOutFlat('thonic-healing.jpg', 'thonics/healing', { icon: 320 });
await cutOutFlat('thonic-lastGasp.jpg', 'thonics/lastGasp', { icon: 320 });
await cutOutFlat('thonic-fizzy.jpg', 'thonics/fizzy', { icon: 320 });
await cutOutFlat('thonic-secondThoughts.jpg', 'thonics/secondThoughts', { icon: 320, tolerance: 40 });
await cutOutFlat('thonic-steady.jpg', 'thonics/steady', { icon: 320 });
await cutOutFlat('thonic-clearEye.jpg', 'thonics/clearEye', { icon: 320 });
// The multiplayer reactions (3 Nov, the user's paintings): square item icons like the Thonics (a coin
// ~22 px, a pop ~56 px). The tankard keeps its flying ale drops (a low minPiece) and loses the
// background inside its handle (holes).
await cutOutFlat('reaction-cheers.jpg', 'reactions/cheers', { icon: 320, minPiece: 0.001, holes: [[634, 480]] });
await cutOutFlat('reaction-ha.jpg', 'reactions/ha', { icon: 320 });
await cutOutFlat('reaction-ooh.jpg', 'reactions/ooh', { icon: 320 });
await cutOutFlat('reaction-smug.jpg', 'reactions/smug', { icon: 320 });
await cutOutFlat('reaction-woe.jpg', 'reactions/woe', { icon: 320 });
// Johnny Elf Bar's Elf Bars (28 Oct): square item icons like the Thonics. Holes: the background boxed in
// between the brass frame and the body (and the mouthpiece), and between the vapour swirl's strands.
await cutOutFlat('elfbar-lemonLevitation.jpg', 'elfbars/lemonLevitation', { icon: 320, holes: [[622, 101], [652, 298], [370, 444]] });
await cutOutFlat('elfbar-watermelonHindsight.jpg', 'elfbars/watermelonHindsight', { icon: 320, holes: [[614, 97], [654, 294], [354, 445], [462, 445], [273, 554]] });
await cutOutFlat('elfbar-cottonCandyCloud.jpg', 'elfbars/cottonCandyCloud', { icon: 320, holes: [[611, 95], [658, 286], [336, 445], [466, 445], [591, 557], [244, 948], [235, 1028]] });
await cutOutFlat('elfbar-purpleHaze.jpg', 'elfbars/purpleHaze', { icon: 320, redOverBlue: 15, holes: [[612, 94], [658, 288], [362, 444]] });
// The keepsakes (29 Oct): square item icons like the Thonics (strip button ~26 px, Thom's back shelf ~40 px, the gold burst ~84 px)
await cutOutFlat('keepsake-bentCopper.jpg', 'keepsakes/bentCopper', { icon: 320 });
await cutOutFlat('keepsake-velvetCushion.jpg', 'keepsakes/velvetCushion', { icon: 320 });
await cutOutFlat('keepsake-luckySeat.jpg', 'keepsakes/luckySeat', { icon: 320 });
await cutOutFlat('keepsake-loyaltyCard.jpg', 'keepsakes/loyaltyCard', { icon: 320, holes: [[725, 528], [586, 530], [823, 530], [678, 531], [774, 562], [624, 566], [673, 596], [726, 598], [579, 599]] }); // the punched holes (the potion's red liquid stays)
await cutOutFlat('keepsake-potionBelt.jpg', 'keepsakes/potionBelt', { icon: 320 });
await cutOutFlat('keepsake-loadedDie.jpg', 'keepsakes/loadedDie', { icon: 320 });
await cutOutFlat('keepsake-marthasMask.jpg', 'keepsakes/marthasMask', { icon: 320 }); // its light pink sticker outline stays as the icon's border
await cutOutFlat('keepsake-brodorsSunglasses.jpg', 'keepsakes/brodorsSunglasses', { icon: 320 });
// The Bard's songs, the Lady's Grace and Kram's oath (29 Oct): icons like the keepsakes, for the strip
// The Salty Swallow's omens and refreshments (the user's paintings, 9 Nov).
// (holes: magenta trapped inside each painting, found by flooding from every pocket, 9 Nov.)
const SHIP_ICON_HOLES = { notaroRed: [[948, 363], [829, 566], [893, 372], [877, 308]], fairWinds: [[641, 525]], albatross: [[799, 608], [700, 643], [831, 287]], blackSpot: [[378, 559]] };
for (const id of ['notaroRed', 'ebonShield', 'fairWinds', 'followingSea', 'albatross', 'blackSpot']) await cutOutFlat(`keepsake-${id}.jpg`, `keepsakes/${id}`, { icon: 320, holes: SHIP_ICON_HOLES[id] ?? [] });
await cutOutFlat('keepsake-inspiringSong.jpg', 'keepsakes/inspiringSong', { icon: 320, minPiece: 0.001 }); // the floating notes stay
await cutOutFlat('keepsake-cuttingWords.jpg', 'keepsakes/cuttingWords', { icon: 320 });
await cutOutFlat('keepsake-ladysGrace.jpg', 'keepsakes/ladysGrace', { icon: 320, holes: [[548, 540]], glow: { boxes: [[575, 70, 850, 294]], colour: 'light', min: 0.12 } }); // the cyan flame keeps a soft see-through glow; the handle's loop
await cutOutFlat('keepsake-kram.jpg', 'keepsakes/kram', { icon: 320 });
// Three more keepsakes (30 Oct): the Miser's Purse, the Bottomless Flask, the Gambler's Charm
await cutOutFlat('keepsake-misersPurse.jpg', 'keepsakes/misersPurse', { icon: 320 });
await cutOutFlat('keepsake-bottomlessFlask.jpg', 'keepsakes/bottomlessFlask', { icon: 320, holes: [[457, 426]] }); // inside the swirl's curl
// Martha's Mystery Flavour (4 Nov), painted on lime green (its smoke is violet): `green`, and a
// `holes` seed for each pocket inside the smoke's question-mark curl.
await cutOutFlat('keepsake-mysteryFlavour.jpg', 'keepsakes/mysteryFlavour', { icon: 320, green: true, holes: [[596, 59], [623, 237], [454, 78]] });
await cutOutFlat('keepsake-gamblersCharm.jpg', 'keepsakes/gamblersCharm', { icon: 320, holes: [[903, 112], [649, 266], [664, 375], [661, 412], [654, 348], [670, 497]] }); // the cord's loop knot, the ring, between the wires, between the die and the clover
