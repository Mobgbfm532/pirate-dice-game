import * as THREE from 'three';
import { FACE_VALUES } from './layout';
import { lookNext } from './look';

// Placeholder dice and table art drawn with canvas. Swapped for AI-generated art later.

const SIZE = 256;

function canvasTexture(draw: (ctx: CanvasRenderingContext2D) => void, size = SIZE) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    draw(canvas.getContext('2d')!);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 16; // (the dice faces stay crisp seen at a slant; capped by the device)
    return texture;
}

const PIPS: Record<number, [number, number][]> = {
    1: [[0.5, 0.5]],
    2: [[0.27, 0.27], [0.73, 0.73]],
    3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
    4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
    5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
    6: [[0.27, 0.25], [0.73, 0.25], [0.27, 0.5], [0.73, 0.5], [0.27, 0.75], [0.73, 0.75]]
};

function faceTexture(value: number) {
    return canvasTexture(ctx => {
        const g = ctx.createRadialGradient(SIZE * 0.4, SIZE * 0.35, 10, SIZE / 2, SIZE / 2, SIZE * 0.75);
        g.addColorStop(0, '#fffdf4');
        g.addColorStop(1, '#eadfc4');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, SIZE, SIZE);

        // Same colours as the painted dice: a red 1, green 6s, ink black for the rest.
        const color = value === 1 ? '#a3201c' : value === 6 ? '#2e7d32' : '#231a14';
        const radius = value === 1 ? SIZE * 0.12 : SIZE * 0.085;
        PIPS[value].forEach(([x, y]) => {
            ctx.beginPath();
            ctx.arc(x * SIZE, y * SIZE, radius, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x * SIZE - radius * 0.25, y * SIZE - radius * 0.3, radius * 0.35, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.18)';
            ctx.fill();
        });
    });
}

function hiddenTexture() {
    return canvasTexture(ctx => {
        const g = ctx.createRadialGradient(SIZE / 2, SIZE / 2, 10, SIZE / 2, SIZE / 2, SIZE * 0.7);
        g.addColorStop(0, '#2b4a7a');
        g.addColorStop(1, '#0e1a33');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, SIZE, SIZE);
        for (let i = 0; i < 26; i++) {
            ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.6})`;
            ctx.fillRect(Math.random() * SIZE, Math.random() * SIZE, 2, 2);
        }
        ctx.fillStyle = '#ffd54f';
        ctx.font = `bold ${SIZE * 0.55}px Georgia, serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', SIZE / 2, SIZE / 2 + 6);
    });
}

const diceMaterialProps = { roughness: 0.32, metalness: 0.0 };

// The look preview (step C): lacquered ivory. A clear coat gleams over a slightly softer body;
// the pips are engraved (a height map found from the painted face, `engraving`); the edges and
// corners are worn, the lacquer rubbed thin and the ivory duller there (`wear`).
const DiceMaterial = lookNext ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
const lacquer = lookNext ? { roughness: 0.55, clearcoat: 0.8, clearcoatRoughness: 0.16, bumpScale: 2.2 } : {};
// (and a touch of warm ivory under the paint, so strong light doesn't wash the faces white)
const ivory = lookNext ? { color: new THREE.Color('#f8eedc') } : {};

