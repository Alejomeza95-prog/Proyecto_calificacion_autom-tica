import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import type { ModuleMetadata } from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Redis } from 'ioredis';
import type { Connection, Model, Types } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { REDIS_CLIENT } from '../../src/auth/auth-core.module';
import { PasswordHasher } from '../../src/auth/password/password-hasher';
import { REFRESH_COOKIE } from '../../src/auth/refresh-cookie';
import type { Role } from '../../src/authz/role';
import { CAPTCHA_VERIFIER, TestCaptchaVerifier } from '../../src/captcha/captcha-verifier';
import { CLOCK } from '../../src/common/clock';
import { loadAuthConfig, type AuthConfig } from '../../src/config/auth-config';
import { AUTH_CONFIG } from '../../src/config/config.module';
import { MigrationRunner } from '../../src/database/migration-runner';
import { InMemoryMailSender, MAIL_SENDER } from '../../src/mail/mail-sender';
import { AccountStatus } from '../../src/users/account-status';
import { AccountOrigin, Usuario } from '../../src/users/usuario.schema';
import { FakeClock, isolatedMongoUri } from './auth-core';
import { authMigrations, requireEnv } from './mongo';
import { testEnv } from './test-env';

/** Origen permitido en la configuración de prueba (`AUTH_ALLOWED_ORIGINS`). */
export const ORIGIN = 'http://localhost:5173';
export const TEST_PASSWORD = 'frase de prueba suficientemente larga';

export interface TestUser {
  readonly id: Types.ObjectId;
  readonly correo: string;
  readonly password: string;
}

export interface LoggedIn {
  readonly accessToken: string;
  /** Cabecera `Cookie` lista para enviar (`omr_refresh=<token>`). */
  readonly cookie: string;
  readonly setCookie: string;
}

export interface HttpHarness {
  readonly app: NestExpressApplication;
  readonly config: AuthConfig;
  readonly clock: FakeClock;
  readonly mail: InMemoryMailSender;
  /** Espera a que el `MailDispatcher` (envío tras responder) haya entregado al menos `count` correos. */
  waitForMail(count: number): Promise<void>;
  readonly captcha: TestCaptchaVerifier;
  readonly redis: Redis;
  readonly connection: Connection;
  readonly usuarios: Model<Usuario>;
  http(): ReturnType<typeof request>;
  createUser(options?: {
    rol?: Role | null;
    institucionId?: Types.ObjectId | null;
    estado?: AccountStatus;
    password?: string;
    correo?: string;
  }): Promise<TestUser>;
  login(user: Pick<TestUser, 'correo' | 'password'>): Promise<LoggedIn>;
  redisKeys(pattern?: string): Promise<string[]>;
  resetRedis(): Promise<void>;
  close(): Promise<void>;
}

/** Valor de la cookie de renovación a partir de la cabecera `Set-Cookie`. */
export function refreshCookieFrom(setCookie: string | string[] | undefined): { cookie: string; raw: string } {
  const all = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const raw = all.find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
  if (!raw) throw new Error('la respuesta no trae la cookie de renovación');
  return { cookie: raw.split(';')[0] ?? '', raw };
}

/**
 * API completa (`AppModule` + `configureApp`) sobre una base aislada y un prefijo de Redis propio, con
 * reloj falso, correo en memoria y CAPTCHA de prueba (DEC-13). Aplica la migración de índices.
 */
