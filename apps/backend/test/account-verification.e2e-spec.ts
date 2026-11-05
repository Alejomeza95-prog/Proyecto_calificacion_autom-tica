import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { Types } from 'mongoose';
import { AuthController, RESEND_MESSAGE } from '../src/auth/auth.controller';
import { Role } from '../src/authz/role';
import { SecurityTokensService, sha256Hex } from '../src/security-tokens/security-tokens.service';
import { TokenPurpose } from '../src/security-tokens/token-purpose';
import { AccountStatus } from '../src/users/account-status';
import { AccountOrigin } from '../src/users/usuario.schema';
import { bootHttpApp, ORIGIN, TEST_PASSWORD, type HttpHarness } from './support/http-app';

const LINK = /http:\/\/localhost:5173\/verificar-correo#token=([A-Za-z0-9_-]+)/;
const INVALID_LINK = {
  type: 'urn:omr-preicfes:problema:enlace-invalido',
  title: 'El enlace no es válido o ya venció. Solicita uno nuevo',
  status: 400,
};

/**
 * T-16: `POST /auth/verify-email` y `POST /auth/resend-verification` (CA-04, CA-05, CA-06, CA-10,
 * RN-06; plan §5, §8, §9.2; DEC-18 y DEC-09).
 */
describe('verificación de correo y reenvío (T-16, e2e)', () => {
  let h: HttpHarness;
  const post = (path: string, body: Record<string, unknown>) =>
    h.http().post(`/api/v1/auth/${path}`).set('Origin', ORIGIN).send(body);
  const verify = (token: string) => post('verify-email', { token });
  const resend = (correo: string) => post('resend-verification', { correo });

  /** Registra la cuenta y devuelve el token capturado del correo (adaptador en memoria). */
  const registerAndCapture = async (correo: string): Promise<string> => {
    const before = h.mail.sent.length;
    await post('register', { nombre: 'Ana Pérez', correo, password: TEST_PASSWORD }).expect(202);
    await h.waitForMail(before + 1);
    return lastToken(correo);
  };
  const lastToken = (correo: string): string => {
    const mail = [...h.mail.sent].reverse().find((m) => m.to === correo);
    const match = LINK.exec(mail?.text ?? '');
    if (!match?.[1]) throw new Error('el correo no trae el enlace de verificación');
    return match[1];
  };
  const quiet = () => new Promise((r) => setTimeout(r, 50));

  beforeAll(async () => {
    h = await bootHttpApp('e2e_verify');
  }, 60_000);

  afterAll(async () => {
    await h?.close();
  });

  beforeEach(async () => {
    await h.resetRedis();
    h.mail.clear();
  });

  it('CA-05: verificar el autorregistro → 200 PENDIENTE_APROBACION, sin rol ni institución', async () => {
    const token = await registerAndCapture('verifica@example.test');
    const res = await verify(token).expect(200);
    expect(res.body).toEqual({ estado: AccountStatus.PENDIENTE_APROBACION });
    expect(res.headers['cache-control']).toBe('no-store');
    const doc = await h.usuarios.findOne({ correo_normalizado: 'verifica@example.test' }).lean();
    expect(doc).toMatchObject({ estado: AccountStatus.PENDIENTE_APROBACION, rol: null, institucion_id: null });
    expect(doc?.correo_verificado_en).toBeInstanceOf(Date);
  });

  it('CA-05: una cuenta de invitación institucional coherente → ACTIVA', async () => {
    const institucion = new Types.ObjectId();
    const user = await h.createUser({ estado: AccountStatus.PENDIENTE_VERIFICACION, rol: Role.DOCENTE, institucionId: institucion });
    await h.usuarios.collection.updateOne({ _id: user.id }, { $set: { origen: AccountOrigin.INVITACION } });
    const { token } = await h.app.get(SecurityTokensService).issue(user.id, TokenPurpose.VERIFICAR_CORREO);
    const res = await verify(token).expect(200);
    expect(res.body).toEqual({ estado: AccountStatus.ACTIVA });
  });

  it('CA-04/DEC-18: el enlace lleva el token solo en el fragmento y ninguna ruta GET lo consume', async () => {
    const token = await registerAndCapture('fragmento@example.test');
    const text = h.mail.sent[0]?.text ?? '';
    expect(text).not.toMatch(/[?&]token=/);
    expect(token).toHaveLength(43);

    // Inspección de rutas: la única ruta GET del controlador es `me`.
    const proto = AuthController.prototype as unknown as Record<string, unknown>;
    const getPaths = Object.getOwnPropertyNames(proto)
      .map((name) => proto[name])
      .filter((fn): fn is object => typeof fn === 'function' && fn !== AuthController)
      .filter((fn) => Reflect.getMetadata(METHOD_METADATA, fn) === RequestMethod.GET)
      .map((fn) => String(Reflect.getMetadata(PATH_METADATA, fn)));
    expect(getPaths).toEqual(['me']);

    // Abrir con GET (con el token en la query o en la ruta) no consume nada.
    await h.http().get(`/api/v1/auth/verify-email?token=${token}`).expect(404);
    await h.http().get(`/api/v1/auth/verify-email/${token}`).expect(404);
    const stored = await h.connection.db!.collection('tokens_seguridad').findOne({ token_hash: sha256Hex(token) });
    expect(stored).toMatchObject({ usado_en: null, invalidado_en: null });
    await verify(token).expect(200);
  });

  it('CA-04/CA-10: el segundo uso → 400 genérico; inexistente, mal formado y vencido → el mismo 400', async () => {
    const token = await registerAndCapture('dos.usos@example.test');
    await verify(token).expect(200);
    const second = await verify(token).expect(400);
    expect(second.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(second.body).toEqual(INVALID_LINK);
    expect((await verify('x'.repeat(43)).expect(400)).text).toBe(second.text);
    expect((await verify('no es un token').expect(400)).text).toBe(second.text);

    const vencido = await registerAndCapture('vencido@example.test');
    h.clock.advance(h.config.ttl.verifyTokenMs + 1_000);
    expect((await verify(vencido).expect(400)).text).toBe(second.text);
    expect((await h.usuarios.findOne({ correo_normalizado: 'vencido@example.test' }).lean())?.estado).toBe(
      AccountStatus.PENDIENTE_VERIFICACION,
    );
  });

  it('CA-10: 10 verificaciones simultáneas con el mismo token → exactamente un 200', async () => {
    const token = await registerAndCapture('simultanea@example.test');
    const results = await Promise.all(Array.from({ length: 10 }, () => verify(token)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 400)).toHaveLength(9);
  });

  it('CA-06/RN-06: el reenvío invalida el enlace anterior (anterior → 400, nuevo → 200)', async () => {
    const anterior = await registerAndCapture('reenvio@example.test');
    const res = await resend('reenvio@example.test').expect(202);
    expect(res.body).toEqual({ mensaje: RESEND_MESSAGE });
    expect(res.headers['cache-control']).toBe('no-store');
    await h.waitForMail(2);
    const nuevo = lastToken('reenvio@example.test');
    expect(nuevo).not.toBe(anterior);
    await verify(anterior).expect(400);
    await verify(nuevo).expect(200);
  });

  it('RN-04: inexistente, ya verificada y BOOTSTRAP → el mismo 202, sin token ni correo', async () => {
    const verificada = await registerAndCapture('ya.verificada@example.test');
    await verify(verificada).expect(200);
    const bootstrap = await h.createUser({ estado: AccountStatus.PENDIENTE_VERIFICACION, rol: Role.ADMIN, correo: 'boot@example.test' });
    await h.usuarios.collection.updateOne({ _id: bootstrap.id }, { $set: { origen: AccountOrigin.BOOTSTRAP } });
    h.mail.clear();
    const tokensBefore = await h.connection.db!.collection('tokens_seguridad').countDocuments();

    const responses = [
      await resend('nadie@example.test'),
      await resend('ya.verificada@example.test'),
      await resend('boot@example.test'),
    ];
    for (const r of responses) {
      expect(r.status).toBe(202);
      expect(r.text).toBe(JSON.stringify({ mensaje: RESEND_MESSAGE }));
    }
    await quiet();
    expect(h.mail.sent).toHaveLength(0);
    expect(await h.connection.db!.collection('tokens_seguridad').countDocuments()).toBe(tokensBefore);
  });

  it('CA-14/DEC-09: un reenvío rechazado con 429 no emite token ni envía correo', async () => {
    await registerAndCapture('limite.reenvio@example.test');
    const { max } = h.config.rateLimits.RESEND_ACCOUNT;
    for (let i = 0; i < max; i += 1) await resend('limite.reenvio@example.test').expect(202);
    await h.waitForMail(1 + max);
    const tokensBefore = await h.connection.db!.collection('tokens_seguridad').countDocuments();
    const mailsBefore = h.mail.sent.length;

    const rejected = await resend('limite.reenvio@example.test').expect(429);
    expect(Number(rejected.headers['retry-after'])).toBeGreaterThan(0);
    await quiet();
    expect(h.mail.sent).toHaveLength(mailsBefore);
    expect(await h.connection.db!.collection('tokens_seguridad').countDocuments()).toBe(tokensBefore);
    // El último enlace emitido sigue siendo el válido.
    await verify(lastToken('limite.reenvio@example.test')).expect(200);
  }, 60_000);

  it('DEC-09/RN-12: el token del reenvío no aparece en claro en los logs, MongoDB, Redis ni la auditoría', async () => {
    await registerAndCapture('secreto@example.test');
    // Captura de la salida del proceso (logs de Nest y del MailDispatcher) durante el reenvío y la verificación.
    const output: string[] = [];
    const capture = (chunk: unknown) => {
      output.push(String(chunk));
      return true;
    };
    const out = jest.spyOn(process.stdout, 'write').mockImplementation(capture);
    const err = jest.spyOn(process.stderr, 'write').mockImplementation(capture);
    let token: string;
    try {
      await resend('secreto@example.test').expect(202);
      await h.waitForMail(2);
      token = lastToken('secreto@example.test');
      await verify(token).expect(200);
      await quiet();
    } finally {
      out.mockRestore();
      err.mockRestore();
    }
    // La captura recibió los logs del envío (la comprobación no es vacía).
    expect(output.join('')).toContain('REENVIO_VERIFICACION');
    expect(output.join('')).not.toContain(token);
    expect(output.join('')).not.toContain('secreto@example.test');
    for (const name of ['tokens_seguridad', 'usuarios', 'auditoria_auth']) {
      const dump = JSON.stringify(await h.connection.db!.collection(name).find().toArray());
      expect(dump).not.toContain(token);
    }
    for (const key of await h.redisKeys()) expect(key).not.toContain(token);

    const audit = await h.connection.db!.collection('auditoria_auth').find({ evento: { $in: ['VERIFICACION', 'REENVIO'] } }).toArray();
    expect(audit.map((a) => String(a.evento))).toEqual(expect.arrayContaining(['VERIFICACION', 'REENVIO']));
    expect(JSON.stringify(audit)).not.toMatch(/@example\.test/);
  });

  it('DEC-21: propiedades no declaradas → 400 sin efectos', async () => {
    await post('verify-email', { token: 'x', rol: 'ADMIN' }).expect(400);
    await post('resend-verification', { correo: 'a@example.test', estado: 'ACTIVA' }).expect(400);
    await post('resend-verification', { correo: 'sin-arroba' }).expect(400);
    expect(await h.redisKeys('rl:*')).toEqual([]);
  });
});
