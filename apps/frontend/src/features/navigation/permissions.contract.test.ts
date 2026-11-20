import { describe, expect, it } from 'vitest';
// Solo lectura: el catálogo y los permisos reales del backend (HT-AUTH-03 DEC-06). Estos dos archivos no dependen de
// Nest ni de MongoDB; esta prueba no los modifica.
import * as backendPermissions from '../../../../backend/src/authz/permissions.ts';
import { ROLE_SCOPE, ROLES as BACKEND_ROLES } from '../../../../backend/src/authz/role.ts';
import { APPROVABLE_ROLES } from '../admin-users/admin-users-api.ts';
import { ROLES, type Role } from '../auth/api/types.ts';
import {
  hasRole,
  ROLES_EDICION_CLAVES,
  ROLES_LECTURA_CLAVES,
  ROLES_REVISION_MANUAL,
  ROLES_USUARIOS,
} from './permissions.ts';
import { ROLE_LABELS } from './role-labels.ts';

/**
 * HT-AUTH-03 T-36 (RN-05, CA-04, RN-01, RN-03, DEC-06): las copias de permisos del frontend, que deciden qué se
 * muestra, coinciden con las del backend, que deciden qué se permite. No cambia ningún permiso: solo detecta que
 * una copia se haya desviado.
 */
describe('contrato de permisos frontend ↔ backend (T-36)', () => {
  it('el catálogo de roles es el mismo y cada rol tiene nombre visible', () => {
    expect([...ROLES]).toEqual([...BACKEND_ROLES]);
    expect(Object.keys(ROLE_LABELS).sort()).toEqual([...BACKEND_ROLES].sort());
  });

  it('las constantes de DEC-06 son copias exactas de apps/backend/src/authz/permissions.ts', () => {
    expect([...ROLES_LECTURA_CLAVES]).toEqual([...backendPermissions.ROLES_LECTURA_CLAVES]);
    expect([...ROLES_EDICION_CLAVES]).toEqual([...backendPermissions.ROLES_EDICION_CLAVES]);
    expect([...ROLES_REVISION_MANUAL]).toEqual([...backendPermissions.ROLES_REVISION_MANUAL]);
  });

  it('RN-01: solo el ADMIN usa el panel de usuarios (el backend lo exige con @Roles(Role.ADMIN))', () => {
    expect([...ROLES_USUARIOS]).toEqual(['ADMIN']);
  });

  it('RN-03: la aprobación solo ofrece roles institucionales, nunca ADMIN', () => {
    expect([...APPROVABLE_ROLES]).toEqual(['COORDINADOR', 'DOCENTE']);
    for (const rol of APPROVABLE_ROLES) expect(ROLE_SCOPE[rol]).toBe('INSTITUCIONAL');
  });

  // Matriz aprobada en spec §8 (y plan DEC-06): lo que cada rol puede hacer en HT-AUTH-03.
  const MATRIZ: Readonly<Record<Role, Readonly<Record<'lectura' | 'edicion' | 'revision' | 'usuarios', boolean>>>> = {
    ADMIN: { lectura: true, edicion: true, revision: true, usuarios: true },
    COORDINADOR: { lectura: true, edicion: true, revision: true, usuarios: false },
    DOCENTE: { lectura: true, edicion: false, revision: false, usuarios: false },
  };

  it.each(ROLES)('spec §8: permisos de %s', (rol) => {
    expect({
      lectura: hasRole(rol, ROLES_LECTURA_CLAVES),
      edicion: hasRole(rol, ROLES_EDICION_CLAVES),
      revision: hasRole(rol, ROLES_REVISION_MANUAL),
      usuarios: hasRole(rol, ROLES_USUARIOS),
    }).toEqual(MATRIZ[rol]);
  });

  it('una cuenta sin rol no tiene ningún permiso', () => {
    for (const roles of [ROLES_LECTURA_CLAVES, ROLES_EDICION_CLAVES, ROLES_REVISION_MANUAL, ROLES_USUARIOS]) {
      expect(hasRole(null, roles)).toBe(false);
    }
  });
});
