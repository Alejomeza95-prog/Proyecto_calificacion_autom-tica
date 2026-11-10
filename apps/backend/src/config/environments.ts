/**
 * Entornos locales (desarrollo y pruebas). Única definición: la usan la configuración de la API
 * (`auth-config.ts`) y el `MigrationRunner` (DEC-28).
 * La comparación es exacta: cualquier otro valor (`staging`, `prod`, `Development`…) no es local.
 */
export const LOCAL_ENVIRONMENTS: readonly string[] = ['development', 'test'];

export function isLocalEnvironment(nodeEnv: string): boolean {
  return LOCAL_ENVIRONMENTS.includes(nodeEnv);
}
