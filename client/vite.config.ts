import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The game server (npm start in the project root) runs on :3000. In development Vite
// serves the 3D client and forwards sockets and the shared art/audio to that server
// (set GAME_SERVER to point at a different one).
const GAME_SERVER = process.env.GAME_SERVER ?? 'http://localhost:3000';

export default defineConfig({
    base: '/next/',
    plugins: [react()],
    server: {
        fs: { allow: ['..'] },
        proxy: {
            '/socket.io': { target: GAME_SERVER, ws: true },
            '^/[^/]+\.(mp3|wav|png|jpg)$': GAME_SERVER
        }
    },
    build: {
        outDir: 'dist',
        chunkSizeWarningLimit: 1200
    }
});
