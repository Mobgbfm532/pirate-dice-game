import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { DIE_SIZE } from './layout';
import { readFrame, simulateRoll, type RollTrack } from './physics';
import { createDiceMaterials } from './textures';

// The intro film's opening (5 Nov, the user: a better die than the first CSS cube): one real die, with
// the game's material and physics, thrown out of the dark into a pool of lantern light. Its own small
// canvas, there only for the first shot, while the table's isn't being drawn.

// A throw that hits no wall (there are none to see here) and lands on a 6.
export const prepareOpeningThrow = () => simulateRoll([0], [6], 13);

interface Props { track: RollTrack; clock: { at: number }; onDrawn: () => void }

const VIEW = new THREE.Vector3(0.1, 1, 0.72).normalize();
const pos = new THREE.Vector3();
const quat = new THREE.Quaternion();
const aim = new THREE.Vector3();

function Die({ track, clock, onDrawn }: Props) {
    const geometry = useMemo(() => new RoundedBoxGeometry(DIE_SIZE, DIE_SIZE, DIE_SIZE, 6, 0.13), []);
    const materials = useMemo(() => createDiceMaterials(), []);
    const mesh = useRef<THREE.Mesh>(null);
    const key = useRef<THREE.SpotLight>(null);
    const frames = useRef(0);
    const end = useMemo(() => {
        const p = new THREE.Vector3();
        readFrame(track, track.frames - 1, 0, p, quat);
        return p;
    }, [track]);

    useFrame(({ camera }) => {
        // (Told once it has been drawn: the frame after this one has reached the screen.)
        if (++frames.current === 3) onDrawn();
        const started = clock.at !== Infinity;
        const seconds = started ? (performance.now() - clock.at) / 1000 : -1;
        const frame = Math.max(0, Math.min(track.frames - 1, Math.floor(seconds * 60)));
        readFrame(track, frame, 0, pos, quat);
        if (mesh.current) {
            mesh.current.position.copy(pos);
            mesh.current.quaternion.copy(quat);
            mesh.current.visible = !started || seconds >= 0; // (drawn while unseen, so its materials are ready)
        }
        // The light waits where the die will land; the camera leans in slowly as the line appears.
        const lean = Math.min(1, Math.max(0, seconds / 6));
        const distance = 10.5 - lean * 1.3;
        // (Aimed a little nearer than the die, so it sits above the words.)
        aim.set(end.x, 0.3, end.z + 0.55);
        camera.position.copy(VIEW).multiplyScalar(distance).add(aim);
        camera.lookAt(aim);
        if (key.current) {
            key.current.position.set(end.x - 2.2, 6.5, end.z - 1.6);
            key.current.target.position.copy(end);
            key.current.target.updateMatrixWorld();
            // A flame's slow drift.
            key.current.intensity = 62 * (1 + 0.05 * Math.sin(seconds * 2.3) + 0.03 * Math.sin(seconds * 5.1));
        }
    });

    return (
        <>
            <mesh ref={mesh} geometry={geometry} material={materials.faces} castShadow visible={false} />
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[80, 80]} />
                <meshStandardMaterial color="#20140a" roughness={0.9} />
            </mesh>
            <spotLight ref={key} color="#ffdcb4" angle={0.27} penumbra={1} decay={1.6} distance={24} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-bias={-0.0004} shadow-radius={6} />
            <hemisphereLight args={['#ffe2bd', '#000000', 0.12]} />
            <pointLight color="#ffd9a8" position={[end.x, 2.6, end.z + 4.5]} intensity={9} decay={1.6} distance={12} />
            <pointLight color="#8fb4ff" position={[end.x + 3.5, 2.2, end.z + 2.5]} intensity={5} decay={1.6} distance={12} />
        </>
    );
}

export function FilmDie(props: Props) {
    // (Development: lets test/film-shots.mjs hold the die at a frame of its throw.)
    if (import.meta.env.DEV) (window as unknown as { __dieClock: unknown }).__dieClock = props.clock;
    return (
        <Canvas
            shadows="soft"
            dpr={[1, 2]}
            camera={{ fov: 24, near: 0.1, far: 60, position: [0, 7, 5] }}
            gl={{ antialias: true }}
            style={{ position: 'absolute', inset: 0 }}
            onCreated={({ gl }) => gl.setClearColor('#000000')}
        >
            <Die {...props} />
        </Canvas>
    );
}
