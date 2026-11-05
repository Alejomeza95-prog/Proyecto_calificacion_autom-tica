import { AUTH_EVENTS } from './audit/auth-event';
import { GLOBAL_ROLES, INSTITUTIONAL_ROLES, ROLE_SCOPE, ROLES, roleInstitutionViolation } from './authz/role';
import { TOKEN_PURPOSES } from './security-tokens/token-purpose';
import { ACCOUNT_STATUSES } from './users/account-status';

// T-01 (RN-01, RN-15): los catálogos coinciden con spec §7, §8.1 y plan §3.
describe('enums compartidos (T-01)', () => {
  it('AccountStatus tiene los 5 estados de spec §7', () => {
    expect([...ACCOUNT_STATUSES].sort()).toEqual(
      ['ACTIVA', 'BLOQUEADA', 'DESACTIVADA', 'PENDIENTE_APROBACION', 'PENDIENTE_VERIFICACION'].sort(),
    );
  });

  it('Role es el catálogo de spec §8.1 y ROLE_SCOPE cubre todos los roles', () => {
    expect([...ROLES].sort()).toEqual(['ADMIN', 'COORDINADOR', 'DOCENTE']);
    expect(Object.keys(ROLE_SCOPE).sort()).toEqual([...ROLES].sort());
    expect(GLOBAL_ROLES).toEqual(['ADMIN']);
    expect([...INSTITUTIONAL_ROLES].sort()).toEqual(['COORDINADOR', 'DOCENTE']);
  });

  it('TokenPurpose incluye ACTIVAR_CUENTA', () => {
    expect([...TOKEN_PURPOSES].sort()).toEqual(['ACTIVAR_CUENTA', 'RESTABLECER_PASSWORD', 'VERIFICAR_CORREO']);
  });

  it('AuthEvent tiene los 18 eventos de plan §3.4', () => {
    expect(AUTH_EVENTS).toHaveLength(18);
    expect(AUTH_EVENTS).toEqual(
      expect.arrayContaining(['LIMITE_EXCEDIDO', 'REUTILIZACION_DETECTADA', 'CORREO_NO_ENVIADO', 'LIMITADOR_NO_DISPONIBLE']),
    );
  });

  it.each([
    ['ACTIVA', null, null, true],
    ['ACTIVA', 'DOCENTE', null, true],
    ['ACTIVA', 'COORDINADOR', null, true],
    ['ACTIVA', 'ADMIN', 'inst', true],
    ['PENDIENTE_APROBACION', 'ADMIN', 'inst', true],
    ['ACTIVA', 'ADMIN', null, false],
    ['ACTIVA', 'DOCENTE', 'inst', false],
    ['PENDIENTE_VERIFICACION', null, null, false],
  ] as const)('RN-15: estado %s, rol %s, institución %s → violación %s', (estado, rol, inst, violates) => {
    expect(roleInstitutionViolation(estado, rol, inst) !== null).toBe(violates);
  });
});
