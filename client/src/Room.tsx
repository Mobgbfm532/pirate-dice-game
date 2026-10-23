import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { BOT_ID, store } from './game';
import { acrossTheTable, backdropLayout, currentScene } from './Backdrop';
import { flame, lookNext } from './look';

// The tavern behind the table and the opponent's bust, drawn inside the 3D scene (option 1,
// step A, 23 Oct). They used to be page layers under a see-through canvas; now the glow and
// grade reach the whole room, and nothing shows a ragged edge where the canvas met the page.
// They keep exactly the places they had: flat pictures hung in front of the camera, laid out in
// screen pixels from the same numbers (backdropLayout), drawn first so the table covers them.
// Their CSS filters, glows and entrances are redone here: the shader does brightness, saturate
// and sepia the way CSS does (in sRGB), and each drop-shadow is a blurred copy of the picture.
// In the look preview (step B) they also take the room's light: the opponent is lit warm from
// the fire side with a rim round their outline, and the tavern's lanterns breathe with the flame.

const BASE = import.meta.env.BASE_URL;
const DEPTH = 50; // how far in front of the camera the pictures hang (any depth inside the frustum)

// ---- Pictures and their glows ----

interface Glow { blur: number; x: number; color: [number, number, number, number] } // a CSS drop-shadow (px, px, rgba)
interface Halo { texture: THREE.Texture; pad: number; scale: number } // pad: the picture's px added each side
interface Picture { texture: THREE.Texture; ready: boolean; aspect: number; halos: Map<string, Halo | null> }

const pictures = new Map<string, Picture>();

function picture(src: string): Picture {
    let p = pictures.get(src);
    if (!p) {
        const loaded: Picture = { texture: null!, ready: false, aspect: 1, halos: new Map() };
        loaded.texture = new THREE.TextureLoader().load(src, t => {
            const image = t.image as HTMLImageElement;
            loaded.aspect = image.naturalWidth / image.naturalHeight;
            loaded.ready = true;
        });
        // Premultiplied, as the browser draws images (no dark fringe round a cut-out). The values
        // stay sRGB; the shader works in sRGB as CSS filters do.
        loaded.texture.premultiplyAlpha = true;
        loaded.texture.anisotropy = 8;
        pictures.set(src, loaded);
        p = loaded;
    }
    return p;
}

const canFilter = typeof document !== 'undefined' && 'filter' in (document.createElement('canvas').getContext('2d') ?? {});

// The glow round a cut-out: what `drop-shadow(x 0 blur white)` draws, without the picture itself
// (the colour comes later). Made at a quarter size (it's soft anyway) for the picture's current
// size on screen, in steps of 15%. scale: picture px per screen px.
function halo(p: Picture, glow: Glow, scale: number): Halo | null {
    const step = Math.round(Math.log(scale) / Math.log(1.15));
    const key = `${glow.blur},${glow.x},${step}`;
    if (p.halos.has(key)) return p.halos.get(key)!;
    const image = p.texture.image as HTMLImageElement | undefined;
    if (!p.ready || !image || !canFilter) return null;
    const s = 1.15 ** step, k = 0.25;
    const w = image.naturalWidth * k, h = image.naturalHeight * k;
    const blur = glow.blur * s * k, x = glow.x * s * k;
    const pad = Math.ceil(2.5 * blur + Math.abs(x));
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(w + pad * 2);
    canvas.height = Math.ceil(h + pad * 2);
    const ctx = canvas.getContext('2d')!;
    // Draw the picture off the canvas with its shadow thrown back on: only the shadow lands.
    const away = canvas.width + 10;
    ctx.filter = `drop-shadow(${x - away}px 0 ${blur}px #fff)`;
    ctx.drawImage(image, pad + away, pad, w, h);
    const texture = new THREE.CanvasTexture(canvas);
    texture.premultiplyAlpha = true;
    const made = { texture, pad: pad / k, scale: s };
    p.halos.set(key, made);
    return made;
}

// ---- The shader: a picture with CSS's brightness, saturate and sepia, or a glow's colour ----

