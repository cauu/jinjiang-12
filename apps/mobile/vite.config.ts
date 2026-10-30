import { defineConfig } from 'vite';
const backend = `http://127.0.0.1:${process.env.PORT ?? '3000'}`;
// The Colyseus client talks to /colyseus/matchmake and /colyseus/<process>/<room>; strip the prefix for the game server.
export const gameProxy = (target: string) => ({ '/colyseus': { target, ws: true, rewrite: (path: string) => path.replace(/^\/colyseus/, '') }, '/media': target, '/admin': target });
export default defineConfig({
 server:{proxy:gameProxy(backend)},
 build:{rollupOptions:{output:{manualChunks(id){if(id.includes('/node_modules/three/'))return 'three';if(id.includes('/@dimforge/'))return 'rapier';}}}}
});
