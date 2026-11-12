import { useMemo, useRef, type MutableRefObject, type RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { DIE_SIZE } from './layout';
import { readFrame, simulateRoll, type RollTrack } from './physics';
import { createDiceMaterials } from './textures';
import { playDiceImpacts } from './sounds';

// The start screen's die (12 Nov, the user's pick from docs/landing-page-brainstorm.md): one of the
// game's real dice thrown across the tavern as the page opens, landing on a 6 over the title; a tap
// on it throws it again. Drawn on a see-through canvas over the whole screen (behind the panel), so
// the throw is never clipped; the camera follows where each throw ends and puts the die on the
// slot element the start screen leaves for it (`slot`).

const still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const VIEW = new THREE.Vector3(0.1, 1, 0.72).normalize();
const FOV = 24;
const pos = new THREE.Vector3();
const quat = new THREE.Quaternion();

// A throw that hits no wall (the tray's walls aren't here to see).
function throwFor(face: number, first: boolean): RollTrack {
    if (first) return simulateRoll([0], [face], 13);
    let best = simulateRoll([0], [face]);
    for (let i = 0; i < 12 && best.impacts.some(h => h.kind === 'wall'); i++) best = simulateRoll([0], [face]);
    return best;
}

function endOf(track: RollTrack) {
    const p = new THREE.Vector3();
    readFrame(track, track.frames - 1, 0, p, quat);
    return p;
}

interface Throw { track: RollTrack; at: number; end: THREE.Vector3 }

function Die({ slot, current }: { slot: RefObject<HTMLElement | null>; current: RefObject<Throw | null> }) {
    const geometry = useMemo(() => new RoundedBoxGeometry(DIE_SIZE, DIE_SIZE, DIE_SIZE, 6, 0.13), []);
    const materials = useMemo(() => createDiceMaterials(), []);
    const mesh = useRef<THREE.Mesh>(null);
    const key = useRef<THREE.SpotLight>(null);
    const aim = useRef<THREE.Vector3 | null>(null);
    const { size } = useThree();

    useFrame(({ camera }, delta) => {
        const t = current.current;
        if (!t) return;
        const seconds = (performance.now() - t.at) / 1000;
        readFrame(t.track, still ? t.track.frames - 1 : Math.floor(Math.max(0, seconds) * 60), 0, pos, quat);
        if (mesh.current) {
            mesh.current.position.copy(pos);
            mesh.current.quaternion.copy(quat);
        }
        // The camera drifts over to where this throw will land.
        if (!aim.current) aim.current = t.end.clone();
        else aim.current.lerp(t.end, Math.min(1, delta * 2.5));
        const box = slot.current?.getBoundingClientRect();
        const cam = camera as THREE.PerspectiveCamera;
        if (box && box.height > 0 && size.height > 0) {
            // As far away as makes the die about the slot's height, and shifted so it sits on the slot.
            const px = box.height * 0.82;
            const distance = (DIE_SIZE * size.height) / (px * 2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
            cam.position.copy(VIEW).multiplyScalar(distance).add(aim.current);
            cam.lookAt(aim.current);
            const dx = size.width / 2 - (box.left + box.width / 2);
            const dy = size.height / 2 - (box.top + box.height / 2);
            cam.setViewOffset(size.width, size.height, dx, dy, size.width, size.height);
        }
        if (key.current) {
            key.current.position.set(aim.current.x - 2.2, 6.5, aim.current.z - 1.6);
            key.current.target.position.copy(aim.current);
            key.current.target.updateMatrixWorld();
            const s = performance.now() / 1000;
            key.current.intensity = 62 * (1 + 0.05 * Math.sin(s * 2.3) + 0.03 * Math.sin(s * 5.1));
        }
    });

    return (
        <>
            <mesh ref={mesh} geometry={geometry} material={materials.faces} castShadow />
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[200, 200]} />
                <shadowMaterial opacity={0.55} />
            </mesh>
            <spotLight ref={key} color="#ffdcb4" angle={0.3} penumbra={1} decay={1.6} distance={24} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-bias={-0.0004} shadow-radius={6} />
            <hemisphereLight args={['#ffe2bd', '#2a1808', 0.5]} />
            <pointLight color="#ffd9a8" position={[0, 2.6, 4.5]} intensity={9} decay={1.6} distance={14} />
        </>
    );
}

export function LobbyDie({ slot, rethrow }: { slot: RefObject<HTMLElement | null>; rethrow: MutableRefObject<() => void> }) {
    const current = useRef<Throw | null>(null);
    if (!current.current) {
        const track = throwFor(6, true);
        current.current = { track, at: performance.now() + 500, end: endOf(track) };
    }
    // A tap: thrown again, onto any face, with its knocks (not while it's still tumbling).
    rethrow.current = () => {
        const t = current.current;
        if (t && performance.now() - t.at < (t.track.frames / 60) * 600) return;
        const track = throwFor(1 + Math.floor(Math.random() * 6), false);
        current.current = { track, at: performance.now(), end: endOf(track) };
        playDiceImpacts(track.impacts);
    };
    return (
        <Canvas
            className="lobby-die"
            shadows="soft"
            dpr={[1, 2]}
            camera={{ fov: FOV, near: 0.1, far: 80, position: [0, 7, 5] }}
            gl={{ antialias: true, alpha: true }}
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
            onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
        >
            <Die slot={slot} current={current} />
        </Canvas>
    );
}
