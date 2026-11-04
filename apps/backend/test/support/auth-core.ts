import { randomBytes } from 'node:crypto';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Redis } from 'ioredis';
import type { Connection } from 'mongoose';
import { AuthCoreModule, REDIS_CLIENT } from '../../src/auth/auth-core.module';
import { CAPTCHA_VERIFIER, TestCaptchaVerifier } from '../../src/captcha/captcha-verifier';
import { CLOCK, type Clock } from '../../src/common/clock';
import { loadAuthConfig, type AuthConfig } from '../../src/config/auth-config';
import { AppConfigModule, AUTH_CONFIG } from '../../src/config/config.module';
import { DatabaseModule } from '../../src/database/database.module';
import { MigrationRunner } from '../../src/database/migration-runner';
import { InMemoryMailSender, MAIL_SENDER } from '../../src/mail/mail-sender';
import { authMigrations, requireEnv } from './mongo';
import { testEnv } from './test-env';

/** Reloj controlado para probar vencimientos sin esperar tiempo real (T-40). */
export class FakeClock implements Clock {
  private t: number;
  constructor(start = Date.now()) {
    this.t = start;
  }
  now(): Date {
    return new Date(this.t);
  }
  advance(ms: number): void {
    this.t += ms;
  }
}

export interface AuthCoreHarness {
  readonly moduleRef: TestingModule;
  readonly config: AuthConfig;
  readonly clock: FakeClock;
  readonly mail: InMemoryMailSender;
  readonly captcha: TestCaptchaVerifier;
  readonly redis: Redis;
  readonly redisPrefix: string;
  readonly connection: Connection;
  /** Claves de Redis de esta suite, sin el prefijo. */
  redisKeys(pattern?: string): Promise<string[]>;
  close(): Promise<void>;
}

export function isolatedMongoUri(dbName: string): string {
  const url = new URL(requireEnv('MONGODB_URI'));
  url.pathname = `/${dbName}`;
  return url.toString();
}

/**
 * Arranca `AppConfigModule` + `DatabaseModule` + `AuthCoreModule` sobre una base aislada y un prefijo de
 * Redis propio (DEC-13). Por defecto aplica la migración `001-auth-indices` (plan §7).
 */
export async function bootAuthCore(
  suite: string,
  options: {
    env?: Record<string, string | undefined>;
    migrate?: boolean;
    captchaSlowMs?: number;
    /** Prefijo de Redis compartido: simula varias instancias sobre el mismo Redis. */
    redisPrefix?: string;
  } = {},
): Promise<AuthCoreHarness> {
  const id = randomBytes(4).toString('hex');
  const dbName = `omr_test_${suite}_${id}`;
  const redisPrefix = options.redisPrefix ?? `test:${suite}:${id}:`;
  const config = loadAuthConfig(testEnv({ MONGODB_URI: isolatedMongoUri(dbName), ...options.env }));
  const clock = new FakeClock();
  const mail = new InMemoryMailSender();
  const captcha = new TestCaptchaVerifier(options.captchaSlowMs ?? 5_000);
  requireEnv('REDIS_URL');

  const moduleRef = await Test.createTestingModule({ imports: [AppConfigModule, DatabaseModule, AuthCoreModule] })
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
    })
    .compile();
  await moduleRef.init();

  const connection = moduleRef.get<Connection>(getConnectionToken());
  const redis = moduleRef.get<Redis>(REDIS_CLIENT);
  const db = connection.db;
  if (!db) throw new Error('Conexión sin base de datos');
  if (options.migrate !== false) {
    const migrations = authMigrations().filter((m) => m.id === '001-auth-indices');
    await new MigrationRunner({ db, nodeEnv: 'test', env: {} }, migrations).up();
  }

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

  return {
    moduleRef,
    config,
    clock,
    mail,
    captcha,
    redis,
    redisPrefix,
    connection,
    redisKeys,
    async close() {
      const keys = await redisKeys();
      if (keys.length > 0) await redis.del(...keys);
      await db.dropDatabase();
      await moduleRef.close();
    },
  };
}
