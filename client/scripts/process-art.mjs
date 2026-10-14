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

async function backdrop() {
    const info = await sharp(path.join(ART, 'tavern-backdrop.jpg')).webp({ quality: 78 }).toFile(path.join(OUT, 'tavern.webp'));
    console.log(`tavern.webp  ${info.width}x${info.height}  ${Math.round(info.size / 1024)} KB`);
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

await surfaces();
await backdrop();
await slotPlates();
await cutOut('bust-molar.jpg', 'molar', { fireBox: [704, 60, 864, 790], patches: [[684, 300, 760, 700, 85, 110, 190], [668, 555, 760, 705, 255]] });
await cutOut('bust-klarg.jpg', 'klarg', { fireBox: [1005, 230, 1191, 896], patches: [[888, 408, 1006, 515, 30], [1075, 230, 1191, 896, 255]] });
await cutOut('bust-rokr.jpg', 'rokr');
await cutOut('bust-hangman.jpg', 'hangman', { strict: true, tolerance: 9, maxChroma: 12, patches: [[655, 320, 745, 445, 22, 0, 50]] });
await cutOut('bust-jaguar.jpg', 'jaguar');
