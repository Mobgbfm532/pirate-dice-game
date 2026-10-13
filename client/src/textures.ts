import * as THREE from 'three';
import { FACE_VALUES } from './layout';

// Placeholder dice and table art drawn with canvas. Swapped for AI-generated art later.

const SIZE = 256;

function canvasTexture(draw: (ctx: CanvasRenderingContext2D) => void) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
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

        // The 2 and the 4 are the dice you must find, so their pips are red.
        const color = value === 2 || value === 4 ? '#b71c1c' : '#231a14';
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
    return { faces, hidden };
}

// The engraved slots on the front rail: "2" and "4" for the required dice, plain for scoring dice.
export function slotTexture(label: string) {
    return canvasTexture(ctx => {
        ctx.clearRect(0, 0, SIZE, SIZE);
        ctx.strokeStyle = label ? 'rgba(229, 115, 115, 0.9)' : 'rgba(255, 213, 79, 0.45)';
        ctx.lineWidth = 10;
        ctx.setLineDash(label ? [] : [22, 14]);
        ctx.strokeRect(14, 14, SIZE - 28, SIZE - 28);
        if (label) {
            ctx.fillStyle = 'rgba(229, 115, 115, 0.85)';
            ctx.font = `bold ${SIZE * 0.55}px Georgia, serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, SIZE / 2, SIZE / 2 + 8);
        }
    });
}

// A little noise so the felt and wood aren't flat colour.
export function noiseTexture(base: string, speck: string, repeat: number) {
    const texture = canvasTexture(ctx => {
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, SIZE, SIZE);
        for (let i = 0; i < 4000; i++) {
            ctx.fillStyle = speck;
            ctx.globalAlpha = Math.random() * 0.12;
            ctx.fillRect(Math.random() * SIZE, Math.random() * SIZE, 1 + Math.random() * 2, 1);
        }
        ctx.globalAlpha = 1;
    });
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat, repeat);
    return texture;
}
