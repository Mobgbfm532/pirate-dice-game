// Klarg's paw for Reach Around (9 Nov): cut from his ability painting, the painted die erased so the
// real one sits in his grip, faded where the arm runs on. Run: node client/scripts/klarg-paw.cjs
const path = require('path');
const sharp = require('../node_modules/sharp');
const [X, Y, W, H] = [95, 500, 480, 400];
// The painted die's outline (in the crop), a little generous.
const OUTLINE = [[48, 200], [120, 166], [212, 186], [216, 302], [156, 342], [46, 278]];
function inside(x, y) {
    let c = false;
    for (let i = 0, j = OUTLINE.length - 1; i < OUTLINE.length; j = i++) {
        const [xi, yi] = OUTLINE[i], [xj, yj] = OUTLINE[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
}
(async () => {
    const { data, info } = await sharp(path.join(__dirname, '../public/art/ability-reach-around.webp')).extract({ left: X, top: Y, width: W, height: H }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const max = Math.max(r, g, b), min = Math.min(r, g, b), sat = max ? (max - min) / max : 0, lum = (r + g + b) / 3;
        // The painted die is cut out (inside its outline, whatever is dark or grey; the fur and claws
        // over it stay): the real one, the die he takes, sits in his grip instead.
        if (inside(x, y) && (lum < 75 || sat < 0.26)) data[i + 3] = 0;
        // Fade where the arm runs on into his body: the right side and the top.
        const fr = Math.min(1, Math.max(0, (W - 30 - x) / 110));
        const ft = Math.min(1, Math.max(0, (y - 10) / 60));
        data[i + 3] = Math.round(data[i + 3] * Math.min(fr, ft));
    }
    await sharp(data, { raw: { width: W, height: H, channels: 4 } }).webp({ quality: 90 }).toFile(path.join(__dirname, '../public/art/klarg-paw.webp'));
    console.log('ok');
})();
