import { createGameServer } from './server.js';
const server = createGameServer();
const port = Number(process.env.PORT ?? 3000);
await server.listen(port, '0.0.0.0');
console.log(`Game server listening on ${port}`);
console.log(`Room ID: ${server.game.roomId}`);
console.log(`Host token: ${server.game.hostToken}`);
