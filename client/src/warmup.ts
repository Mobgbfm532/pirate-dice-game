import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { tableCover } from './game';
import { lookNext } from './look';
import { diceLooksChanged } from './textures';

// Shaders compiled before they're needed (12 Nov, the user: a few ability moments stuttered as they came
// in). three.js builds a material's shader the first time it's drawn, and on a phone that stalls the
// page for a moment: Starry Form's night-sky dice as they're thrown hidden, the die Mind Whip makes you
// keep, Klarg's paw, Vaelin's dark flame, an opponent's own dice. So every material in the scene (hidden
// ones too) and the dice's other looks are compiled ahead, and their pictures sent to the GPU:
// - a moment after the table loads, and again as each painted look arrives (the faces, the night sky);
// - as each opponent sits down (their dice, and what their fight brings);
// - as an ability's painting covers the screen (its round's effects have just been mounted, unseen).
export function useWarmShaders(geometry: THREE.BufferGeometry, extra: () => THREE.Material[], key: string) {
    const { gl, scene, camera } = useThree();
    useEffect(() => {
        const target = new THREE.WebGLRenderTarget(1, 1);
        let alive = true;
        const warm = () => {
            if (!alive) return;
            const group = new THREE.Group();
            for (const material of new Set(extra())) {
                // (Cast and receive shadows like a die: they're part of a shader's recipe.)
                const mesh = new THREE.Mesh(geometry, material);
                mesh.castShadow = mesh.receiveShadow = true;
                group.add(mesh);
            }
            group.visible = false; // (compiled all the same; never drawn)
            scene.add(group);
            scene.traverse(object => {
                const materials = (object as THREE.Mesh).material;
                if (!materials) return;
                for (const material of ([] as THREE.Material[]).concat(materials)) {
                    for (const value of Object.values(material)) {
                        if (value instanceof THREE.Texture && value.image && !value.isRenderTargetTexture && !(value instanceof THREE.CubeTexture)) gl.initTexture(value);
                    }
                }
            });
            // (The new look draws everything into the glow pass's picture first, not straight to the screen,
            // which changes each shader's recipe: compiled for the screen, they were built again in play.)
            const before = gl.getRenderTarget();
            if (lookNext) gl.setRenderTarget(target);
            gl.compileAsync(scene, camera).catch(() => {}).finally(() => scene.remove(group));
            gl.setRenderTarget(before);
        };
        const timers = [600, 3000, 7000].map(ms => setTimeout(warm, ms));
        const stopCover = tableCover.subscribe(() => { if (tableCover.get()) warm(); });
        diceLooksChanged.add(warm);
        return () => { alive = false; timers.forEach(clearTimeout); stopCover(); diceLooksChanged.delete(warm); target.dispose(); };
    }, [gl, scene, camera, geometry, extra, key]);
}
