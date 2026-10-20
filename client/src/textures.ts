import * as THREE from 'three';
import { FACE_VALUES } from './layout';

// Placeholder dice and table art drawn with canvas. Swapped for AI-generated art later.

const SIZE = 256;

function canvasTexture(draw: (ctx: CanvasRenderingContext2D) => void, size = SIZE) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    draw(canvas.getContext('2d')!);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
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

export function createDiceMaterials() {
    const faces = FACE_VALUES.map(v => new THREE.MeshStandardMaterial({ map: faceTexture(v), ...diceMaterialProps }));
    const hiddenMap = hiddenTexture();
    const hidden = FACE_VALUES.map(() => new THREE.MeshStandardMaterial({ map: hiddenMap, emissive: new THREE.Color('#1c3d6e'), emissiveIntensity: 0.6, ...diceMaterialProps }));
    // The Loaded Die keepsake's die: the same faces, warmed to old gold so it stands out.
    const loaded = FACE_VALUES.map((_, i) => new THREE.MeshStandardMaterial({ map: faces[i].map, color: new THREE.Color('#e9b864'), ...diceMaterialProps }));
    // Frak's Mind Whip: the die he made you keep glows his sickly green and violet.
    const mind = FACE_VALUES.map((_, i) => new THREE.MeshStandardMaterial({ map: faces[i].map, color: new THREE.Color('#8fd27a'), emissive: new THREE.Color('#6a1b9a'), emissiveIntensity: 0.7, ...diceMaterialProps }));
    // The Wild Magic Hot Tub: the die its surge works on, aqua with a soft glow.
    const tub = FACE_VALUES.map((_, i) => new THREE.MeshStandardMaterial({ map: faces[i].map, color: new THREE.Color('#86e3ee'), emissive: new THREE.Color('#00838f'), emissiveIntensity: 0.4, ...diceMaterialProps }));
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
            }, 512);
            materials[i].map?.dispose();
            materials[i].map = texture;
            materials[i].needsUpdate = true;
            alike.forEach(set => { set[i].map = texture; set[i].needsUpdate = true; });
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