// A face's engraving, from its painting: the ivory stands high, the pips (dark, or the red 1 and
// green 6) are cut in, with a soft bevel at their rims. Read by the material as a bump map.
const engravings = new WeakMap<THREE.Texture, THREE.Texture>();
function engraving(face: THREE.Texture) {
    const known = engravings.get(face);
    if (known) return known;
    const source = face.image as CanvasImageSource & { width: number };
    const size = source.width;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(source, 0, 0, size, size);
    const pixels = ctx.getImageData(0, 0, size, size);
    const d = pixels.data;
    for (let i = 0; i < d.length; i += 4) {
        const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const sat = Math.max(r, g, b) - Math.min(r, g, b);
        const pip = Math.min(1, Math.max(0, (0.72 - lum) / 0.25, (sat - 0.3) / 0.2));
        d[i] = d[i + 1] = d[i + 2] = Math.round(255 * (1 - pip));
        d[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    // The bevel: soften the cut a little (a hard step reads as a printed outline, not a cut).
    const soft = document.createElement('canvas');
    soft.width = soft.height = size;
    const sctx = soft.getContext('2d')!;
    sctx.filter = `blur(${size / 256}px)`;
    sctx.drawImage(canvas, 0, 0);
    const cut = new THREE.CanvasTexture(soft);
    engravings.set(face, cut);
    return cut;
}

// Clearer coloured pips (visuals plan step 2, 24 Oct): under the new look's light and tone curve
// the green 6s went a muddy olive and the red 1 dark. The painted pips, found by their colour, are
// repainted a cleaner, lighter red or green in the face itself, so they still shade with the die.
// (A glow of their own was tried first: on desktop the pips lit up even on a die's shaded sides.)
function clearPips(ctx: CanvasRenderingContext2D, size: number) {
    const pixels = ctx.getImageData(0, 0, size, size);
    const d = pixels.data;
    const RED = [214, 44, 36], GREEN = [58, 178, 72];
    for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const red = Math.min(1, Math.max(0, (r - Math.max(g, b) - 40) / 50));
        const green = Math.min(1, Math.max(0, (g - Math.max(r, b) - 15) / 35));
        const k = Math.max(red, green), to = red > green ? RED : GREEN;
        if (k <= 0) continue;
        for (let c = 0; c < 3; c++) d[i + c] = Math.round(d[i + c] * (1 - k) + to[c] * k);
    }
    ctx.putImageData(pixels, 0, 0);
}

// Wear on a face (shared by all six): red = how much lacquer is left, green = roughness. Full and
// glossy in the middle, rubbed and duller towards the edges, in blotches rather than a clean band.
function wearTexture() {
    const size = 256;
    const blotches = document.createElement('canvas');
    blotches.width = blotches.height = 16;
    const bctx = blotches.getContext('2d')!;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const v = Math.round(255 * Math.random());
        bctx.fillStyle = `rgb(${v},${v},${v})`;
        bctx.fillRect(x, y, 1, 1);
    }
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(blotches, 0, 0, size, size);
    const pixels = ctx.getImageData(0, 0, size, size);
    const d = pixels.data;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const edge = Math.min(x, y, size - 1 - x, size - 1 - y) / size; // 0 at the edge, 0.5 in the middle
        const toEdge = 1 - Math.min(1, Math.max(0, (edge - 0.02) / 0.12));
        const wear = Math.min(1, toEdge * (0.55 + d[i] / 255 * 0.9));
        d[i] = Math.round(255 * (1 - wear * 0.75));      // lacquer left
        d[i + 1] = Math.round(255 * (0.78 + wear * 0.22)); // roughness
        d[i + 2] = 0;
        d[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    return new THREE.CanvasTexture(canvas);
}
const wear = lookNext ? wearTexture() : null;

const finish = (m: THREE.MeshStandardMaterial) => {
    if (!lookNext || !m.map) return m;
    m.bumpMap = engraving(m.map);
    const coated = m as THREE.MeshPhysicalMaterial;
    coated.roughnessMap = wear;
    coated.clearcoatMap = wear;
    m.needsUpdate = true;
    return m;
};

export function createDiceMaterials() {
    const faces = FACE_VALUES.map(v => finish(new DiceMaterial({ map: faceTexture(v), ...diceMaterialProps, ...lacquer, ...ivory })));
    const hiddenMap = hiddenTexture();
    const hidden = FACE_VALUES.map(() => new THREE.MeshStandardMaterial({ map: hiddenMap, emissive: new THREE.Color('#1c3d6e'), emissiveIntensity: 0.6, ...diceMaterialProps }));
    // The Loaded Die keepsake's die: the same faces, warmed to old gold so it stands out.
    const loaded = FACE_VALUES.map((_, i) => finish(new DiceMaterial({ map: faces[i].map, color: new THREE.Color('#e9b864'), ...diceMaterialProps, ...lacquer, ...(lookNext ? { metalness: 0.35 } : {}) })));
    // Frak's Mind Whip: the die he made you keep glows his sickly green and violet.
    const mind = FACE_VALUES.map((_, i) => finish(new DiceMaterial({ map: faces[i].map, color: new THREE.Color('#8fd27a'), emissive: new THREE.Color('#6a1b9a'), emissiveIntensity: 0.7, ...diceMaterialProps, ...lacquer })));
    // The Wild Magic Hot Tub: the die its surge works on, aqua with a soft glow.
    const tub = FACE_VALUES.map((_, i) => finish(new DiceMaterial({ map: faces[i].map, color: new THREE.Color('#86e3ee'), emissive: new THREE.Color('#00838f'), emissiveIntensity: 0.4, ...diceMaterialProps, ...lacquer })));
    loadPaintedFaces(faces, [loaded, mind, tub]);
    return { faces, hidden, loaded, mind, tub };
}

// The painted dice sheet (docs/art-direction.md): six faces in a 3x2 grid, values 1-6
// row by row. Each rectangle is the outer edge of a face's inked outline.
const DICE_SHEET_URL = `${import.meta.env.BASE_URL}textures/dice-faces.jpg`;
const DICE_SHEET_FACES: Record<number, [number, number]> = {
    1: [38, 45], 2: [462, 44], 3: [886, 44],
    4: [38, 465], 5: [462, 465], 6: [886, 464]
};
const DICE_SHEET_FACE_SIZE = 339;

// Swaps the drawn placeholder faces for the painted ones once the sheet has loaded.
function loadPaintedFaces(materials: THREE.MeshStandardMaterial[], alike: THREE.MeshStandardMaterial[][]) {
    const image = new Image();
    image.onload = () => {
        FACE_VALUES.forEach((value, i) => {
            const [sx, sy] = DICE_SHEET_FACES[value];
            const texture = canvasTexture(ctx => {
                ctx.drawImage(image, sx, sy, DICE_SHEET_FACE_SIZE, DICE_SHEET_FACE_SIZE, 0, 0, 512, 512);
                if (lookNext && (value === 1 || value === 6)) clearPips(ctx, 512);
            }, 512);
            materials[i].map?.dispose();
            materials[i].map = texture;
            const cut = lookNext ? engraving(texture) : null;
            [materials, ...alike].forEach(set => {
                set[i].map = texture;
                if (cut) set[i].bumpMap = cut;
                set[i].needsUpdate = true;
            });
        });
    };
    image.src = DICE_SHEET_URL;
}

// A painted, tiling texture from client/public/textures.
export function paintedTexture(file: string, repeatX: number, repeatY = repeatX) {
    const texture = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}textures/${file}`);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.anisotropy = 8;
    return texture;
}

// A single painted image from client/public/art (no tiling).
export function artTexture(file: string) {
    const texture = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}art/${file}`);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
}