const vertexShader = /* glsl */`
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const fragmentShader = /* glsl */`
uniform sampler2D map;
uniform float brightness, saturation, sepia, opacity;
uniform vec4 tint;
uniform bool glow, linearOut;
// The look preview's light. flame: the shared flicker (around 1). lanterns: how much the bright
// parts of a picture breathe with it. warmth, rim: the fire's wash and outline on a cut-out;
// px: one screen pixel in the picture's texture coordinates.
uniform float flame, lanterns, warmth, rim;
uniform vec2 px;
varying vec2 vUv;
// How much of the outline faces a light from direction d: open space beside it that way.
float edge(vec2 d) {
    float open = 0.0;
    for (int i = 1; i <= 4; i++) open += 1.0 - texture2D(map, vUv + d * px * (1.5 * float(i))).a;
    return open / 4.0;
}
vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
void main() {
    vec4 t = texture2D(map, vUv);
    float a;
    vec3 c;
    if (glow) {
        a = t.a * tint.a * opacity;
        c = tint.rgb;
    } else {
        a = t.a * opacity;
        c = t.a > 0.0 ? t.rgb / t.a : vec3(0.0);
        c = clamp(c * brightness, 0.0, 1.0);
        float s = saturation;
        c = clamp(mat3(
            0.213 + 0.787 * s, 0.213 - 0.213 * s, 0.213 - 0.213 * s,
            0.715 - 0.715 * s, 0.715 + 0.285 * s, 0.715 - 0.715 * s,
            0.072 - 0.072 * s, 0.072 - 0.072 * s, 0.072 + 0.928 * s) * c, 0.0, 1.0);
        float k = 1.0 - sepia;
        c = clamp(mat3(
            0.393 + 0.607 * k, 0.349 - 0.349 * k, 0.272 - 0.272 * k,
            0.769 - 0.769 * k, 0.686 + 0.314 * k, 0.534 - 0.534 * k,
            0.189 - 0.189 * k, 0.168 - 0.168 * k, 0.131 + 0.869 * k) * c, 0.0, 1.0);
        if (lanterns > 0.0) {
            // Lanterns, candles and the fire: the brightest parts follow the flame.
            float lum = dot(c, vec3(0.299, 0.587, 0.114));
            c = clamp(c * (1.0 + (flame - 1.0) * lanterns * smoothstep(0.5, 0.9, lum)), 0.0, 1.0);
        }
        if (warmth > 0.0) {
            // The fire is to the left (as in the tavern painting): a warm wash on that side, the
            // far side a little in shade.
            float fire = smoothstep(0.85, 0.0, vUv.x) * warmth * flame;
            c *= mix(vec3(1.0), vec3(1.22, 0.98, 0.74), fire);
            c *= mix(1.0, 0.86, smoothstep(0.45, 1.0, vUv.x) * warmth);
            // Firelight on the outline facing the fire, and a fainter, paler rim from the candle
            // on the other side.
            vec3 light = vec3(1.0, 0.58, 0.28) * edge(vec2(-1.0, 0.35)) * flame + vec3(1.0, 0.8, 0.6) * edge(vec2(1.0, 0.5)) * 0.4;
            c = clamp(c + light * rim * t.a, 0.0, 1.0);
        }
    }
    // On screen the colours stay sRGB, as the page drew them; into the look preview's finish
    // they go linear like the rest of the scene.
    if (linearOut) c = toLinear(c);
    gl_FragColor = vec4(c * a, a);
}`;

function pictureMaterial() {
    return new THREE.ShaderMaterial({
        vertexShader, fragmentShader,
        uniforms: {
            map: { value: null }, brightness: { value: 1 }, saturation: { value: 1 }, sepia: { value: 0 },
            opacity: { value: 1 }, tint: { value: new THREE.Vector4() }, glow: { value: false }, linearOut: { value: lookNext },
            flame: { value: 1 }, lanterns: { value: 0 }, warmth: { value: 0 }, rim: { value: 0 }, px: { value: new THREE.Vector2() }
        },
        // Drawn first, behind everything, whatever the distance: the table simply paints over.
        depthTest: false, depthWrite: false, fog: false, toneMapped: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
        blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor
    });
}

// ---- Timing: the CSS curves of the old entrance, glow and Martha's swap ----

function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
    const at = (a: number, b: number, t: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
    return (x: number) => {
        if (x <= 0) return 0;
        if (x >= 1) return 1;
        let lo = 0, hi = 1, t = x;
        for (let i = 0; i < 20; i++) {
            if (at(x1, x2, t) < x) lo = t; else hi = t;
            t = (lo + hi) / 2;
        }
        return at(y1, y2, t);
    };
}
const entranceCurve = cubicBezier(0.2, 0.8, 0.25, 1);
const ease = cubicBezier(0.25, 0.1, 0.25, 1);
const easeOut = cubicBezier(0, 0, 0.58, 1);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const ENTRANCE_MS = 1100, SWAP_MS = 700, GLOW_MS = 400;

// The opponent's light, waiting and on their turn.
const BUST_LIGHT = lookNext ? {
    // Lit in the shader (the fire's side and rim follow the flame); dimmer while it isn't their turn.
    idle: { brightness: 0.78, sepia: 0.08, glows: [{ blur: 18, x: 0, color: [0, 0, 0, 0.6] }] as Glow[] },
    active: { brightness: 0.96, sepia: 0.04, glows: [{ blur: 22, x: 0, color: [255, 158, 64, 0.35] }] as Glow[] }
} : {
    idle: { brightness: 0.82, sepia: 0, glows: [{ blur: 18, x: 0, color: [0, 0, 0, 0.6] }] as Glow[] },
    active: { brightness: 1.02, sepia: 0, glows: [{ blur: 22, x: 0, color: [255, 158, 64, 0.45] }] as Glow[] }
};
const SWAP_GLOW: Glow = { blur: 30, x: 0, color: [206, 147, 216, 1] }; // Martha's violet
const GLOW_MESHES = 5;

export function Room() {
    const { camera, size } = useThree();
    const group = useRef<THREE.Group>(null);
    const room = useRef<THREE.Mesh>(null);
    const bust = useRef<THREE.Mesh>(null);
    const glows = useRef<(THREE.Mesh | null)[]>([]);
    const materials = useMemo(() => ({ room: pictureMaterial(), bust: pictureMaterial(), glows: Array.from({ length: GLOW_MESHES }, pictureMaterial) }), []);
    // Who sits there and since when; how far into their turn's glow.
    const seat = useRef({ key: '' as string | null, since: 0, swap: false, glowFrom: 0, glowTo: 0, glowAt: 0 });
    const shown = useRef<Picture | null>(null);
    const v = useMemo(() => new THREE.Vector3(), []);
    const unused = useMemo(() => new THREE.Vector3(), []);

    useFrame(() => {
        const g = group.current;
        if (!g || !room.current || !bust.current) return;
        const cam = camera as THREE.PerspectiveCamera;
        const now = performance.now();
        const f = lookNext ? flame(now / 1000) : 1;
        cam.matrixWorld.decompose(g.position, g.quaternion, unused);

        // Screen px to the plane the pictures hang in (linear at a fixed depth, whatever the
        // camera's view offset).
        v.set(-1, 1, 0.5).applyMatrix4(cam.projectionMatrixInverse).multiplyScalar(DEPTH / -v.z);
        const x0 = v.x, y0 = v.y;
        v.set(1, -1, 0.5).applyMatrix4(cam.projectionMatrixInverse).multiplyScalar(DEPTH / -v.z);
        const sx = (v.x - x0) / size.width, sy = (v.y - y0) / size.height;
        const put = (mesh: THREE.Object3D, left: number, top: number, w: number, h: number) => {
            mesh.position.set(x0 + (left + w / 2) * sx, y0 + (top + h / 2) * sy, -DEPTH);
            mesh.scale.set(w * sx, -h * sy, 1);
        };
        const L = backdropLayout;

        // The room: the scene's picture once it has loaded (the last one stays up till then).
        const wanted = picture(`${BASE}art/${currentScene().file}`);
        if (wanted.ready) shown.current = wanted;
        const r = materials.room.uniforms;
        room.current.visible = !!shown.current && L.roomWidth > 0;
        if (shown.current) {
            r.map.value = shown.current.texture;
            // The look preview: the room holds nearly steady while its lanterns breathe with the flame.
            r.brightness.value = lookNext ? 0.8 + f * 0.04 : 0.8;
            r.flame.value = f;
            r.lanterns.value = lookNext ? 1.6 : 0;
            r.saturation.value = lookNext ? 1.1 : 0.95;
            r.sepia.value = lookNext ? 0.12 : 0;
            put(room.current, L.roomLeft, L.roomTop, L.roomWidth, L.roomHeight);
        }

        // The opponent. A new face makes an entrance; Martha changing faces swaps with a shimmer.
        const across = acrossTheTable();
        const key = across?.key ?? null;
        const s = seat.current;
        if (key !== s.key) {
            s.swap = !!key && !!s.key && key.startsWith('Martha') && s.key.startsWith('Martha');
            s.key = key;
            s.since = 0;
        }
        const art = across ? picture(across.portrait.src) : null;
        const glowTarget = across && store.get().state?.currentTurnId === BOT_ID ? 1 : 0;
        const glowNow = lerp(s.glowFrom, s.glowTo, ease(clamp01((now - s.glowAt) / GLOW_MS)));
        if (glowTarget !== s.glowTo) Object.assign(s, { glowFrom: glowNow, glowTo: glowTarget, glowAt: now });
        bust.current.visible = false;
        glows.current.forEach(m => m && (m.visible = false));
        if (!across || !art?.ready || L.bustHeight <= 0) return;
        if (!s.since) s.since = now; // the entrance starts once the picture is there

        const light = BUST_LIGHT;
        let brightness = lerp(light.idle.brightness, light.active.brightness, glowNow);
        const sepia = lerp(light.idle.sepia, light.active.sepia, glowNow);
        let scale = lerp(1, 1.03, glowNow), rise = 0, opacity = 1, settle = 1; // settle: how much of the usual glow shows
        let swapGlow = 0;
        const elapsed = now - s.since;
        if (s.swap && elapsed < SWAP_MS) {
            const p = elapsed / SWAP_MS, e = easeOut(p);
            opacity = p < 0.4 ? easeOut(p / 0.4) : 1;
            scale = lerp(0.96, 1, e);
            brightness = lerp(1.6, brightness, e);
            settle = e;
            swapGlow = 1 - e;
        } else if (!s.swap && elapsed < ENTRANCE_MS) {
            // Rises from behind the table and settles into the seat.
            const p = elapsed / ENTRANCE_MS;
            if (p < 0.55) {
                const e = entranceCurve(p / 0.55);
                opacity = e; rise = lerp(0.45, -0.03, e); scale = lerp(0.92, 1.02, e);
            } else {
                const e = entranceCurve((p - 0.55) / 0.45);
                rise = lerp(-0.03, 0, e); scale = lerp(1.02, 1, e);
            }
            settle = entranceCurve(p);
            brightness = lerp(0.3, brightness, settle);
        }

        // Anchored so the table hides the lower fifth; `seat` draws a cut-out that shows more body larger.
        const height = L.bustHeight * (across.portrait.seat ?? 1);
        const width = height * art.aspect;
        const centerX = L.tableX, centerY = L.horizon - L.bustHeight * 0.8 + height / 2 + rise * height;
        const w = width * scale, h = height * scale;
        const b = materials.bust.uniforms;
        b.map.value = art.texture;
        b.brightness.value = brightness;
        b.sepia.value = sepia;
        b.opacity.value = opacity;
        b.flame.value = f;
        b.warmth.value = lookNext ? 0.55 : 0;
        b.rim.value = lookNext ? lerp(0.4, 0.6, glowNow) : 0;
        b.px.value.set(1 / w, 1 / h);
        put(bust.current, centerX - w / 2, centerY - h / 2, w, h);
        bust.current.visible = true;

        // Its glows: waiting and their turn's crossfade; Martha's violet as she swaps.
        const wantedGlows: [Glow, number][] = [
            ...light.idle.glows.map(gl => [gl, (1 - glowNow) * settle] as [Glow, number]),
            ...light.active.glows.map(gl => [gl, glowNow * settle] as [Glow, number]),
            [SWAP_GLOW, swapGlow]
        ];
        const natural = (art.texture.image as HTMLImageElement).naturalHeight;
        const pxScale = natural / height; // picture px per screen px (before the entrance's scaling, which scales the glow too)
        let n = 0;
        for (const [glow, weight] of wantedGlows) {
            if (weight <= 0.001 || n >= GLOW_MESHES) continue;
            const made = halo(art, glow, pxScale);
            const mesh = glows.current[n];
            if (!made || !mesh) continue;
            const u = materials.glows[n].uniforms;
            u.map.value = made.texture;
            u.glow.value = true;
            u.tint.value.set(glow.color[0] / 255, glow.color[1] / 255, glow.color[2] / 255, glow.color[3] * weight);
            u.opacity.value = opacity;
            const pad = made.pad * h / natural;
            put(mesh, centerX - w / 2 - pad, centerY - h / 2 - pad, w + pad * 2, h + pad * 2);
            mesh.visible = true;
            n++;
        }
    });

    const noRay = () => null;
    return (
        <group ref={group}>
            <mesh ref={room} renderOrder={-3} material={materials.room} frustumCulled={false} raycast={noRay}>
                <planeGeometry args={[1, 1]} />
            </mesh>
            {materials.glows.map((m, i) => (
                <mesh key={i} ref={el => { glows.current[i] = el; }} renderOrder={-2} material={m} frustumCulled={false} raycast={noRay} visible={false}>
                    <planeGeometry args={[1, 1]} />
                </mesh>
            ))}
            <mesh ref={bust} renderOrder={-1} material={materials.bust} frustumCulled={false} raycast={noRay} visible={false}>
                <planeGeometry args={[1, 1]} />
            </mesh>
        </group>
    );
}
