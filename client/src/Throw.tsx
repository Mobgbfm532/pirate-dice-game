import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { table } from './game';
import { paceFrame, type RollTrack } from './physics';

// The throw itself (visuals plan step 2, 24 Oct): each hard landing on the felt kicks up a faint
// puff of dust. Only in the new look (TableScene). (A leather cup the dice were tipped from was
// tried and taken out, the user's call.)

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
<Dust />
    );
}
