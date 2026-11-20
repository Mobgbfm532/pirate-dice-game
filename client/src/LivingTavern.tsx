import { useEffect, useRef } from 'react';

// The start screen's living tavern (12 Nov, the user's pick from docs/landing-page-brainstorm.md): the
// tavern painting drawn through a small WebGL shader so its lights live. Each light in the painting
// (LIGHTS, in its pixels) flickers on its own, brightening what it lights; the fire's flames lick and
// shimmer; dust drifts through the warm air; on a phone the whole picture drifts a little, slowly, as
// the table's backdrop does (a computer holds still, the user's call of 3 Nov). Drawn like CSS's
// `cover`, with the start screen's vignette drawn in. Without WebGL, or with reduced motion, it isn't drawn
// and the plain painting (the start screen's CSS background) shows.

const SRC = `${import.meta.env.BASE_URL}art/tavern.webp`;
const IMAGE_W = 1408, IMAGE_H = 768;
const still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const drifts = typeof matchMedia !== 'undefined' && !matchMedia('(pointer: fine)').matches;

// [x, y, radius] in the painting's pixels, and how strongly it flickers (the fire most).
type Light = [number, number, number, number];
const FIRE: Light = [292, 405, 120, 1];
const LIGHTS: Light[] = [
    FIRE,
    [1258, 515, 80, 1],     // the candle on the table, nearest
    [224, 226, 34, 0.55], [424, 244, 30, 0.55], // the mantel's candles
    [557, 150, 42, 0.45], [669, 212, 30, 0.45], [967, 66, 48, 0.45], [1113, 112, 40, 0.45], // lanterns
    [1046, 196, 30, 0.45], [911, 232, 22, 0.4], [1110, 236, 22, 0.4], [1205, 256, 26, 0.4], [1240, 232, 26, 0.4],
    [729, 152, 64, 0.4], [820, 196, 40, 0.4], [1022, 236, 34, 0.4], // the chandeliers
    [947, 283, 30, 0.35], [1140, 282, 26, 0.35] // far lights
];

const VERTEX = `
attribute vec2 pos;
void main() { gl_Position = vec4(pos, 0.0, 1.0); }`;

const FRAGMENT = `
precision mediump float;
uniform sampler2D picture;
uniform vec2 screen;     // the canvas, in pixels
uniform float scale;     // painting pixels to canvas pixels (cover)
uniform vec2 offset;     // where the painting's corner sits, canvas pixels
uniform float t;
uniform vec4 lights[${LIGHTS.length}];

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 s = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), s.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), s.x), s.y);
}
// A flame's brightness over time: slow wander plus quicker gutters, -1..1.
float flicker(float seed, float speed) {
    return (noise(vec2(t * 1.7 * speed, seed)) - 0.5) * 1.2 + (noise(vec2(t * 7.0 * speed, seed + 9.0)) - 0.5) * 0.8;
}

void main() {
    vec2 frag = vec2(gl_FragCoord.x, screen.y - gl_FragCoord.y);
    vec2 px = (frag - offset) / scale;               // this pixel, in the painting
    // The fire licks: its picture sampled along rising, swaying noise, strongest in the flames.
    vec4 fire = lights[0];
    float nearFire = exp(-pow(length(px - fire.xy) / fire.z, 2.0));
    vec2 lick = vec2(noise(px * 0.05 + vec2(0.0, t * 2.4)) - 0.5, noise(px * 0.04 + vec2(4.0, t * 3.1)) - 0.3);
    vec3 raw = texture2D(picture, px / vec2(${IMAGE_W}.0, ${IMAGE_H}.0)).rgb;
    float flame = smoothstep(0.55, 0.85, max(raw.r, raw.g)) * smoothstep(0.08, 0.3, raw.r - raw.b);
    vec2 bent = px + lick * vec2(5.0, 7.0) * nearFire * (0.35 + flame);
    vec3 c = texture2D(picture, bent / vec2(${IMAGE_W}.0, ${IMAGE_H}.0)).rgb;
    float core = smoothstep(0.55, 0.85, max(c.r, c.g)) * smoothstep(0.08, 0.3, c.r - c.b);

    // Every light breathes on what it lights; its own flame most.
    float glow = 0.0;
    for (int i = 0; i < ${LIGHTS.length}; i++) {
        vec4 l = lights[i];
        float w = exp(-pow(length(px - l.xy) / l.z, 2.0));
        float f = flicker(float(i) * 3.7, 0.8 + l.w * 0.5) * l.w;
        glow += w * f * (0.2 + core * 0.3);
    }
    c *= 1.0 + glow;
    c += vec3(0.10, 0.045, 0.0) * max(glow, 0.0) * core;

    // Dust in the warm air: a few slow motes, drifting up and across, glinting as they turn.
    float dust = 0.0;
    for (int i = 0; i < 26; i++) {
        float fi = float(i);
        vec2 seed = vec2(hash(vec2(fi, 1.3)), hash(vec2(fi, 7.9)));
        vec2 p = fract(seed + vec2(sin(t * 0.07 + fi) * 0.04 + t * 0.004 * (seed.y - 0.5), -t * (0.006 + seed.x * 0.01)));
        vec2 d = (frag / screen - p) * screen;
        float r = 1.2 + seed.y * 1.8;
        dust += exp(-dot(d, d) / (r * r)) * (0.35 + 0.65 * noise(vec2(t * 0.8, fi)));
    }
    c += vec3(1.0, 0.82, 0.55) * dust * 0.45;
    // The start screen's vignette (its CSS background's: an ellipse 80% by 70% at 50% 45%).
    float e = clamp(length((frag / screen - vec2(0.5, 0.45)) / vec2(0.8, 0.7)), 0.0, 1.0);
    vec4 shade = mix(vec4(18.0, 10.0, 4.0, 0.45 * 255.0), vec4(8.0, 4.0, 2.0, 0.9 * 255.0), e) / 255.0;
    gl_FragColor = vec4(mix(c, shade.rgb, shade.a), 1.0);
}`;

