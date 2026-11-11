import mongoose from 'mongoose';
import { crearInstitucion, parseCrearInstitucionArgs } from '../instituciones/crear-institucion';

/**
 * `pnpm instituciones:crear --nombre "<nombre>"` (HT-AUTH-03 plan §3.2, DEC-03). Requiere `pnpm build` y
 * la migración 003 aplicada. Solo usa MONGODB_URI; nunca la imprime. Idempotente por nombre.
 */
async function main(argv: readonly string[]): Promise<number> {
  const parsed = parseCrearInstitucionArgs(argv);
  if ('error' in parsed) {
    process.stderr.write(`${parsed.error}\n`);
    return 2;
  }
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    process.stderr.write('MONGODB_URI no está definida\n');
    return 2;
  }
  const connection = await mongoose
    .createConnection(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10_000 })
    .asPromise();
  try {
    const db = connection.db;
    if (!db) throw new Error('Conexión a MongoDB sin base de datos');
    const { creada, id } = await crearInstitucion(db, parsed.nombre);
    process.stdout.write(`${creada ? 'Institución creada' : 'La institución ya existía'}: ${id}\n`);
    return 0;
  } finally {
    await connection.close();
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(`Error: ${error instanceof Error ? error.message : 'desconocido'}\n`);
    process.exit(1);
  },
);
