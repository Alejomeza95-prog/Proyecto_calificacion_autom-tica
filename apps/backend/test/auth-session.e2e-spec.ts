import { randomBytes } from 'node:crypto';
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { REFRESH_COOKIE } from '../src/auth/refresh-cookie';
import { Role } from '../src/authz/role';
import { AuditoriaAuth } from '../src/audit/auditoria-auth.schema';
import { Sesion } from '../src/sessions/sesion.schema';
import { AccountStatus } from '../src/users/account-status';
import { bearer, bootHttpApp, ORIGIN, refreshCookieFrom, type HttpHarness } from './support/http-app';

/**
 * T-17 (CA-07, CA-09, CA-12, CA-15, RN-07, RN-11, RN-16, RNF-06) y parte HTTP de T-13 y T-41:
 * login, refresh y logout con cookie segura, rotación atómica, detección de reutilización, `Origin`
 * estricto y errores problem+json.
 */
describe('sesión: login, refresh y logout (T-17, e2e)', () => {
  let h: HttpHarness;
  let sesiones: Model<Sesion>;
  let auditoria: Model<AuditoriaAuth>;
  const inst = '64a000000000000000000001';

  beforeAll(async () => {
    h = await bootHttpApp('e2e_session');
    sesiones = h.app.get<Model<Sesion>>(getModelToken(Sesion.name));
    auditoria = h.app.get<Model<AuditoriaAuth>>(getModelToken(AuditoriaAuth.name));
  }, 60_000);

  beforeEach(async () => {
    await h.resetRedis();
  });

  afterAll(async () => {
    await h?.close();
  });

  const docente = () => h.createUser({ rol: Role.DOCENTE, institucionId: new Types.ObjectId(inst) });
  const post = (path: string) => h.http().post(`/api/v1/auth/${path}`);
  const refresh = (cookie?: string, origin: string | null = ORIGIN) => {
    let req = post('refresh');
    if (origin !== null) req = req.set('Origin', origin);
    return cookie ? req.set('Cookie', cookie) : req;
  };

  describe('login', () => {
    it('200: solo accessToken y expiresIn en el cuerpo; cookie HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth', async () => {
      const user = await docente();
      const res = await post('login').set('Origin', ORIGIN).send({ correo: user.correo, password: user.password }).expect(200);
      expect(Object.keys(res.body as object).sort()).toEqual(['accessToken', 'expiresIn']);
      expect((res.body as { expiresIn: number }).expiresIn).toBe(15 * 60);
      expect(res.headers['cache-control']).toBe('no-store');

      const { raw, cookie } = refreshCookieFrom(res.headers['set-cookie']);
      expect(raw).toMatch(/; HttpOnly/);
      expect(raw).toMatch(/; Secure/);
      expect(raw).toMatch(/; SameSite=Strict/);
      expect(raw).toMatch(/; Path=\/api\/v1\/auth(;|$)/);
      expect(raw).toMatch(/; Expires=/);
      // El token de renovación nunca va en el cuerpo (DEC-01).
      const token = cookie.slice(REFRESH_COOKIE.length + 1);
      expect(token).toHaveLength(43);
      expect(res.text).not.toContain(token);
      // Solo se guarda el SHA-256 (DEC-01).
      expect(await sesiones.countDocuments({ usuario_id: user.id })).toBe(1);
      expect(JSON.stringify(await sesiones.find().select('+refresh_hash +refresh_hashes_previos').lean())).not.toContain(token);
    });

    it('CA-07: correo inexistente, contraseña errónea y cuenta no ACTIVA → mismo 401 y mismo cuerpo', async () => {
      const activa = await docente();
      const bodies: unknown[] = [];
      const statuses: number[] = [];
      const attempts: { correo: string; password: string }[] = [
        { correo: `nadie.${randomBytes(3).toString('hex')}@example.test`, password: 'cualquier frase larga' },
        { correo: activa.correo, password: 'contraseña equivocada larga' },
      ];
      for (const estado of [
        AccountStatus.PENDIENTE_VERIFICACION,
        AccountStatus.PENDIENTE_APROBACION,
        AccountStatus.BLOQUEADA,
        AccountStatus.DESACTIVADA,
      ]) {
        const u = await h.createUser({ estado });
        attempts.push({ correo: u.correo, password: u.password });
      }
      for (const attempt of attempts) {
        const res = await post('login').set('Origin', ORIGIN).send(attempt);
        statuses.push(res.status);
        bodies.push(res.body);
        expect(res.headers['set-cookie']).toBeUndefined();
      }
      expect(new Set(statuses)).toEqual(new Set([401]));
      for (const body of bodies) expect(body).toEqual(bodies[0]);
      expect(bodies[0]).toEqual({ type: 'urn:omr-preicfes:problema:credenciales-invalidas', title: expect.any(String) as string, status: 401 });
      expect(await auditoria.countDocuments({ evento: 'LOGIN_FALLIDO' })).toBeGreaterThanOrEqual(6);
    });

    it('correo con espacios y mayúsculas se normaliza (RN-03)', async () => {
      const user = await docente();
      await post('login').set('Origin', ORIGIN).send({ correo: `  ${user.correo.toUpperCase()} `, password: user.password }).expect(200);
    });

    it('DEC-21: propiedad no declarada (rol) → 400 sin efectos ni valor en el error', async () => {
      const user = await docente();
      const res = await post('login')
        .set('Origin', ORIGIN)
        .send({ correo: user.correo, password: user.password, rol: 'ADMIN' })
        .expect(400);
      expect(res.body).toMatchObject({ type: 'urn:omr-preicfes:problema:solicitud-invalida', errores: [{ campo: 'rol' }] });
      expect(res.text).not.toContain('ADMIN');
      expect(res.text).not.toContain(user.password);
      expect(await sesiones.countDocuments({ usuario_id: user.id })).toBe(0);
      expect(await h.redisKeys('rl:*')).toEqual([]);
    });

    it('JSON mal formado → 400 problem+json', async () => {
      const res = await post('login').set('Origin', ORIGIN).set('Content-Type', 'application/json').send('{"correo":');
      expect(res.status).toBe(400);
      expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    });

    it('T-41 HTTP: en el umbral por cuenta → 401 desafio-requerido; con CAPTCHA válido y contraseña correcta → 200', async () => {
      const user = await docente();
      for (let i = 0; i < 5; i += 1) {
        await post('login').set('Origin', ORIGIN).send({ correo: user.correo, password: 'contraseña equivocada larga' }).expect(401);
      }
      const challenged = await post('login').set('Origin', ORIGIN).send({ correo: user.correo, password: user.password }).expect(401);
      expect(challenged.body).toMatchObject({ type: 'urn:omr-preicfes:problema:desafio-requerido', status: 401 });

      const ghost = await post('login')
        .set('Origin', ORIGIN)
        .send({ correo: `fantasma.${randomBytes(3).toString('hex')}@example.test`, password: 'x'.repeat(12) });
      expect(ghost.status).toBe(401);

      await post('login')
        .set('Origin', ORIGIN)
        .send({ correo: user.correo, password: user.password, captchaToken: 'captcha-de-prueba-valido' })
        .expect(200);
    });

    it('T-41 HTTP: proveedor de CAPTCHA con error → 503 verificacion-no-disponible con Retry-After', async () => {
      const user = await docente();
      for (let i = 0; i < 5; i += 1) {
        await post('login').set('Origin', ORIGIN).send({ correo: user.correo, password: 'contraseña equivocada larga' }).expect(401);
      }
      h.captcha.mode = 'error';
      try {
        const res = await post('login')
          .set('Origin', ORIGIN)
          .send({ correo: user.correo, password: user.password, captchaToken: 'captcha-de-prueba-valido' })
          .expect(503);
        expect(res.headers['retry-after']).toBe(String(h.config.authOverloadRetryAfterS));
        expect(res.body).toMatchObject({ type: 'urn:omr-preicfes:problema:verificacion-no-disponible' });
      } finally {
        h.captcha.mode = 'disponible';
      }
    });

    it('T-13 HTTP: el intento 61 desde una IP → 429 con Retry-After; X-Forwarded-For falso no cambia la IP (TRUST_PROXY_HOPS=0)', async () => {
      const max = h.config.rateLimits.LOGIN_IP_FAILURE.max;
      for (let i = 0; i < max; i += 1) {
        await post('login')
          .set('Origin', ORIGIN)
          .send({ correo: `n${i}.${randomBytes(3).toString('hex')}@example.test`, password: 'contraseña equivocada larga' })
          .expect(401);
      }
      const limited = await post('login')
        .set('Origin', ORIGIN)
        .set('X-Forwarded-For', '203.0.113.9')
        .send({ correo: `otro.${randomBytes(3).toString('hex')}@example.test`, password: 'contraseña equivocada larga' })
        .expect(429);
      const retryAfter = Number(limited.headers['retry-after']);
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(h.config.rateLimits.LOGIN_IP_FAILURE.windowMs / 1_000);
      expect(limited.body).toMatchObject({ type: 'urn:omr-preicfes:problema:demasiados-intentos', status: 429 });
    }, 60_000);
  });

  describe('refresh', () => {
    it('rota la cookie A → B → C; reutilizar A o B → 401 y la familia completa queda revocada (CA-15, RN-16)', async () => {
      const user = await docente();
      const a = await h.login(user);
      const resB = await refresh(a.cookie).expect(200);
      expect(Object.keys(resB.body as object).sort()).toEqual(['accessToken', 'expiresIn']);
      const b = refreshCookieFrom(resB.headers['set-cookie']);
      // El token de renovación nunca va en el cuerpo (DEC-01, RNF-06).
      expect(resB.text).not.toContain(b.cookie.slice(REFRESH_COOKIE.length + 1));
      for (const attr of [/; HttpOnly/, /; Secure/, /; SameSite=Strict/, /; Path=\/api\/v1\/auth(;|$)/]) expect(b.raw).toMatch(attr);
      const c = refreshCookieFrom((await refresh(b.cookie).expect(200)).headers['set-cookie']);
      expect(new Set([a.cookie, b.cookie, c.cookie]).size).toBe(3);

      // Otra sesión de la misma cuenta no se ve afectada.
      const other = await h.login(user);

      await refresh(a.cookie).expect(401);
      await refresh(c.cookie).expect(401);
      expect(await sesiones.findOne({ usuario_id: user.id, motivo_revocacion: 'REUTILIZACION' }).lean()).not.toBeNull();
      expect(await auditoria.countDocuments({ evento: 'REUTILIZACION_DETECTADA', usuario_id: user.id })).toBe(1);
      await refresh(other.cookie).expect(200);
    });

    it('sin cookie, cookie inventada o JWT en lugar de cookie → 401 sin JWT', async () => {
      const r1 = await refresh().expect(401);
      expect(r1.body).toMatchObject({ type: 'urn:omr-preicfes:problema:no-autenticado' });
      await refresh(`${REFRESH_COOKIE}=${'Z'.repeat(43)}`).expect(401);
      const user = await docente();
      const { accessToken } = await h.login(user);
      await refresh().set('Authorization', bearer(accessToken)).expect(401);
    });

    it('10 renovaciones simultáneas con la misma cookie → como máximo 1 éxito y un solo refresh_hash', async () => {
      const user = await docente();
      const { cookie } = await h.login(user);
      const results = await Promise.all(Array.from({ length: 10 }, () => refresh(cookie)));
      const ok = results.filter((r) => r.status === 200);
      expect(ok.length).toBeLessThanOrEqual(1);
      for (const r of results) expect([200, 401]).toContain(r.status);
      const sessions = await sesiones.find({ usuario_id: user.id }).select('+refresh_hash +refresh_hashes_previos').lean();
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.refresh_hashes_previos.length ?? 0).toBeLessThanOrEqual(1);
      // Nunca dos cookies válidas para la sesión: como máximo una cookie nueva, y la original ya no renueva.
      const newCookies = ok.map((r) => refreshCookieFrom(r.headers['set-cookie']).cookie);
      expect(newCookies.length).toBeLessThanOrEqual(1);
      if (newCookies[0]) {
        await refresh(cookie).expect(401); // reutilización → revoca la familia
        await refresh(newCookies[0]).expect(401);
      }
    });

    it('JWT a los 15 min + 1 s → 401; la sesión vence a los 7 días aunque se haya renovado (CA-15)', async () => {
      const user = await docente();
      const { accessToken, cookie } = await h.login(user);
      h.clock.advance(h.config.ttl.jwtAccessMs + 1_000);
      await h.http().get('/api/v1/auth/me').set('Authorization', bearer(accessToken)).expect(401);

      let current = cookie;
      for (let day = 0; day < 6; day += 1) {
        h.clock.advance(24 * 60 * 60 * 1_000);
        current = refreshCookieFrom((await refresh(current).expect(200)).headers['set-cookie']).cookie;
      }
      h.clock.advance(h.config.ttl.sessionRefreshMs);
      await refresh(current).expect(401);
    });

    it('cambio de version_credenciales (reset con revocación masiva fallida) → JWT y /refresh previos → 401 (RN-16, DEC-10)', async () => {
      const user = await docente();
      const { accessToken, cookie } = await h.login(user);
      await h.usuarios.collection.updateOne({ _id: user.id }, { $inc: { version_credenciales: 1 } });
      await h.http().get('/api/v1/auth/me').set('Authorization', bearer(accessToken)).expect(401);
      const res = await refresh(cookie).expect(401);
      expect(res.body).not.toHaveProperty('accessToken');
    });

    it('cuenta que deja de estar ACTIVA → /refresh → 401 y sesión revocada', async () => {
      const user = await docente();
      const { cookie } = await h.login(user);
      await h.usuarios.collection.updateOne({ _id: user.id }, { $set: { estado: AccountStatus.DESACTIVADA } });
      await refresh(cookie).expect(401);
      expect(await sesiones.findOne({ usuario_id: user.id }).lean()).toMatchObject({ motivo_revocacion: 'CUENTA_NO_ACTIVA' });
    });
  });

  describe('logout', () => {
    it('204; la cookie llega a /logout y se borra con el mismo Path; después JWT y refresh → 401 (CA-12)', async () => {
      const user = await docente();
      const { accessToken, cookie } = await h.login(user);
      const res = await post('logout').set('Origin', ORIGIN).set('Authorization', bearer(accessToken)).set('Cookie', cookie).expect(204);
      const cleared = refreshCookieFrom(res.headers['set-cookie']).raw;
      expect(cleared).toMatch(/; Path=\/api\/v1\/auth(;|$)/);
      expect(cleared).toMatch(/; HttpOnly/);
      expect(cleared).toMatch(/; Secure/);
      expect(cleared).toMatch(/; SameSite=Strict/);
      expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);

      await h.http().get('/api/v1/auth/me').set('Authorization', bearer(accessToken)).expect(401);
      await refresh(cookie).expect(401);
      expect(await sesiones.findOne({ usuario_id: user.id }).lean()).toMatchObject({ motivo_revocacion: 'LOGOUT' });
      expect(await auditoria.countDocuments({ evento: 'LOGOUT', usuario_id: user.id })).toBe(1);
    });

    it('sin JWT → 401', async () => {
      await post('logout').set('Origin', ORIGIN).expect(401);
    });

    it('ningún documento de auditoría contiene contraseñas, tokens, hashes ni correos (RN-12)', async () => {
      const docs = JSON.stringify(await auditoria.find().lean());
      expect(docs).not.toMatch(/@example\.test|password|token|refresh_hash|frase de prueba/i);
    });
  });

  describe('Origin estricto en /login, /refresh y /logout (DEC-20, RNF-06)', () => {
    const badOrigins: (string | null)[] = [null, 'null', 'https://evil.example.test', 'http://localhost:5174', 'http://localhost:5173.evil.test'];

    it('login con Origin inválido o ausente → 403 sin consumir contadores ni crear sesión', async () => {
      const user = await docente();
      for (const origin of badOrigins) {
        let req = post('login');
        if (origin !== null) req = req.set('Origin', origin);
        const res = await req.set('Host', 'localhost:5173').set('X-Forwarded-Host', 'localhost:5173').send({ correo: user.correo, password: user.password });
        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ type: 'urn:omr-preicfes:problema:origen-no-permitido', status: 403 });
        expect(res.headers['set-cookie']).toBeUndefined();
      }
      expect(await sesiones.countDocuments({ usuario_id: user.id })).toBe(0);
      expect(await h.redisKeys('rl:*')).toEqual([]);
    });

    it('refresh y logout con Origin ajeno → 403 sin rotar la cookie ni revocar la sesión', async () => {
      const user = await docente();
      const { accessToken, cookie } = await h.login(user);
      for (const origin of badOrigins) {
        const r = await refresh(cookie, origin);
        expect(r.status).toBe(403);
        expect(r.headers['set-cookie']).toBeUndefined();
        let l = post('logout').set('Authorization', bearer(accessToken)).set('Cookie', cookie);
        if (origin !== null) l = l.set('Origin', origin);
        expect((await l).status).toBe(403);
      }
      // La cookie original sigue siendo la vigente y la sesión no se revocó.
      await h.http().get('/api/v1/auth/me').set('Authorization', bearer(accessToken)).expect(200);
      await refresh(cookie).expect(200);
    });
  });

  describe('Redis del limitador sin respuesta (DEC-06)', () => {
    it('login → 503 limitador-no-disponible con Retry-After; /me sigue respondiendo', async () => {
      const user = await docente();
      const { accessToken } = await h.login(user);
      h.redis.disconnect();
      try {
        const res = await post('login').set('Origin', ORIGIN).send({ correo: user.correo, password: user.password }).expect(503);
        expect(res.body).toMatchObject({ type: 'urn:omr-preicfes:problema:limitador-no-disponible' });
        expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
        await h.http().get('/api/v1/auth/me').set('Authorization', bearer(accessToken)).expect(200);
        expect(await auditoria.countDocuments({ evento: 'LIMITADOR_NO_DISPONIBLE' })).toBeGreaterThanOrEqual(1);
      } finally {
        await h.redis.connect();
      }
    });
  });
});
