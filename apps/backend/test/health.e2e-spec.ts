import { randomBytes } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Connection } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { ConfigValidationError, loadAuthConfig } from '../src/config/auth-config';
import { AUTH_CONFIG } from '../src/config/config.module';
import { isolatedMongoUri } from './support/auth-core';
import { testEnv } from './support/test-env';

describe('GET /api/v1/health (e2e)', () => {
  let app: NestExpressApplication;
  let connection: Connection;

  beforeAll(async () => {
    const config = loadAuthConfig(
      testEnv({ MONGODB_URI: isolatedMongoUri(`omr_test_e2e_health_${randomBytes(4).toString('hex')}`) }),
    );
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AUTH_CONFIG)
      .useValue(config)
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    connection = app.get<Connection>(getConnectionToken());
  });

  afterAll(async () => {
    await connection.db?.dropDatabase();
    await app.close();
    expect(app.getHttpServer().listening).toBe(false);
  });

  it('responde 200 con el estado de la API (CA-21)', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('solo expone las rutas bajo el prefijo global', async () => {
    await request(app.getHttpServer()).get('/health').expect(404);
  });

  it('HT-AUTH-01 T-38: arrancar la API no crea colecciones ni índices (autoIndex/autoCreate en false)', async () => {
    await expect(connection.db?.listCollections().toArray()).resolves.toEqual([]);
  });
});

describe('arranque con configuración inválida (HT-AUTH-01 T-11/T-14, RNF-04)', () => {
  it('sin JWT_ACCESS_SECRET la API no arranca y el error nombra la variable', async () => {
    const previous = process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_ACCESS_SECRET;
    try {
      const moduleRef = Test.createTestingModule({ imports: [AppModule] });
      await expect(moduleRef.compile()).rejects.toThrow(ConfigValidationError);
      await expect(Test.createTestingModule({ imports: [AppModule] }).compile()).rejects.toThrow(/JWT_ACCESS_SECRET/);
    } finally {
      if (previous !== undefined) process.env.JWT_ACCESS_SECRET = previous;
    }
  });
});
