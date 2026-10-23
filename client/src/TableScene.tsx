import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Bloom, EffectComposer, HueSaturation, BrightnessContrast, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { flame, lookNext, shareFlame } from './look';
import { Dice } from './Dice';
import { table } from './game';
import { REQUIRED_SLOT_X, SLOT_ROW_Z, TABLE_FAR_EDGE_Z, TRAY, screenInsets, slotPosition } from './layout';
import { artTexture, paintedTexture } from './textures';
import { layoutBackdrop, setRailAnchor } from './Backdrop';

const NEAR_EDGE_Z = SLOT_ROW_Z + 0.75; // front of the slot rail
const farPoint = new THREE.Vector3(0, 0, TABLE_FAR_EDGE_Z);
const nearPoint = new THREE.Vector3(0, 0, NEAR_EDGE_Z);
const projected = new THREE.Vector3();
const railEnd = new THREE.Vector3(TRAY.maxX + 0.45, 0, SLOT_ROW_Z);
const leanAim = new THREE.Vector3();

// Frames the table on any screen shape. It solves for the camera distance and aim so the
// table's far edge sits a set way down the screen (the tavern backdrop fills the space
// above it) and the slot rail stays clear of the controls at the bottom. Portrait phones
// get a more top-down view so the dice stay big.
function CameraRig() {
    const { camera, size, scene } = useThree();
    const drift = useRef(0);
    const lookAt = useRef(new THREE.Vector3(0, 0, 0.7));

    useFrame((_, delta) => {
        const cam = camera as THREE.PerspectiveCamera;
        const portrait = size.width / size.height < 0.9;
        // Desktops and tablets on their side keep the table centred with a dock of controls
        // under it (as phones do; matches the CSS `min-height: 501px`).
        const docked = !portrait && size.height > 500;
        // Phones on their side keep a column on the right free for the Roll button, so it can
        // sit right beside the table. The camera renders as if the screen were that much wider
        // and shows its right-hand part, which shifts the table left without distorting it.
        const reserve = portrait || docked ? 0 : Math.min(250, size.width * 0.24);
        cam.aspect = (size.width + reserve) / size.height;
        if (reserve > 0) cam.setViewOffset(size.width + reserve, size.height, reserve, 0, size.width, size.height);
        else cam.clearViewOffset();
        cam.updateProjectionMatrix();
        const aspect = (size.width - reserve) / size.height; // the part the table must fit in
        const direction = new THREE.Vector3(0, 1, portrait ? 0.22 : 0.5).normalize();
        // On phones and docked screens the controls sit under the table, so the table must end
        // above them (their real height, measured by the HUD); phones on their side have them
        // in the corners. (Ignore implausible measurements, e.g. before the page has laid out.)
        const measured = (screenInsets.bottom + 10) / size.height;
        const controls = (portrait || docked) && measured > 0.05 && measured < 0.6 ? measured : 0.24;
        const bottom = portrait ? Math.min(0.8, 1 - controls) : docked ? Math.min(0.9, 1 - controls) : 0.94;
        // Keep a sensible amount of table if the controls are very tall: give up tavern first.
        const top = portrait ? Math.min(0.32, Math.max(0.12, bottom - 0.42)) : 0.33;

        // On narrow screens the outer rails may crop slightly so the dice stay big enough to tap.
        const vHalf = THREE.MathUtils.degToRad(cam.fov / 2);
        const hHalf = Math.atan(Math.tan(vHalf) * aspect);
        const minDistance = (portrait ? 4.05 : 4.6) / Math.tan(hHalf);

        const place = (distance: number) => {
            cam.position.copy(direction).multiplyScalar(distance).add(lookAt.current);
            cam.lookAt(lookAt.current);
            cam.updateMatrixWorld();
        };
        const screenY = (p: THREE.Vector3) => (1 - projected.copy(p).project(cam).y) / 2;

        // The solve carries over between frames, so a bad value would stick: start again if
        // anything has gone non-finite, and keep both values within sane limits.
        if (!Number.isFinite(lookAt.current.z) || !Number.isFinite(cam.position.lengthSq())) {
            lookAt.current.set(0, 0, 0.7);
            cam.position.set(0, 10, 8);
        }
        let distance = THREE.MathUtils.clamp(cam.position.distanceTo(lookAt.current) || minDistance, minDistance, minDistance * 4);
        // Moves the aim along the table so the given point lands at screen height `target`.
        const shiftAim = (aim: THREE.Vector3, point: THREE.Vector3, target: number, span: number) => {
            aim.z = THREE.MathUtils.clamp(
                aim.z + (screenY(point) - target) * ((NEAR_EDGE_Z - TABLE_FAR_EDGE_Z) / span),
                TABLE_FAR_EDGE_Z, NEAR_EDGE_Z + 3
            );
        };
        for (let i = 0; i < 6; i++) {
            place(distance);
            const far = screenY(farPoint), near = screenY(nearPoint);
            const span = near - far;
            if (!(span > 0.01)) break;
            const wanted = distance * (span / (bottom - top));
            distance = THREE.MathUtils.clamp(wanted, minDistance, minDistance * 4);
            if (wanted >= minDistance) {
                // It fits: centre the table in its space.
                lookAt.current.z = THREE.MathUtils.clamp(
                    lookAt.current.z + ((far + near) / 2 - (top + bottom) / 2) * ((NEAR_EDGE_Z - TABLE_FAR_EDGE_Z) / span),
                    TABLE_FAR_EDGE_Z, NEAR_EDGE_Z + 3
                );
            } else {
                // Narrow phones: the table can't shrink any further (the dice must stay big
                // enough to tap), so it's taller than its space. Never let the slot rail slide
                // under the controls: pin it just above them and let the tavern give way.
                shiftAim(lookAt.current, nearPoint, bottom, span);
            }
        }

        // Lean in slowly while dice are in the air during a suspense roll, keeping the slot
        // rail where it is (zooming about the middle would push it under the controls).
        const suspense = table.roll && table.roll.speed < 1 ? 1 : 0;
        drift.current += (suspense - drift.current) * Math.min(1, delta * 2);
        if (drift.current > 0.001) {
            const nearY = screenY(nearPoint), span = nearY - screenY(farPoint);
            const aim = leanAim.copy(lookAt.current);
            const leaned = distance * (1 - drift.current * 0.12);
            for (let i = 0; i < 3 && span > 0.01; i++) {
                cam.position.copy(direction).multiplyScalar(leaned).add(aim);
                cam.lookAt(aim);
                cam.updateMatrixWorld();
                shiftAim(aim, nearPoint, nearY, span);
            }
            cam.position.copy(direction).multiplyScalar(leaned).add(aim);
            cam.lookAt(aim);
            cam.updateMatrixWorld();
        } else {
            place(distance);
        }

        layoutBackdrop(screenY(farPoint) * size.height, size.width, drift.current > 0.001);
        projected.copy(railEnd).project(cam);
        const railX = (projected.x + 1) / 2 * size.width, railY = (1 - projected.y) / 2 * size.height;
        projected.copy(farPoint).project(cam);
        setRailAnchor(railX, railY, (projected.x + 1) / 2 * size.width);

        // Fog only darkens the far end of the table, whatever the camera distance.
        if (scene.fog instanceof THREE.Fog) {
            scene.fog.near = distance * 1.15;
            scene.fog.far = distance * 2.6;
        }
    });
    return null;
}

