import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { mongo } from 'mongoose';
import { isLocalEnvironment, LOCAL_ENVIRONMENTS } from '../config/environments';
import { MIGRACIONES_COLLECTION } from './migracion.schema';

/**
 * Runner de migraciones propio (plan §7, DEC-12, T-38).
 * - Aplica en orden los scripts pendientes y registra `{ _id, checksum, aplicada_en, duracion_ms }`.
 * - Si el checksum de un script ya aplicado cambió (o el script desapareció), aborta sin tocar nada.
 * - `down` revierte solo el último aplicado, o hasta `--to` (exclusivo).
 * - Nunca usa `syncIndexes()`: los índices solo los crean los scripts.
 * - DEC-28: los scripts `nonProductionOnly` (semillas) solo se aplican con `NODE_ENV` en la lista de
 *   entornos locales (`development`, `test`); con cualquier otro valor se omiten. Sin `NODE_ENV`, el
 *   runner no se construye. Si una semilla ya consta aplicada fuera de esa lista, se advierte sin
 *   modificar ni borrar datos.
 */

/** Contexto que recibe cada script. Los scripts declaran una interfaz estructuralmente igual. */
export interface MigrationContext {
  readonly db: mongo.Db;
  readonly nodeEnv: string;
  readonly env: Readonly<Record<string, string | undefined>>;
}

export interface MigrationModule {
  readonly up: (ctx: MigrationContext) => Promise<void>;
  readonly down: (ctx: MigrationContext) => Promise<void>;
  /** Scripts solo de desarrollo y pruebas (seed): el runner los omite fuera de `development`/`test` (DEC-28). */
  readonly nonProductionOnly?: boolean;
}

export interface MigrationDefinition extends MigrationModule {
  readonly id: string;
  readonly checksum: string;
}

interface MigrationRecord {
  _id: string;
  checksum: string;
  aplicada_en: Date;
  duracion_ms: number;
}

export class MigrationIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationIntegrityError';
  }
}

export class MigrationEnvironmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationEnvironmentError';
  }
}

export interface MigrationStatus {
  readonly id: string;
  readonly applied: boolean;
  readonly skipped: boolean;
}

/**
 * `NODE_ENV` para las migraciones (DEC-28): obligatorio y sin valor por defecto. Ausente, vacío o solo
 * espacios → `MigrationEnvironmentError`, antes de conectar a MongoDB.
 */
export function resolveMigrationNodeEnv(env: Readonly<Record<string, string | undefined>>): string {
  const nodeEnv = env.NODE_ENV?.trim();
  if (!nodeEnv) {
    throw new MigrationEnvironmentError(
      `NODE_ENV no está definida: las migraciones exigen un entorno explícito (las semillas solo se aplican con ${LOCAL_ENVIRONMENTS.join(' o ')})`,
    );
  }
  return nodeEnv;
}

const MIGRATION_FILE = /^(\d{3}-[a-z0-9-]+)\.(ts|js)$/;

function isMigrationModule(value: unknown): value is MigrationModule {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.up === 'function' && typeof candidate.down === 'function';
}

/**
 * Carga los scripts `NNN-descripcion.(ts|js)` de un directorio, en orden, con el SHA-256 del archivo
 * (el compilado en `dist/migrations`; el fuente cuando se ejecuta en las pruebas).
 */
export function loadMigrations(dir: string): MigrationDefinition[] {
  const files = readdirSync(dir)
    .filter((f) => MIGRATION_FILE.test(f) && !f.endsWith('.d.ts'))
    .sort();
  return files.map((file) => {
    const path = join(dir, file);
    const id = MIGRATION_FILE.exec(file)?.[1] ?? file;
    const checksum = createHash('sha256').update(readFileSync(path)).digest('hex');
    // Carga dinámica: los scripts viven fuera de `src` (plan §2.1) y se descubren en tiempo de ejecución.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded: unknown = require(path);
    if (!isMigrationModule(loaded)) {
      throw new MigrationIntegrityError(`La migración ${id} no exporta up() y down()`);
    }
    return { id, checksum, up: loaded.up, down: loaded.down, nonProductionOnly: loaded.nonProductionOnly === true };
  });
}

export class MigrationRunner {
  private readonly records: mongo.Collection<MigrationRecord>;

