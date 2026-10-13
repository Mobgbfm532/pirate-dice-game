import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Dice } from './Dice';
import { table } from './game';
import { REQUIRED_SLOT_X, SLOT_ROW_Z, TRAY, slotPosition } from './layout';
import { noiseTexture, slotTexture } from './textures';

const LOOK_AT = new THREE.Vector3(0, 0, 0.7);

// Keeps the whole tray and slot rail in view on any screen shape. Portrait phones get
// a more top-down view so the table fills more of the tall screen.
function CameraRig() {
    const { camera, size, scene } = useThree();
    const drift = useRef(0);

    useFrame((_, delta) => {
        const cam = camera as THREE.PerspectiveCamera;
        const aspect = size.width / size.height;
        const portrait = aspect < 0.9;
        const direction = new THREE.Vector3(0, 1, portrait ? 0.22 : 0.5).normalize();

        // On narrow screens the outer rails may crop slightly so the dice stay big enough to tap.
        const vHalf = THREE.MathUtils.degToRad(cam.fov / 2);
        const hHalf = Math.atan(Math.tan(vHalf) * aspect);
        const fitWidth = (portrait ? 4.05 : 4.6) / Math.tan(hHalf);
        const fitDepth = (portrait ? 5.2 : 4.6) / Math.tan(vHalf);
        let distance = Math.max(fitWidth, fitDepth);

        // Lean in slowly while dice are in the air during a suspense roll.
        const suspense = table.roll && table.roll.speed < 1 ? 1 : 0;
        drift.current += (suspense - drift.current) * Math.min(1, delta * 2);
        distance *= 1 - drift.current * 0.12;

        cam.position.copy(direction.multiplyScalar(distance).add(LOOK_AT));
        cam.lookAt(LOOK_AT);

        // Fog only darkens the room beyond the table, whatever the camera distance.
        if (scene.fog instanceof THREE.Fog) {
            scene.fog.near = distance * 1.15;
            scene.fog.far = distance * 2.6;
        }
    });
    return null;
}

function Tray() {
    const felt = useMemo(() => noiseTexture('#1f5a34', '#0b2614', 6), []);
    const wood = useMemo(() => noiseTexture('#5a3519', '#1d0e05', 3), []);
    const darkWood = useMemo(() => noiseTexture('#3a210f', '#120802', 4), []);
    const width = TRAY.maxX - TRAY.minX;
    const depth = TRAY.maxZ - TRAY.minZ;
    const cx = (TRAY.minX + TRAY.maxX) / 2;
    const cz = (TRAY.minZ + TRAY.maxZ) / 2;
    const rail = 0.35;
    const h = 0.55;

    const railBoxes: [number, number, number, number][] = [
        [cx, TRAY.minZ - rail / 2, width + rail * 2, rail],
        [cx, TRAY.maxZ + rail / 2, width + rail * 2, rail],
        [TRAY.minX - rail / 2, cz, rail, depth],
        [TRAY.maxX + rail / 2, cz, rail, depth]
    ];

    return (
        <group>
            {/* Tabletop */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
                <planeGeometry args={[40, 40]} />
                <meshStandardMaterial map={darkWood} roughness={0.85} />
            </mesh>
            {/* Felt */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.001, cz]} receiveShadow>
                <planeGeometry args={[width, depth]} />
                <meshStandardMaterial map={felt} roughness={1} />
            </mesh>
            {/* Rails */}
            {railBoxes.map(([x, z, w, d], i) => (
                <mesh key={i} position={[x, h / 2, z]} castShadow receiveShadow>
                    <boxGeometry args={[w, h, d]} />
                    <meshStandardMaterial map={wood} roughness={0.6} />
                </mesh>
            ))}
            {/* Slot rail in front of the tray */}
            <mesh position={[0.05, 0.004, SLOT_ROW_Z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[width + 0.9, 1.25]} />
                <meshStandardMaterial map={wood} roughness={0.7} />
            </mesh>
            <Slots />
        </group>
    );
}

function Slots() {
    const two = useMemo(() => slotTexture('2'), []);
    const four = useMemo(() => slotTexture('4'), []);
    const plain = useMemo(() => slotTexture(''), []);
    const scoring = [2, 3, 4, 5].map(slot => slotPosition(slot, 4));

    return (
        <group>
            {REQUIRED_SLOT_X.map((x, i) => (
                <mesh key={i} position={[x, 0.008, SLOT_ROW_Z]} rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[0.98, 0.98]} />
                    <meshBasicMaterial map={i === 0 ? two : four} transparent />
                </mesh>
            ))}
            {scoring.map((p, i) => (
                <mesh key={i} position={[p.x, 0.008, SLOT_ROW_Z]} rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[0.95, 0.95]} />
                    <meshBasicMaterial map={plain} transparent />
                </mesh>
            ))}
        </group>
    );
}

// Candle light that flickers, plus a red flash for the devil and gold for a perfect 24.
function Lights() {
    const candle = useRef<THREE.PointLight>(null);
    const flash = useRef<THREE.PointLight>(null);

    useFrame(() => {
        const t = performance.now() / 1000;
        if (candle.current) candle.current.intensity = 26 + Math.sin(t * 7.3) * 2.5 + Math.sin(t * 13.1) * 1.5;

        if (flash.current) {
            const devil = Math.max(0, 1 - (performance.now() - table.devilAt) / 1200);
            const gold = Math.max(0, 1 - (performance.now() - table.celebrateAt) / 2000);
            if (devil > gold) flash.current.color.set('#ff1a1a');
            else flash.current.color.set('#ffd54f');
            flash.current.intensity = Math.max(devil, gold) * 60;
        }
    });

    return (
        <>
            <hemisphereLight args={['#ffe0b2', '#2a160a', 0.55]} />
            <directionalLight
                position={[-4, 9, 5]}
                intensity={1.6}
                color="#ffe6c4"
                castShadow
                shadow-mapSize={[1024, 1024]}
                shadow-camera-left={-6}
                shadow-camera-right={6}
                shadow-camera-top={6}
                shadow-camera-bottom={-6}
                shadow-bias={-0.0005}
            />
            <pointLight ref={candle} position={[3.5, 3, -3.5]} color="#ff9e40" distance={14} decay={1.6} />
            <pointLight ref={flash} position={[0, 3, 0]} distance={12} decay={1.4} intensity={0} />
        </>
    );
}

export function TableScene() {
    return (
        <>
            <color attach="background" args={['#120a05']} />
            <fog attach="fog" args={['#120a05', 14, 30]} />
            <CameraRig />
            <Lights />
            <Tray />
            <Dice />
        </>
    );
}