export function LivingTavern() {
    const holder = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!holder.current || still) return;
        // A new canvas each time it mounts: a context once given back can't be used again.
        const el = document.createElement('canvas');
        el.className = 'living-tavern';
        holder.current.appendChild(el);
        const gl = el.getContext('webgl', { alpha: false, antialias: false });
        if (!gl) { el.remove(); return; }
        let frame = 0, gone = false, last = 0;
        const img = new Image();
        img.onload = () => {
            if (gone) return;
            const shader = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
            const program = gl.createProgram()!;
            gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX));
            gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT));
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                if (import.meta.env.DEV) console.warn('living tavern:', gl.getProgramInfoLog(program), ...gl.getAttachedShaders(program)!.map(x => gl.getShaderInfoLog(x)));
                return;
            }
            gl.useProgram(program);
            gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
            const pos = gl.getAttribLocation(program, 'pos');
            gl.enableVertexAttribArray(pos);
            gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
            gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            const u = (name: string) => gl.getUniformLocation(program, name);
            gl.uniform4fv(u('lights'), LIGHTS.flat());
            const start = performance.now();
            const draw = (now: number) => {
                if (gone) return;
                frame = requestAnimationFrame(draw);
                if (now - last < 32) return; // (about 30 frames a second is plenty for flames)
                last = now;
                // One canvas pixel per screen point: the painting is softer than that already.
                const w = Math.max(1, Math.round(el.clientWidth)), h = Math.max(1, Math.round(el.clientHeight));
                if (el.width !== w || el.height !== h) { el.width = w; el.height = h; gl.viewport(0, 0, w, h); }
                const s = (now - start) / 1000;
                // Cover, a touch larger, so the drift never shows an edge.
                const scale = Math.max(w / IMAGE_W, h / IMAGE_H) * 1.04;
                const dx = drifts ? Math.sin(s * 0.11) * 7 + Math.sin(s * 0.047) * 5 : 0;
                const dy = drifts ? Math.sin(s * 0.083 + 1) * 4 : 0;
                gl.uniform2f(u('screen'), w, h);
                gl.uniform1f(u('scale'), scale);
                gl.uniform2f(u('offset'), (w - IMAGE_W * scale) / 2 + dx, (h - IMAGE_H * scale) / 2 + dy);
                gl.uniform1f(u('t'), s);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                el.style.opacity = '1';
            };
            frame = requestAnimationFrame(draw);
        };
        img.src = SRC;
        return () => {
            gone = true;
            cancelAnimationFrame(frame);
            gl.getExtension('WEBGL_lose_context')?.loseContext();
            el.remove();
        };
    }, []);
    if (still) return null;
    return (
<div ref={holder} aria-hidden="true" style={{ display: 'contents' }} />
    );
}
