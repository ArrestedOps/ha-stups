import websocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';

/**
 * Registriert @fastify/websocket genau einmal pro Server. Jede Registrierung hängt einen eigenen
 * „upgrade"-Handler an den HTTP-Server; zwei davon bearbeiten dieselbe Verbindung doppelt
 * („ServerResponse has an already assigned socket").
 */
export async function ensureWebsocket(app: FastifyInstance): Promise<void> {
  if (!app.hasDecorator('websocketServer')) await app.register(websocket);
}
