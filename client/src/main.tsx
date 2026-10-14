import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { TableScene } from './TableScene';
import { Hud } from './Hud';
import { Backdrop } from './Backdrop';
import './styles.css';

function App() {
    return (
        <>
            <Backdrop />
            <Canvas
                shadows
                dpr={[1, 2]}
                camera={{ fov: 40, near: 0.1, far: 80, position: [0, 10, 8] }}
                gl={{ antialias: true, alpha: true }}
                style={{ position: 'fixed', inset: 0, zIndex: 1 }}
            >
                <TableScene />
            </Canvas>
            <Hud />
        </>
    );
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>
);
