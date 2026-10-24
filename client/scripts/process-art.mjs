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
// of the biggest one (the character).
function keepMainShape(img, mask) {
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
    for (let p = 0; p < mask.length; p++) if (!mask[p] && sizes[label[p]] < biggest * 0.02) mask[p] = 1;
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
// Returns the alpha to apply after applyMask.
function veil(img, mask, bg, [x0, y0, x1, y1]) {
    const { data, width } = img;
    const alpha = new Map();
    const excess = Math.max(1, bg[0] - bg[1]);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const p = y * width + x, i = p * 4;
        if (mask[p]) continue;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (r - g <= 0 || r - g > 1.3 * excess || b - g < -25) continue;
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
//   smokeColour  'grey' (Frak's cigar) turns that smoke grey; 'own' keeps it coloured (lilac)
//              (Martha's purple smoke; pair it with a low tolerance so the flood leaves it);
//              then smokeBox may also be a list of boxes
async function cutOutFlat(file, name, { maxHeight = 720, tolerance = 80, minRed = 45, minBlue = 15, pocket = 14, despillRadius = 6, smokeBox = null, smokeColour = 'grey', holes = [], noSmoke = null } = {}) {
    if (!wanted(name)) return;
    const img = await readRgba(file);
    const { mask, bg } = floodFlat(img, { tolerance, minRed, minBlue, pocket, holes });
    if (noSmoke) eraseSmoke(img, mask, bg, noSmoke);
    keepMainShape(img, mask);
    const smoke = !smokeBox ? null : smokeColour === 'own' ? tintVeil(img, mask, bg, Array.isArray(smokeBox[0]) ? smokeBox : [smokeBox], tolerance) : veil(img, mask, bg, smokeBox);
    despill(img, mask, bg, despillRadius, smoke);
    applyMask(img, mask);
    smoke?.forEach((a, p) => { img.data[p * 4 + 3] = Math.round(img.data[p * 4 + 3] * a); });
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
}

// Tiling wood for the 3D table, and parchment for dialogs (used once per panel, not tiled).
async function surfaces() {
    const textures = path.resolve(here, '../public/textures');
    // Every plank ends in a dark joint at both image edges; trimming one edge's worth means
    // two tiles meet as a single, normal-width joint.
    const planks = await sharp(path.join(ART, 'table-planks.jpg')).metadata();
    const outputs = [
        [sharp(path.join(ART, 'table-planks.jpg')).extract({ left: 0, top: 0, width: planks.width - 6, height: planks.height }), textures, 'table-planks.webp'],
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
await cutOut('bust-jaguar.jpg', 'jaguar');
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
await cutOutFlat('hot-tub.jpg', 'hot-tub');
await spotScene('shrine.jpg', 'shrine');
// 21 Oct: Martha's three disguises, each face held up as a mask (the eye holes and the gap under her wrist go), and Brodor.
await cutOutFlat('bust-martha-frak.jpg', 'martha-frak', { holes: [[772, 576], [873, 607], [760, 830]] });
await cutOutFlat('bust-martha-duke.jpg', 'martha-duke', { tolerance: 30, holes: [[771, 579], [871, 611], [760, 829]] }); // the purple mask stays
await cutOutFlat('bust-martha-danhausen.jpg', 'martha-danhausen', { holes: [[768, 572], [886, 606], [761, 833]] });
await cutOutFlat('bust-brodor.webp', 'brodor');
await cutOutFlat('devil-sixes.jpg', 'devil-sixes', { maxHeight: 900 }); // three 6s: the devil's moment
await livingMask('devil-sixes');
