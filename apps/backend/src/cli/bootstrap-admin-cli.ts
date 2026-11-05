import { RAW_EMAIL_PATTERN } from '../auth/dto/register.dto';
import type { BootstrapAdminService, BootstrapOutcome } from '../bootstrap/bootstrap-admin.service';

/** Salida del comando; en producción, `process.stdout` y `process.stderr`. */
export interface CliIo {
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
}

/** Contexto con el servicio; `close` libera MongoDB, Redis y envíos pendientes. */
export interface BootstrapContext {
  readonly service: Pick<BootstrapAdminService, 'run'>;
  close(): Promise<void>;
}

export const USAGE = 'Uso: bootstrap:admin --nombre "<nombre>" --correo <correo>';
const MAX_NOMBRE = 120;
const MAX_CORREO = 254;
/** Variables con forma de contraseña del administrador (DEC-08, alternativa b descartada). */
const PASSWORD_ENV = /^(BOOTSTRAP|ADMIN)\w*PASS/i;

/** Mensajes genéricos: nunca incluyen el enlace, el token, el correo ni el detalle de un error. */
export const MESSAGES: Readonly<Record<BootstrapOutcome, string>> = {
  CREADA: 'Cuenta de administración creada. Se envió el enlace de activación al correo indicado.',
  REEMITIDA:
    'La cuenta de administración ya estaba pendiente. Se envió un enlace de activación nuevo; el anterior dejó de servir.',
  RECHAZADA_ADMIN_ACTIVO: 'No se hizo ningún cambio: ya existe un administrador activo.',
  RECHAZADA_OTRA_CUENTA_INICIAL: 'No se hizo ningún cambio: ya existe una cuenta de inicialización con otro correo o en otro estado.',
  RECHAZADA_EJECUCION_SIMULTANEA:
    'No se hizo ningún cambio: otra ejecución creó la cuenta de inicialización al mismo tiempo. Vuelve a ejecutar el comando con el mismo correo si necesitas otro enlace.',
  RECHAZADA_CORREO_EN_USO: 'No se hizo ningún cambio: el correo indicado ya pertenece a otra cuenta.',
  CORREO_NO_ENVIADO:
    'No se pudo enviar el correo de activación. Revisa la configuración del correo y vuelve a ejecutar el comando con el mismo correo para recibir un enlace nuevo.',
};
export const GENERIC_FAILURE = 'No se pudo completar la inicialización. Revisa la configuración y los registros del servidor.';

type Parsed = { readonly nombre: string; readonly correo: string } | { readonly error: string };

/**
 * Solo acepta `--nombre <valor>` y `--correo <valor>`, cada uno una vez. Cualquier otro argumento (por
 * ejemplo `--password`) se rechaza **sin repetir su valor**, que podría ser una contraseña.
 */
export function parseArgs(argv: readonly string[]): Parsed {
  const values: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if ((flag !== '--nombre' && flag !== '--correo') || value === undefined || flag in values) {
      return { error: 'Argumentos no válidos. Este comando no acepta contraseñas ni otras opciones.' };
    }
    values[flag] = value;
  }
  const nombre = values['--nombre'];
  const correo = values['--correo'];
  if (nombre === undefined || correo === undefined) return { error: 'Faltan --nombre o --correo.' };
  if (!/\S/.test(nombre) || nombre.length > MAX_NOMBRE) return { error: 'El nombre no es válido.' };
  if (correo.length > MAX_CORREO || !RAW_EMAIL_PATTERN.test(correo)) return { error: 'El correo no es válido.' };
  return { nombre, correo };
}

/**
 * Comando `bootstrap:admin` (plan §8, DEC-08, T-35). Códigos de salida: 0 creado o reemitido; 1 rechazo,
 * fallo de correo o error; 2 uso incorrecto. No lee la entrada estándar.
 */
export async function runBootstrapAdminCli(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  io: CliIo,
  openContext: () => Promise<BootstrapContext>,
): Promise<number> {
  if (Object.keys(env).some((name) => PASSWORD_ENV.test(name) && env[name] !== undefined)) {
    io.err('Este comando no acepta contraseñas por variables de entorno. Elimina la variable y vuelve a intentarlo.');
    return 2;
  }
  const parsed = parseArgs(argv);
  if ('error' in parsed) {
    io.err(parsed.error);
    io.err(USAGE);
    return 2;
  }

  let context: BootstrapContext | undefined;
  try {
    context = await openContext();
    const outcome = await context.service.run(parsed);
    const ok = outcome === 'CREADA' || outcome === 'REEMITIDA';
    if (ok) io.out(MESSAGES[outcome]);
    else io.err(MESSAGES[outcome]);
    return ok ? 0 : 1;
  } catch {
    io.err(GENERIC_FAILURE);
    return 1;
  } finally {
    await context?.close().catch(() => undefined);
  }
}
