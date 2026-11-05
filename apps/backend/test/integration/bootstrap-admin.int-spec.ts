import { getModelToken } from '@nestjs/mongoose';
import { MODULE_METADATA } from '@nestjs/common/constants';
import type { Model } from 'mongoose';
import { AppModule } from '../../src/app.module';
import { AuditService } from '../../src/audit/audit.service';
import { PasswordHasher } from '../../src/auth/password/password-hasher';
import { BootstrapAdminService } from '../../src/bootstrap/bootstrap-admin.service';
import { BootstrapModule } from '../../src/bootstrap/bootstrap.module';
import { MailService } from '../../src/mail/mail.service';
import { SecurityTokensService } from '../../src/security-tokens/security-tokens.service';
import { TokenPurpose } from '../../src/security-tokens/token-purpose';
import { UsersService } from '../../src/users/users.service';
import { Usuario } from '../../src/users/usuario.schema';
import { bootAuthCore, type AuthCoreHarness } from '../support/auth-core';

const LINK = /http:\/\/localhost:5173\/activar-cuenta#token=([A-Za-z0-9_-]+)/;

/** T-35 con MongoDB y Redis reales: `BootstrapAdminService` (DEC-08; CA-13, RN-14, RN-12; plan §5). */
describe('inicialización del primer administrador (T-35)', () => {
  let h: AuthCoreHarness;
  let usuarios: Model<Usuario>;
  let service: BootstrapAdminService;
  let tokens: SecurityTokensService;

  beforeAll(async () => {
    h = await bootAuthCore('bootstrap_admin');
    usuarios = h.moduleRef.get<Model<Usuario>>(getModelToken(Usuario.name));
    tokens = h.moduleRef.get(SecurityTokensService);
    service = new BootstrapAdminService(
      h.moduleRef.get(UsersService),
      tokens,
      h.moduleRef.get(PasswordHasher),
      h.moduleRef.get(MailService),
      h.moduleRef.get(AuditService),
    );
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await usuarios.deleteMany({});
    await h.connection.db!.collection('tokens_seguridad').deleteMany({});
    await h.connection.db!.collection('auditoria_auth').deleteMany({});
    h.mail.clear();
    h.mail.failNext = 0;
  });

  const tokenOf = (index = -1): string => {
    const mail = h.mail.sent.at(index);
    const match = LINK.exec(mail?.text ?? '');
    if (!match?.[1]) throw new Error('sin enlace de activación');
    return match[1];
  };
  const activationTokens = () => h.connection.db!.collection('tokens_seguridad').find({ proposito: 'ACTIVAR_CUENTA' }).toArray();

  it('CA-13: base sin ADMIN → crea una cuenta BOOTSTRAP ADMIN pendiente, sin contraseña utilizable, y envía el enlace', async () => {
    await expect(service.run({ nombre: ' Ana Admin ', correo: ' Admin@Example.TEST ' })).resolves.toBe('CREADA');
    const docs = await usuarios.find({}).select('+password_hash').lean();
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      nombre: 'Ana Admin',
      correo_normalizado: 'admin@example.test',
      origen: 'BOOTSTRAP',
      rol: 'ADMIN',
      institucion_id: null,
      estado: 'PENDIENTE_VERIFICACION',
      correo_verificado_en: null,
      version_credenciales: 0,
    });
    expect(docs[0]?.password_hash).toMatch(/^\$argon2id\$/);
    expect(h.mail.sent).toHaveLength(1);
    expect(h.mail.sent[0]?.to).toBe('admin@example.test');
    expect(tokenOf()).toHaveLength(43);
    const audit = await h.connection.db!.collection('auditoria_auth').find({}).toArray();
    expect(audit).toEqual([expect.objectContaining({ evento: 'ADMIN_INICIALIZADO', resultado: 'OK' })]);
  });

  it('CA-13: con un ADMIN ACTIVO se niega sin cambios ni correo', async () => {
    await usuarios.create({
      nombre: 'Admin',
      correo_normalizado: 'activo@example.test',
      password_hash: '$argon2id$x',
      estado: 'ACTIVA',
      rol: 'ADMIN',
      institucion_id: null,
      origen: 'INVITACION',
    });
    await expect(service.run({ nombre: 'Otra', correo: 'otra@example.test' })).resolves.toBe('RECHAZADA_ADMIN_ACTIVO');
    expect(await usuarios.countDocuments()).toBe(1);
    expect(h.mail.sent).toHaveLength(0);
    expect(await activationTokens()).toHaveLength(0);
    const audit = await h.connection.db!.collection('auditoria_auth').find({}).toArray();
    expect(audit).toEqual([expect.objectContaining({ evento: 'ADMIN_INICIALIZACION_RECHAZADA', resultado: 'RECHAZADO' })]);
  });

  it('CA-13/RN-06: reejecutar con la cuenta pendiente y el mismo correo → enlace nuevo; el anterior deja de servir', async () => {
    await service.run({ nombre: 'Ana', correo: 'admin@example.test' });
    const anterior = tokenOf();
    await expect(service.run({ nombre: 'Otro nombre', correo: ' ADMIN@example.test' })).resolves.toBe('REEMITIDA');
    const nuevo = tokenOf();
    expect(nuevo).not.toBe(anterior);
    expect(await usuarios.countDocuments()).toBe(1);
    expect((await usuarios.findOne().lean())?.nombre).toBe('Ana');
    await expect(tokens.consume(anterior, TokenPurpose.ACTIVAR_CUENTA)).resolves.toBeNull();
    await expect(tokens.consume(nuevo, TokenPurpose.ACTIVAR_CUENTA)).resolves.not.toBeNull();
  });

  it('CA-13: con la cuenta pendiente y otro correo se niega sin cambios', async () => {
    await service.run({ nombre: 'Ana', correo: 'admin@example.test' });
    const vigente = tokenOf();
    h.mail.clear();
    await expect(service.run({ nombre: 'Ana', correo: 'otro@example.test' })).resolves.toBe('RECHAZADA_OTRA_CUENTA_INICIAL');
    expect(await usuarios.countDocuments()).toBe(1);
    expect(h.mail.sent).toHaveLength(0);
    await expect(tokens.consume(vigente, TokenPurpose.ACTIVAR_CUENTA)).resolves.not.toBeNull();
  });

  it('un correo que ya pertenece a otra cuenta → se niega sin crear nada', async () => {
    await usuarios.create({ nombre: 'P', correo_normalizado: 'docente@example.test', password_hash: '$argon2id$x', origen: 'AUTORREGISTRO' });
    await expect(service.run({ nombre: 'Ana', correo: 'docente@example.test' })).resolves.toBe('RECHAZADA_CORREO_EN_USO');
    expect(await usuarios.countDocuments({ origen: 'BOOTSTRAP' })).toBe(0);
    expect(h.mail.sent).toHaveLength(0);
  });

  it('CA-13: 5 ejecuciones simultáneas → 1 documento BOOTSTRAP, una sola creación y un único enlace vigente', async () => {
    const outcomes = await Promise.all(
      Array.from({ length: 5 }, () => service.run({ nombre: 'Ana', correo: 'admin@example.test' })),
    );
    expect(await usuarios.countDocuments({ origen: 'BOOTSTRAP' })).toBe(1);
    expect(outcomes.filter((o) => o === 'CREADA')).toHaveLength(1);
    for (const o of outcomes) expect(['CREADA', 'REEMITIDA', 'RECHAZADA_EJECUCION_SIMULTANEA']).toContain(o);
    const vigentes = (await activationTokens()).filter((t) => t.usado_en === null && t.invalidado_en === null);
    expect(vigentes).toHaveLength(1);
  });

  it('DEC-09: fallo de SMTP → CORREO_NO_ENVIADO auditado sin enlace; reejecutar con el mismo correo envía un enlace nuevo', async () => {
    h.mail.failNext = 1;
    await expect(service.run({ nombre: 'Ana', correo: 'admin@example.test' })).resolves.toBe('CORREO_NO_ENVIADO');
    expect(await usuarios.countDocuments({ origen: 'BOOTSTRAP' })).toBe(1);
    const audit = await h.connection.db!.collection('auditoria_auth').find({ evento: 'CORREO_NO_ENVIADO' }).toArray();
    expect(audit).toHaveLength(1);
    await expect(service.run({ nombre: 'Ana', correo: 'admin@example.test' })).resolves.toBe('REEMITIDA');
    expect(h.mail.sent).toHaveLength(1);
    const vigentes = (await activationTokens()).filter((t) => t.usado_en === null && t.invalidado_en === null);
    expect(vigentes).toHaveLength(1);
  });

  it('DEC-08/DEC-09/RN-12: el token no aparece en claro en MongoDB ni Redis; la auditoría no tiene el correo', async () => {
    await service.run({ nombre: 'Ana', correo: 'admin@example.test' });
    const token = tokenOf();
    for (const { name } of await h.connection.db!.listCollections({}, { nameOnly: true }).toArray()) {
      expect(JSON.stringify(await h.connection.db!.collection(name).find().toArray())).not.toContain(token);
    }
    for (const key of await h.redisKeys()) expect(key).not.toContain(token);
    const audit = JSON.stringify(await h.connection.db!.collection('auditoria_auth').find().toArray());
    expect(audit).not.toContain('admin@example.test');
  });

  it('RN-14: ninguna ruta HTTP llega a BootstrapAdminService (AppModule no importa BootstrapModule)', () => {
    const imports = (Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) ?? []) as unknown[];
    expect(imports).not.toContain(BootstrapModule);
    const providers = (Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AppModule) ?? []) as unknown[];
    expect(providers).not.toContain(BootstrapAdminService);
  });
});
