import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { TableScene } from './TableScene';
import { Hud } from './Hud';
import { Backdrop } from './Backdrop';
import { lookNext } from './look';
import { actions, preview, store, table } from './game';
import { simulateRoll } from './physics';
import { renderCorkPop, renderImpacts } from './sounds';
import './styles.css';

// Development only (left out of production builds): lets test scripts drive the game.
if (import.meta.env.DEV) (window as unknown as { __game: unknown }).__game = { actions, preview, store, table, simulateRoll, renderImpacts, renderCorkPop };

function App() {
    return (
        <>
            <Backdrop />
            <Canvas
                shadows={lookNext ? 'soft' : true}
                dpr={[1, 2]}
                camera={{ fov: 40, near: 0.1, far: 80, position: [0, 10, 8] }}
                gl={{ antialias: true, alpha: true }}
                style={{ position: 'fixed', inset: 0, zIndex: 1, touchAction: 'none' }}
            >
                <TableScene />
            </Canvas>
            {/* The look preview's finish over the table and tavern (never over the controls):
                a soft vignette and the faintest film grain. */}
            {lookNext && <div className="look-finish" aria-hidden="true"><div className="grain" /></div>}
            <Hud />
        </>
    );
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>
);
