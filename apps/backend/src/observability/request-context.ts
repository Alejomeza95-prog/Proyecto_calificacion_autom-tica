import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

/** Cabecera de respuesta con el identificador de la solicitud (T-47, DEC-25). */
export const CORRELATION_HEADER = 'X-Request-Id';

export interface RequestContext {
  readonly correlationId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Ejecuta `fn` con el contexto indicado; las continuaciones asíncronas lo heredan. */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

/** Identificador de la solicitud en curso, o `undefined` fuera de una solicitud (p. ej. el CLI). */
export function currentCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}

/**
 * Middleware de Express (T-47, DEC-25): genera en el servidor un `correlationId` con
 * `crypto.randomUUID()`, lo devuelve en `X-Request-Id` y lo propaga con `AsyncLocalStorage`.
 * Cualquier `X-Request-Id` (u otra cabecera) enviada por el cliente se **ignora**: el identificador
 * nunca proviene de un cliente público.
 */
export function correlationIdMiddleware(_req: IncomingMessage, res: ServerResponse, next: () => void): void {
  const correlationId = randomUUID();
  res.setHeader(CORRELATION_HEADER, correlationId);
  runWithRequestContext({ correlationId }, next);
}
