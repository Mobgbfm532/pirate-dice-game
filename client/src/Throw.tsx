import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { table } from './game';
import { paceFrame, type RollTrack } from './physics';

// The throw itself (visuals plan step 2, 24 Oct): the dice are tipped out of a leather dice cup
// at the end of the tray, which flicks and is pulled away as they fly out, and each hard landing
// on the felt kicks up a little puff of dust. Only in the new look (TableScene).

// ---- The cup ----

const CUP_RADIUS = 1.42, CUP_BASE = 1.2, CUP_LENGTH = 1.95;
const TILT = (115 * Math.PI) / 180; // its mouth pointed along the throw and a little down
const CUP_MS = 520;

// Dark tan leather: a mottled hide with two rows of stitching, round the base and below the rim.
function leatherTexture() {
    const w = 256, h = 128;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#5a3418';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
        const shade = Math.random() < 0.5 ? 'rgba(30,14,4,0.12)' : 'rgba(140,90,50,0.1)';
        g.fillStyle = shade;
        g.beginPath();
        g.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 5, 0, Math.PI * 2);
        g.fill();
    }
    // (u runs round the cup, v from the base up to the rim)
    for (const v of [0.12, 0.86]) {
        g.fillStyle = 'rgba(20,8,2,0.55)';
        g.fillRect(0, h * (1 - v) - 5, w, 10);
        g.strokeStyle = '#d9b57a';
        g.lineWidth = 2;
        g.setLineDash([6, 5]);
        g.beginPath();
        g.moveTo(0, h * (1 - v));
        g.lineTo(w, h * (1 - v));
        g.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.repeat.set(3, 1);
    return texture;
}

function Cup() {
    const group = useRef<THREE.Group>(null);
    const geometry = useMemo(() => new THREE.LatheGeometry([
        new THREE.Vector2(0, 0), new THREE.Vector2(CUP_BASE, 0), new THREE.Vector2(CUP_BASE + 0.03, 0.08),
        new THREE.Vector2(CUP_RADIUS - 0.04, CUP_LENGTH - 0.05), new THREE.Vector2(CUP_RADIUS, CUP_LENGTH)
    ], 40), []);
    const leather = useMemo(() => new THREE.MeshStandardMaterial({ map: leatherTexture(), roughness: 0.75, side: THREE.DoubleSide, transparent: true }), []);
    const brass = useMemo(() => new THREE.MeshStandardMaterial({ color: '#c9973a', metalness: 0.85, roughness: 0.32, transparent: true }), []);

    useFrame(() => {
        const g = group.current;
        if (!g) return;
        const roll = table.roll;
        const t = roll ? (performance.now() - roll.startedAt) / CUP_MS : 1;
        g.visible = !!roll && t < 1;
        if (!roll || t >= 1) return;
        const { cup } = roll.track;
        const d = cup.direction;
        // Just past the leading dice, so they start inside it.
        const flick = 1 - Math.pow(1 - Math.min(1, t / 0.25), 3);   // the mouth dips as it pours
        const away = Math.pow(Math.max(0, (t - 0.18) / 0.82), 2);    // then it's pulled back and up
        g.position.set(cup.x + d * (0.95 - away * 2.6), cup.y + away * 2.2, cup.z);
        g.rotation.set(0, 0, -d * (TILT + flick * 0.35 - away * 0.6));
        const fade = 1 - Math.max(0, (t - 0.6) / 0.4);
        leather.opacity = brass.opacity = fade;
        leather.depthWrite = brass.depthWrite = fade > 0.95;
    });

    return (
        <group ref={group} visible={false}>
            {/* (the group sits at the mouth; the cup reaches back from it) */}
            <mesh geometry={geometry} material={leather} position={[0, -CUP_LENGTH, 0]} castShadow />
            <mesh material={brass} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[CUP_RADIUS, 0.07, 10, 48]} />
            </mesh>
            <mesh material={brass} position={[0, -CUP_LENGTH + 0.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[CUP_BASE + 0.03, 0.08, 10, 48]} />
            </mesh>
        </group>
    );
}

// ---- Dust off the felt ----

const PUFFS = 14, PUFF_MS = 600;

function puffTexture() {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const g = canvas.getContext('2d')!;
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
}

function Dust() {
    const map = useMemo(puffTexture, []);
    const sprites = useRef<(THREE.Sprite | null)[]>([]);
    const puffs = useRef(Array.from({ length: PUFFS }, () => ({ at: -1e9, x: 0, z: 0, size: 1 })));
    const seen = useRef<{ track: RollTrack | null; next: number }>({ track: null, next: 0 });

    useFrame(() => {
        const now = performance.now();
        const roll = table.roll;
        if (roll) {
            const s = seen.current;
            if (s.track !== roll.track) { s.track = roll.track; s.next = 0; }
            const frame = paceFrame(roll.pace, (now - roll.startedAt) / 1000);
            const impacts = roll.track.impacts;
            while (s.next < impacts.length && impacts[s.next].frame <= frame) {
                const hit = impacts[s.next++];
                if (hit.kind !== 'felt' || hit.strength < 3 || hit.x === undefined || hit.z === undefined) continue;
                // The oldest puff makes way.
                const p = puffs.current.reduce((a, b) => (a.at < b.at ? a : b));
                Object.assign(p, { at: now, x: hit.x, z: hit.z, size: Math.min(0.9, 0.35 + hit.strength * 0.06) });
            }
        }
        puffs.current.forEach((p, i) => {
            const sprite = sprites.current[i];
            if (!sprite) return;
            const t = (now - p.at) / PUFF_MS;
            sprite.visible = t >= 0 && t < 1;
            if (!sprite.visible) return;
            const grow = 1 - Math.pow(1 - t, 2);
            sprite.position.set(p.x, 0.08 + grow * 0.2, p.z);
            sprite.scale.set(p.size * (0.6 + grow * 1.2), p.size * (0.35 + grow * 0.6), 1);
            (sprite.material as THREE.SpriteMaterial).opacity = 0.14 * (1 - t) * (1 - t);
        });
    });

    return (
        <group>
            {puffs.current.map((_, i) => (
                <sprite key={i} ref={el => { sprites.current[i] = el; }} visible={false} renderOrder={3}>
                    <spriteMaterial map={map} color="#e6dcc4" transparent depthWrite={false} />
                </sprite>
            ))}
        </group>
    );
}

export function Throw() {
    return (
        <>
            <Cup />
            <Dust />
        </>
    );
}