function Tray() {
    // Painted textures (docs/art-direction.md). Each tiles at roughly real-world scale:
    // the felt image covers ~3 units, and the plank image (four rows of planks) ~3.8
    // units deep, so a plank is about one die wide.
    const felt = useMemo(() => paintedTexture('felt.webp', 2.4, 1.4), []);
    const tabletop = useMemo(() => paintedTexture('table-planks.webp', 40 / (3.8 * 1402 / 768), (24 - TABLE_FAR_EDGE_Z) / 3.8), []);
    const rails = useMemo(() => paintedTexture('rail-walnut.webp', 2, 0.35), []);
    const slotRail = useMemo(() => paintedTexture('rail-walnut.webp', 1.6, 0.3), []);
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
            {/* Tabletop, ending just beyond the tray so the tavern shows behind it */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, (TABLE_FAR_EDGE_Z + 24) / 2]} receiveShadow>
                <planeGeometry args={[40, 24 - TABLE_FAR_EDGE_Z]} />
                {lookNext
                    ? <meshPhysicalMaterial map={tabletop} roughness={0.7} clearcoat={0.35} clearcoatRoughness={0.45} />
                    : <meshStandardMaterial map={tabletop} roughness={0.85} />}
            </mesh>
            {/* Worn, lighter lip along the far edge */}
            <mesh position={[0, 0.02, TABLE_FAR_EDGE_Z + 0.06]}>
                <boxGeometry args={[40, 0.06, 0.12]} />
                <meshStandardMaterial map={tabletop} color="#d9b48a" roughness={0.6} />
            </mesh>
            {/* Felt */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.001, cz]} receiveShadow>
                <planeGeometry args={[width, depth]} />
                {/* The look preview: a velvety sheen that shows at low angles. */}
                {lookNext
                    ? <meshPhysicalMaterial map={felt} roughness={0.95} sheen={1} sheenRoughness={0.55} sheenColor="#7fb88c" />
                    : <meshStandardMaterial map={felt} roughness={1} />}
            </mesh>
            {/* Rails */}
            {railBoxes.map(([x, z, w, d], i) => (
                <mesh key={i} position={[x, h / 2, z]} castShadow receiveShadow>
                    <boxGeometry args={[w, h, d]} />
                    {lookNext
                        ? <meshPhysicalMaterial map={rails} roughness={0.5} clearcoat={0.6} clearcoatRoughness={0.3} />
                        : <meshStandardMaterial map={rails} roughness={0.5} />}
                </mesh>
            ))}
            {/* Slot rail in front of the tray */}
            <mesh position={[0.05, 0.004, SLOT_ROW_Z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[width + 0.9, 1.25]} />
                <meshStandardMaterial map={slotRail} color="#e8d6c4" roughness={0.6} />
            </mesh>
            <Slots />
        </group>
    );
}