export async function bootHttpApp(
  suite: string,
  options: {
    env?: Record<string, string | undefined>;
    imports?: ModuleMetadata['imports'];
    /** Sustituye proveedores por valores de prueba (p. ej. un `InvitationResolver` sembrado). */
    overrides?: readonly { provide: unknown; useValue: unknown }[];
  } = {},
): Promise<HttpHarness> {
  const id = randomBytes(4).toString('hex');
  const dbName = `omr_test_${suite}_${id}`;
  const redisPrefix = `test:${suite}:${id}:`;
  const config = loadAuthConfig(testEnv({ MONGODB_URI: isolatedMongoUri(dbName), ...options.env }));
  const clock = new FakeClock();
  const mail = new InMemoryMailSender();
  const captcha = new TestCaptchaVerifier(5_000);
  requireEnv('REDIS_URL');

  let builder = Test.createTestingModule({ imports: [AppModule, ...(options.imports ?? [])] })
    .overrideProvider(AUTH_CONFIG)
    .useValue(config)
    .overrideProvider(CLOCK)
    .useValue(clock)
    .overrideProvider(MAIL_SENDER)
    .useValue(mail)
    .overrideProvider(CAPTCHA_VERIFIER)
    .useValue(captcha)
    .overrideProvider(REDIS_CLIENT)
    .useFactory({
      factory: () =>
        new Redis(config.redisUrl, {
          keyPrefix: redisPrefix,
          enableOfflineQueue: false,
          maxRetriesPerRequest: 0,
          commandTimeout: config.rateLimitRedisTimeoutMs,
        }),
    });
  for (const o of options.overrides ?? []) builder = builder.overrideProvider(o.provide).useValue(o.useValue);
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app);
  // Un único servidor escuchando durante toda la suite: supertest lo reutiliza en lugar de abrir y
  // cerrar un puerto efímero por cada lote de solicitudes (cada solicitud pendiente de ese arranque
  // agregaba listeners `listening`/`error` al Server: MaxListenersExceededWarning con 10 concurrentes).
  await app.listen(0, '127.0.0.1');

  const connection = app.get<Connection>(getConnectionToken());
  const db = connection.db;
  if (!db) throw new Error('Conexión sin base de datos');
  await new MigrationRunner({ db, nodeEnv: 'test', env: {} }, authMigrations().filter((m) => m.id === '001-auth-indices')).up();

  const redis = app.get<Redis>(REDIS_CLIENT);
  const usuarios = app.get<Model<Usuario>>(getModelToken(Usuario.name));
  const hasher = app.get(PasswordHasher);
  const server: Server = app.getHttpServer();
  const http = () => request(server);

  const redisKeys = async (pattern = '*'): Promise<string[]> => {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [next, batch] = await redis.scan(cursor, 'MATCH', `${redisPrefix}${pattern}`, 'COUNT', 500);
      cursor = next;
      keys.push(...batch.map((k) => k.slice(redisPrefix.length)));
    } while (cursor !== '0');
    return keys;
  };
  const resetRedis = async (): Promise<void> => {
    const keys = await redisKeys();
    if (keys.length > 0) await redis.del(...keys);
  };

  return {
    app,
    config,
    clock,
    mail,
    async waitForMail(count) {
      for (let i = 0; i < 200 && mail.sent.length < count; i += 1) await new Promise((r) => setTimeout(r, 10));
      if (mail.sent.length < count) throw new Error(`se esperaban ${count} correos y llegaron ${mail.sent.length}`);
    },
    captcha,
    redis,
    connection,
    usuarios,
    http,
    async createUser(o = {}) {
      const password = o.password ?? TEST_PASSWORD;
      const correo = o.correo ?? `persona.${randomBytes(4).toString('hex')}@example.test`;
      const estado = o.estado ?? AccountStatus.ACTIVA;
      // Inserción directa (sin validadores) para poder sembrar también documentos incoherentes.
      const inserted = await usuarios.collection.insertOne({
        schemaVersion: 1,
        nombre: 'Persona de prueba',
        correo_normalizado: correo,
        password_hash: await hasher.hash(password),
        estado,
        rol: o.rol === undefined ? null : o.rol,
        institucion_id: o.institucionId ?? null,
        origen: AccountOrigin.AUTORREGISTRO,
        correo_verificado_en: null,
        ultimo_acceso_en: null,
        credenciales_actualizadas_en: clock.now(),
        version_credenciales: 0,
        creado_en: clock.now(),
        actualizado_en: clock.now(),
      });
      return { id: inserted.insertedId, correo, password };
    },
    async login(user) {
      const res = await http()
        .post('/api/v1/auth/login')
        .set('Origin', ORIGIN)
        .send({ correo: user.correo, password: user.password })
        .expect(200);
      const body = res.body as { accessToken: string };
      const { cookie, raw } = refreshCookieFrom(res.headers['set-cookie']);
      return { accessToken: body.accessToken, cookie, setCookie: raw };
    },
    redisKeys,
    resetRedis,
    async close() {
      if (redis.status === 'ready') await resetRedis();
      await db.dropDatabase();
      await app.close();
      if (server.listening) throw new Error('el servidor HTTP de prueba sigue escuchando tras app.close()');
    },
  };
}

export function bearer(token: string): string {
  return `Bearer ${token}`;
}
