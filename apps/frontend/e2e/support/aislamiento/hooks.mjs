// Para `verificar.mjs`: redirige `node:child_process` a la simulación SOLO en los módulos de `e2e/support/*.mjs`.
const FAKE = new URL('./fake-docker.mjs', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'node:child_process' && context.parentURL && /\/e2e\/support\/[^/]+\.mjs$/.test(context.parentURL)) {
    return { url: FAKE, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