function Slots() {
    const two = useMemo(() => artTexture('plate-2.webp'), []);
    const four = useMemo(() => artTexture('plate-4.webp'), []);
    const plain = useMemo(() => artTexture('plate-blank.webp'), []);
    const scoring = [2, 3, 4, 5].map(slot => slotPosition(slot, 4));

    return (
        <group>
            {REQUIRED_SLOT_X.map((x, i) => (
                <mesh key={i} position={[x, 0.008, SLOT_ROW_Z]} rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[1.05, 1.05]} />
                    <meshStandardMaterial map={i === 0 ? two : four} transparent roughness={lookNext ? 0.32 : 0.45} metalness={lookNext ? 0.85 : 0.3} />
                </mesh>
            ))}
            {scoring.map((p, i) => (
                <mesh key={i} position={[p.x, 0.008, SLOT_ROW_Z]} rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[1.0, 1.0]} />
                    <meshStandardMaterial map={plain} transparent opacity={0.85} roughness={lookNext ? 0.32 : 0.45} metalness={lookNext ? 0.85 : 0.3} />
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

// The look preview's light rig (option 1, step B): one flame drives the candle, a warm key
// from the fireplace side (left in the tavern painting) and the web-page layers behind; a cool,
// dim fill keeps shadows from going black; a rim from behind outlines the dice; a small room
// made in code gives dice, brass and varnish something to reflect.
function NextLights() {
    const candle = useRef<THREE.PointLight>(null);
    const fire = useRef<THREE.DirectionalLight>(null);
    const flash = useRef<THREE.PointLight>(null);
    const { gl, scene } = useThree();

    useEffect(() => {
        const pmrem = new THREE.PMREMGenerator(gl);
        const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        scene.environment = env;
        scene.environmentIntensity = 0.16;
        return () => { scene.environment = null; env.dispose(); pmrem.dispose(); };
    }, [gl, scene]);

    useFrame(() => {
        const now = performance.now();
        const f = flame(now / 1000);
        if (candle.current) candle.current.intensity = 24 * f;
        if (fire.current) fire.current.intensity = 1.7 * (0.85 + 0.15 * f);
        shareFlame(f, now);
        if (flash.current) {
            const devil = Math.max(0, 1 - (now - table.devilAt) / 1200);
            const gold = Math.max(0, 1 - (now - table.celebrateAt) / 2000);
            flash.current.color.set(devil > gold ? '#ff1a1a' : '#ffd54f');
            flash.current.intensity = Math.max(devil, gold) * 60;
        }
    });

    return (
        <>
            <hemisphereLight args={['#ffd8a8', '#1a1f2e', 0.3]} />
            <directionalLight
                ref={fire}
                position={[-6, 7, 2]}
                color="#ffb373"
                castShadow
                shadow-mapSize={[2048, 2048]}
                shadow-camera-left={-6}
                shadow-camera-right={6}
                shadow-camera-top={6}
                shadow-camera-bottom={-6}
                shadow-bias={-0.0004}
                shadow-normalBias={0.02}
            />
            {/* A rim from behind and above: a thin bright edge on each die. */}
            <directionalLight position={[2, 6, -9]} intensity={0.35} color="#fff0dc" />
            <pointLight ref={candle} position={[3.5, 3, -3.5]} color="#ff9440" distance={16} decay={1.5} />
            <pointLight ref={flash} position={[0, 3, 0]} distance={12} decay={1.4} intensity={0} />
        </>
    );
}

// The look preview's finish over the 3D picture (option 1, step D): a soft glow on what's
// bright (brass highlights, lacquer, magic), a warm grade, then the filmic tone curve.
// (Vignette and grain are drawn over the whole page in CSS for now, so they reach the tavern
// picture too: `.look-finish`.)
function Finish() {
    return (
        <EffectComposer multisampling={4}>
            <Bloom mipmapBlur luminanceThreshold={0.93} luminanceSmoothing={0.15} intensity={0.45} radius={0.7} />
            <HueSaturation saturation={0.1} />
            <BrightnessContrast brightness={-0.03} contrast={0.08} />
            <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
    );
}

export function TableScene() {
    return (
        <>
            <fog attach="fog" args={['#120a05', 14, 30]} />
            <CameraRig />
            {lookNext ? <NextLights /> : <Lights />}
            <Tray />
            <Dice />
            {lookNext && <Finish />}
        </>
    );
}
