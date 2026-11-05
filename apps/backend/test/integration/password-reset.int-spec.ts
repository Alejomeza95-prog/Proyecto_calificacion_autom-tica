import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { PasswordHasher } from '../../src/auth/password/password-hasher';
import { Sesion } from '../../src/sessions/sesion.schema';
import { SessionsService } from '../../src/sessions/sessions.service';
import { AccountStatus } from '../../src/users/account-status';
import { UsersService } from '../../src/users/users.service';
import { Usuario } from '../../src/users/usuario.schema';
import { bootAuthCore, type AuthCoreHarness } from '../support/auth-core';

/** T-18 con MongoDB real: `UsersService.resetPassword` (DEC-19, RN-16, RN-19) y la revocación (RN-08). */
describe('restablecimiento en la base (T-18)', () => {
  let h: AuthCoreHarness;
  let usuarios: Model<Usuario>;
  let users: UsersService;
  let sessions: SessionsService;

  beforeAll(async () => {
    h = await bootAuthCore('password_reset');
    usuarios = h.moduleRef.get<Model<Usuario>>(getModelToken(Usuario.name));
    users = h.moduleRef.get(UsersService);
    sessions = h.moduleRef.get(SessionsService);
  });

  afterAll(async () => {
    await h.close();
  });

  const institucion = new Types.ObjectId();
  const createUser = async (estado: AccountStatus) =>
    usuarios.create({
      nombre: 'Persona',
      correo_normalizado: `u${new Types.ObjectId().toHexString()}@example.test`,
      password_hash: await h.moduleRef.get(PasswordHasher).hash('contraseña anterior larga'),
      origen: 'INVITACION',
      estado,
      rol: estado === AccountStatus.PENDIENTE_VERIFICACION ? null : 'DOCENTE',
      institucion_id: estado === AccountStatus.PENDIENTE_VERIFICACION ? null : institucion,
    });

  it.each([AccountStatus.ACTIVA, AccountStatus.PENDIENTE_APROBACION])(
    '%s: cambia solo el hash, la fecha de credenciales y version_credenciales (+1)',
    async (estado) => {
      const u = await createUser(estado);
      const before = await usuarios.findById(u._id).select('+password_hash').lean().orFail();
      // El reloj controlado arranca con la suite; la fecha inicial la pone MongoDB con la hora real.
      // Se adelanta hasta 1 s después de esa fecha para no depender de cuánto tardó el arranque.
      h.clock.advance(Math.max(0, before.credenciales_actualizadas_en.getTime() - h.clock.now().getTime()) + 1_000);
      await expect(users.resetPassword(u._id, '$argon2id$nuevo')).resolves.toBe(true);
      const after = await usuarios.findById(u._id).select('+password_hash').lean().orFail();
      expect(after.password_hash).toBe('$argon2id$nuevo');
      expect(after.version_credenciales).toBe(before.version_credenciales + 1);
      expect(after.credenciales_actualizadas_en.getTime()).toBeGreaterThan(before.credenciales_actualizadas_en.getTime());
      expect({ estado: after.estado, rol: after.rol, inst: after.institucion_id?.toHexString() }).toEqual({
        estado: before.estado,
        rol: before.rol,
        inst: before.institucion_id?.toHexString(),
      });
    },
  );

  it.each([AccountStatus.PENDIENTE_VERIFICACION, AccountStatus.BLOQUEADA, AccountStatus.DESACTIVADA])(
    '%s: no es elegible → false y el documento no cambia',
    async (estado) => {
      const u = await createUser(estado);
      const before = await usuarios.findById(u._id).select('+password_hash').lean().orFail();
      await expect(users.resetPassword(u._id, '$argon2id$nuevo')).resolves.toBe(false);
      const after = await usuarios.findById(u._id).select('+password_hash').lean().orFail();
      expect(after).toEqual(before);
    },
  );

  it('revokeAllForUser revoca todas las sesiones vigentes de la cuenta con RESET_PASSWORD y no las de otras', async () => {
    const u = await createUser(AccountStatus.ACTIVA);
    const other = await createUser(AccountStatus.ACTIVA);
    await sessions.create(u._id, 0);
    await sessions.create(u._id, 0);
    const otherSession = await sessions.create(other._id, 0);
    await expect(sessions.revokeAllForUser(u._id, 'RESET_PASSWORD')).resolves.toBe(2);
    const model = h.moduleRef.get<Model<Sesion>>(getModelToken(Sesion.name));
    const mine = await model.find({ usuario_id: u._id }).lean();
    expect(mine.every((s) => s.revocada_en instanceof Date && s.motivo_revocacion === 'RESET_PASSWORD')).toBe(true);
    expect((await model.findById(otherSession.sid).lean().orFail()).revocada_en).toBeNull();
  });
});
