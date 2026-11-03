import { useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { SLOT_ROW_Z, TRAY } from './layout';
import { desktop } from './tuning';

// A richer table (2 Nov, the user's call, new look only): the tray's rails get rounded, varnished
// edges and a carved cap along their tops, the felt darkens
// softly where it meets the wood, the tray and the slot rail sit on the tabletop with a soft
// shadow, the slot rail has a brass edge, and a few gold coins lie on the table beside it.
// The rails' inner faces stay exactly where the dice bounce off them (physics.ts); everything
// grows outward or upward, and nothing reaches over the felt or the slots.
// On 3 Nov the brass on the tray (an inlay along the caps, corner brackets with rivets) was taken
// out, the user's call: the tray is a plain wooden box again.

const RAIL = 0.42;      // thickness (was 0.35; the extra goes outward)
const RAIL_H = 0.58;    // height to the top of the rail body
const CAP_H = 0.09;     // the carved cap on top
const CAP_OUT = 0.07;   // how far the cap reaches past the rail's outer face

const width = TRAY.maxX - TRAY.minX;
const depth = TRAY.maxZ - TRAY.minZ;
const cx = (TRAY.minX + TRAY.maxX) / 2;
const cz = (TRAY.minZ + TRAY.maxZ) / 2;

// Each rail: [x, z, size along x, size along z]; the long ones run past the corners.
const rails: [number, number, number, number][] = [
    [cx, TRAY.minZ - RAIL / 2, width + RAIL * 2, RAIL],
    [cx, TRAY.maxZ + RAIL / 2, width + RAIL * 2, RAIL],
    [TRAY.minX - RAIL / 2, cz, RAIL, depth],
    [TRAY.maxX + RAIL / 2, cz, RAIL, depth]
];
// The caps sit on the rails, reaching a little further out (never in over the felt).
const caps: [number, number, number, number][] = [
    [cx, TRAY.minZ - (RAIL + CAP_OUT) / 2, width + (RAIL + CAP_OUT) * 2, RAIL + CAP_OUT],
    [cx, TRAY.maxZ + (RAIL + CAP_OUT) / 2, width + (RAIL + CAP_OUT) * 2, RAIL + CAP_OUT],
    [TRAY.minX - (RAIL + CAP_OUT) / 2, cz, RAIL + CAP_OUT, depth],
    [TRAY.maxX + (RAIL + CAP_OUT) / 2, cz, RAIL + CAP_OUT, depth]
];

// A soft shadow drawn in a canvas: `inner` darkens a rectangle's edges inward (the felt by the
// rails); otherwise a blurred dark rectangle with `pad` of fall-off each side (a shadow on the table).
function shadowTexture(w: number, h: number, edge: number, strength: number, inner: boolean) {
    const px = 96; // pixels per unit
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(w * px);
    canvas.height = Math.ceil(h * px);
    const ctx = canvas.getContext('2d')!;
    const e = edge * px;
    if (inner) {
        // Four edge gradients, from dark at the wood to nothing a little way in.
        const sides: [number, number, number, number, number, number, number, number][] = [
            [0, 0, 0, e, 0, 0, canvas.width, e],
            [0, canvas.height, 0, canvas.height - e, 0, canvas.height - e, canvas.width, e],
            [0, 0, e, 0, 0, 0, e, canvas.height],
            [canvas.width, 0, canvas.width - e, 0, canvas.width - e, 0, e, canvas.height]
        ];
        for (const [x0, y0, x1, y1, rx, ry, rw, rh] of sides) {
            const g = ctx.createLinearGradient(x0, y0, x1, y1);
            g.addColorStop(0, `rgba(6,10,4,${strength})`);
            g.addColorStop(0.45, `rgba(6,10,4,${strength * 0.35})`);
            g.addColorStop(1, 'rgba(6,10,4,0)');
            ctx.fillStyle = g;
            ctx.fillRect(rx, ry, rw, rh);
        }
    } else {
        ctx.filter = `blur(${e / 2.2}px)`;
        ctx.fillStyle = `rgba(10,5,2,${strength})`;
        ctx.fillRect(e, e, canvas.width - e * 2, canvas.height - e * 2);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

// A coin's face: struck gold with a raised rim, a ring of dots and "24" in the middle.
function coinFace() {
    const n = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = n;
    const ctx = canvas.getContext('2d')!;
    const g = ctx.createRadialGradient(n * 0.4, n * 0.36, n * 0.05, n / 2, n / 2, n / 2);
    g.addColorStop(0, '#fff1b8');
    g.addColorStop(0.45, '#f0c35a');
    g.addColorStop(0.85, '#b9822a');
    g.addColorStop(1, '#7d5216');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, n, n);
    ctx.strokeStyle = 'rgba(90,55,10,0.75)';
    ctx.lineWidth = n * 0.035;
    ctx.beginPath(); ctx.arc(n / 2, n / 2, n * 0.44, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(110,70,15,0.6)';
    for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        ctx.beginPath(); ctx.arc(n / 2 + Math.cos(a) * n * 0.36, n / 2 + Math.sin(a) * n * 0.36, n * 0.012, 0, Math.PI * 2); ctx.fill();
    }
    ctx.font = `bold ${n * 0.3}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,240,190,0.55)';
    ctx.fillText('24', n / 2 - 2, n / 2 - 2);
    ctx.fillStyle = 'rgba(100,62,12,0.8)';
    ctx.fillText('24', n / 2 + 2, n / 2 + 3);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
}

function Shadow({ x, z, y, w, h, edge, strength, inner = false, order = 1 }: { x: number; z: number; y: number; w: number; h: number; edge: number; strength: number; inner?: boolean; order?: number }) {
    const map = useMemo(() => shadowTexture(w, h, edge, strength, inner), [w, h, edge, strength, inner]);
    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, y, z]} renderOrder={order} raycast={() => null}>
            <planeGeometry args={[w, h]} />
            <meshBasicMaterial map={map} transparent depthWrite={false} toneMapped={false} />
        </mesh>
    );
}

export function TableDressing({ railMap }: { railMap: THREE.Texture }) {
    const geo = useMemo(() => ({
        rails: rails.map(([, , w, d]) => new RoundedBoxGeometry(w, RAIL_H, d, 3, 0.07)),
        caps: caps.map(([, , w, d]) => new RoundedBoxGeometry(w, CAP_H, d, 3, 0.04)),
        coin: new THREE.CylinderGeometry(0.27, 0.27, 0.05, 32)
    }), []);
    const mat = useMemo(() => {
        const wood = new THREE.MeshPhysicalMaterial({ map: railMap, roughness: 0.42, clearcoat: 0.75, clearcoatRoughness: 0.22 });
        // The cap a shade darker, as if oiled by years of hands.
        const cap = new THREE.MeshPhysicalMaterial({ map: railMap, color: new THREE.Color('#b98a63'), roughness: 0.35, clearcoat: 0.9, clearcoatRoughness: 0.18 });
        // (The room's reflection is faint, so the metals carry a little glow of their own colour or
        // they read as dark discs from above.)
        const brass = new THREE.MeshPhysicalMaterial({ color: '#d9b05a', metalness: 0.85, roughness: 0.28, clearcoat: 0.3, emissive: new THREE.Color('#5a3c10'), emissiveIntensity: 0.55 });
        const face = coinFace();
        const coinFaceMat = new THREE.MeshPhysicalMaterial({ map: face, metalness: 0.55, roughness: 0.3, emissiveMap: face, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.22 });
        const coinEdge = new THREE.MeshPhysicalMaterial({ color: '#c4923a', metalness: 0.8, roughness: 0.35, emissive: new THREE.Color('#4a3008'), emissiveIntensity: 0.6 });
        // A cylinder's groups: its side, then its top and bottom.
        const gold = [coinEdge, coinFaceMat, coinFaceMat];
        return { wood, cap, brass, gold };
    }, [railMap]);

    // A few coins by the slot rail's right end (on the tabletop, clear of the slots).
    const coinX = TRAY.maxX + 1.25, coinZ = SLOT_ROW_Z - 0.15;
    const stack = [0, 1, 2, 3].map(i => [coinX + Math.sin(i * 2.1) * 0.03, 0.015 + i * 0.05, coinZ + Math.cos(i * 1.7) * 0.03, i * 0.7] as const);

    return (
        <group>
            {/* Soft shadows: the tray and the slot rail on the tabletop, the felt by the rails. */}
            <Shadow x={cx} z={cz} y={-0.006} w={width + (RAIL + CAP_OUT) * 2 + 1.4} h={depth + (RAIL + CAP_OUT) * 2 + 1.4} edge={0.7} strength={0.55} />
            <Shadow x={0} z={SLOT_ROW_Z} y={-0.006} w={width + 0.9 + 0.8} h={1.25 + 0.7} edge={0.35} strength={0.35} />
            <Shadow x={cx} z={cz} y={0.0025} w={width} h={depth} edge={0.55} strength={0.5} inner order={2} />

            {/* The rails, rounded and varnished, and their carved caps. */}
            {rails.map(([x, z], i) => (
                <mesh key={`r${i}`} geometry={geo.rails[i]} material={mat.wood} position={[x, RAIL_H / 2, z]} castShadow receiveShadow />
            ))}
            {caps.map(([x, z], i) => (
                <mesh key={`c${i}`} geometry={geo.caps[i]} material={mat.cap} position={[x, RAIL_H + CAP_H / 2, z]} castShadow receiveShadow />
            ))}

            {/* The slot rail's brass front edge. */}
            <mesh material={mat.brass} position={[0, 0.03, SLOT_ROW_Z + 0.65]} castShadow receiveShadow>
                <boxGeometry args={[width + 0.9, 0.07, 0.07]} />
            </mesh>

            {/* Gold coins on the table (not on a computer, the user's call, 3 Nov; a phone's view doesn't reach them). */}
            {!desktop && stack.map(([x, y, z, r], i) => (
                <mesh key={`g${i}`} geometry={geo.coin} material={mat.gold} position={[x, y, z]} rotation={[0, r, 0]} castShadow receiveShadow />
            ))}
            {!desktop && <mesh geometry={geo.coin} material={mat.gold} position={[coinX + 0.55, 0.012, coinZ + 0.42]} rotation={[0.04, 0.3, 0.02]} castShadow receiveShadow />}
        </group>
    );
}