  constructor(
    private readonly ctx: MigrationContext,
    private readonly migrations: readonly MigrationDefinition[],
    private readonly log: (message: string) => void = () => undefined,
    private readonly warn: (message: string) => void = log,
  ) {
    if (!ctx.nodeEnv.trim()) {
      throw new MigrationEnvironmentError('NODE_ENV no está definida: el runner de migraciones no se ejecuta sin un entorno explícito');
    }
    const ids = new Set<string>();
    for (const m of migrations) {
      if (ids.has(m.id)) throw new MigrationIntegrityError(`Migración duplicada: ${m.id}`);
      ids.add(m.id);
    }
    this.records = ctx.db.collection<MigrationRecord>(MIGRACIONES_COLLECTION);
  }

  /** Lista de entornos permitidos (DEC-28): cualquier valor fuera de `development`/`test` omite las semillas. */
  private get allowsDevOnly(): boolean {
    return isLocalEnvironment(this.ctx.nodeEnv);
  }

  private isSkipped(m: MigrationDefinition): boolean {
    return m.nonProductionOnly === true && !this.allowsDevOnly;
  }

  /**
   * Una semilla aplicada en un entorno no permitido (p. ej. antes de DEC-28) solo se advierte: no se
   * revierte ni se borra ningún dato (decisión del responsable, 2026-11-09).
   */
  private warnDevOnlyAppliedOutsideAllowed(applied: ReadonlyMap<string, MigrationRecord>): void {
    if (this.allowsDevOnly) return;
    for (const m of this.migrations) {
      if (m.nonProductionOnly === true && applied.has(m.id)) {
        this.warn(
          `ADVERTENCIA: la migración de solo desarrollo ${m.id} consta aplicada con NODE_ENV=${this.ctx.nodeEnv}, ` +
            `fuera de ${LOCAL_ENVIRONMENTS.join('/')}. No se modificó ningún dato: revise si esta base contiene ` +
            'cuentas sembradas (marcador seed: true) y retírelas con un procedimiento autorizado.',
        );
      }
    }
  }

  /** Verifica que todo lo aplicado siga existiendo con el mismo checksum. No modifica nada. */
  private async verifyIntegrity(): Promise<Map<string, MigrationRecord>> {
    const applied = await this.records.find({}).toArray();
    const byId = new Map(this.migrations.map((m) => [m.id, m]));
    for (const record of applied) {
      const def = byId.get(record._id);
      if (!def) {
        throw new MigrationIntegrityError(`La migración aplicada ${record._id} ya no existe; se aborta sin cambios`);
      }
      if (def.checksum !== record.checksum) {
        throw new MigrationIntegrityError(`El checksum de ${record._id} cambió después de aplicarse; se aborta sin cambios`);
      }
    }
    return new Map(applied.map((r) => [r._id, r]));
  }

  async status(): Promise<MigrationStatus[]> {
    const applied = await this.verifyIntegrity();
    this.warnDevOnlyAppliedOutsideAllowed(applied);
    return this.migrations.map((m) => ({ id: m.id, applied: applied.has(m.id), skipped: this.isSkipped(m) }));
  }

  /** Aplica en orden los pendientes. Devuelve los ids aplicados en esta ejecución. */
  async up(): Promise<string[]> {
    const applied = await this.verifyIntegrity();
    this.warnDevOnlyAppliedOutsideAllowed(applied);
    const done: string[] = [];
    for (const m of this.migrations) {
      if (applied.has(m.id)) continue;
      if (this.isSkipped(m)) {
        this.log(`omitida ${m.id} (solo desarrollo y pruebas)`);
        continue;
      }
      const started = Date.now();
      await m.up(this.ctx);
      const duracion = Date.now() - started;
      await this.records.insertOne({ _id: m.id, checksum: m.checksum, aplicada_en: new Date(), duracion_ms: duracion });
      this.log(`aplicada ${m.id} (${duracion} ms)`);
      done.push(m.id);
    }
    return done;
  }

  /**
   * Revierte el último aplicado; con `to`, revierte todos los posteriores a `to` (que se conserva).
   * Devuelve los ids revertidos.
   */
  async down(to?: string): Promise<string[]> {
    const applied = await this.verifyIntegrity();
    if (to !== undefined && !this.migrations.some((m) => m.id === to)) {
      throw new MigrationIntegrityError(`--to desconocido: ${to}`);
    }
    const appliedInOrder = this.migrations.filter((m) => applied.has(m.id));
    const targets: MigrationDefinition[] = [];
    for (const m of [...appliedInOrder].reverse()) {
      if (to !== undefined && m.id <= to) break;
      targets.push(m);
      if (to === undefined) break;
    }
    for (const m of targets) {
      await m.down(this.ctx);
      await this.records.deleteOne({ _id: m.id });
      this.log(`revertida ${m.id}`);
    }
    return targets.map((m) => m.id);
  }
}
