/**
 * Puerto de verificación de CAPTCHA en el servidor (DEC-16, T-41). El adaptador del proveedor real
 * queda pendiente de su selección (bloquea el release); aquí solo existen el puerto y el adaptador de
 * prueba, que la configuración rechaza fuera de local.
 */
export interface CaptchaContext {
  /** Acción a la que debe estar ligado el token (DEC-16: `login`). */
  readonly action: 'login';
  readonly remoteIp: string;
}

export interface CaptchaVerifier {
  /**
   * `true` si el token es válido para la acción; `false` si es inválido.
   * Lanza si el proveedor no responde o devuelve un error (fallo cerrado, plan §11).
   */
  verify(token: string, context: CaptchaContext): Promise<boolean>;
}

export const CAPTCHA_VERIFIER = Symbol('CAPTCHA_VERIFIER');

export type TestCaptchaMode = 'disponible' | 'error' | 'lento' | 'respuesta-invalida';

/** Adaptador de prueba (DEC-16): acepta solo `TestCaptchaVerifier.VALID_TOKEN` y simula fallas del proveedor. */
export class TestCaptchaVerifier implements CaptchaVerifier {
  static readonly VALID_TOKEN = 'captcha-de-prueba-valido';
  mode: TestCaptchaMode = 'disponible';
  calls = 0;

  constructor(private readonly slowMs = 60_000) {}

  async verify(token: string, context: CaptchaContext): Promise<boolean> {
    this.calls += 1;
    switch (this.mode) {
      case 'error':
        throw new Error('Proveedor de CAPTCHA con error (simulado)');
      case 'respuesta-invalida':
        throw new Error('Respuesta del proveedor no validable (simulado)');
      case 'lento':
        await new Promise<void>((resolve) => setTimeout(resolve, this.slowMs).unref());
        return false;
      case 'disponible':
        return context.action === 'login' && token === TestCaptchaVerifier.VALID_TOKEN;
    }
  }
}
