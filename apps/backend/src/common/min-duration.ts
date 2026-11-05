/**
 * Tiempo mínimo de respuesta (`AUTH_MIN_RESPONSE_MS`, plan §9.2, RN-04): la operación tarda al menos
 * `minMs`, haya o no cuenta, para que el costo de Argon2 y de las consultas no revele su existencia.
 * Si la operación falla, el error se propaga también después del tiempo mínimo.
 */
export async function withMinimumDuration<T>(minMs: number, operation: () => Promise<T>): Promise<T> {
  const started = performance.now();
  const wait = async (): Promise<void> => {
    const remaining = minMs - (performance.now() - started);
    if (remaining > 0) await new Promise<void>((resolve) => setTimeout(resolve, remaining));
  };
  try {
    const result = await operation();
    await wait();
    return result;
  } catch (error) {
    await wait();
    throw error;
  }
}
