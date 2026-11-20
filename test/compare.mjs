// Before/after comparisons from test/shots.mjs output (not a test). For every PNG that is in both
// <dir>/before and <dir>/after it writes <dir>/pair-<name>.jpg (side by side, before left) and
// prints how much changed, overall and by tenths of the screen from top to bottom.
//
//   node test/compare.mjs previews/step-d
//   node test/compare.mjs previews/step-d crop=0,640,1008,820 only=next-1-roll-384x780
//
// crop (x,y,w,h in the screenshot's pixels) also writes <dir>/crop-<name>.jpg at full detail.
// Runs from the repo root; uses sharp from the client's dependencies.
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const require = createRequire(resolve('client/package.json'));
const sharp = require('sharp');
const dir = process.argv[2];
const args = Object.fromEntries(process.argv.slice(3).map(a => a.split('=')));
if (!dir || !existsSync(join(dir, 'before')) || !existsSync(join(dir, 'after'))) {
    console.error('usage: node test/compare.mjs <dir with before/ and after/> [crop=x,y,w,h] [only=name]');
    process.exit(1);
}
const names = readdirSync(join(dir, 'before'))
    .filter(f => f.endsWith('.png') && existsSync(join(dir, 'after', f)))
    .map(f => f.slice(0, -4))
    .filter(n => !args.only || n === args.only);

async function sideBySide(a, b, width, file) {
    const [left, right] = await Promise.all([a, b].map(img => sharp(img).resize(width).toBuffer()));
    const { height } = await sharp(left).metadata();
    const both = await sharp({ create: { width: width * 2 + 10, height, channels: 3, background: '#000' } })
        .composite([{ input: left, left: 0, top: 0 }, { input: right, left: width + 10, top: 0 }]).png().toBuffer();
    await sharp(both).jpeg({ quality: 88 }).toFile(file);
}

for (const name of names) {
    const before = join(dir, 'before', `${name}.png`), after = join(dir, 'after', `${name}.png`);
    const A = await sharp(before).raw().toBuffer({ resolveWithObject: true });
    const B = await sharp(after).raw().toBuffer();
    const { width, height, channels } = A.info;
    let total = 0, changed = 0;
    const rows = new Array(10).fill(0);
    for (let i = 0; i < width * height; i++) {
        let m = 0;
        for (let k = 0; k < 3; k++) m = Math.max(m, Math.abs(A.data[i * channels + k] - B[i * channels + k]));
        total += m;
        if (m > 24) { changed++; rows[Math.min(9, Math.floor(i / width / height * 10))]++; }
    }
    const pct = n => (100 * n / (width * height)).toFixed(1);
    console.log(`${name}: mean change ${(total / width / height).toFixed(2)}/255, ${pct(changed)}% of pixels changed visibly`);
    console.log(`  by tenth, top to bottom (%): ${rows.map(r => (1000 * r / (width * height)).toFixed(0)).join(' ')}`);
    // Portrait shots at 400 px a side, landscape at 640.
    await sideBySide(before, after, width > height ? 640 : 400, join(dir, `pair-${name}.jpg`));
    if (args.crop) {
        const [left, top, w, h] = args.crop.split(',').map(Number);
        const region = { left, top, width: w, height: h };
        const [a, b] = await Promise.all([before, after].map(f => sharp(f).extract(region).png().toBuffer()));
        await sideBySide(a, b, Math.min(w, 800), join(dir, `crop-${name}.jpg`));
    }
}
console.log(`${names.length} pair(s) in ${dir}`);
