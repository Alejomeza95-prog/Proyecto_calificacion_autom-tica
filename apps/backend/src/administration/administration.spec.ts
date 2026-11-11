import { ADMIN_EVENTS, RECURSO_TIPOS } from '../audit/admin-event';
import { APPROVABLE_ROLES } from '../admin-users/admin-users.service';
import { ROLES_EDICION_CLAVES, ROLES_LECTURA_CLAVES, ROLES_REVISION_MANUAL } from '../authz/permissions';
import { problemBody, ProblemType } from '../common/http/problem';
import { parseCrearInstitucionArgs } from '../instituciones/crear-institucion';

// HT-AUTH-03: catálogos de permisos (DEC-06), roles aprobables (RN-03), auditoría (RN-17) y errores (T-06).
describe('HT-AUTH-03 catálogos', () => {
  it('RN-03: la aprobación solo asigna roles institucionales, nunca ADMIN', () => {
    expect([...APPROVABLE_ROLES]).toEqual(['COORDINADOR', 'DOCENTE']);
  });

  it('DEC-06: lectura para todos los roles; edición y revisión para ADMIN y COORDINADOR', () => {
    expect([...ROLES_LECTURA_CLAVES]).toEqual(['ADMIN', 'COORDINADOR', 'DOCENTE']);
    expect([...ROLES_EDICION_CLAVES]).toEqual(['ADMIN', 'COORDINADOR']);
    expect([...ROLES_REVISION_MANUAL]).toEqual(['ADMIN', 'COORDINADOR']);
  });

  it('RN-17: eventos y recursos auditables', () => {
    expect([...ADMIN_EVENTS].sort()).toEqual(
      [
        'CLAVE_ACTUALIZADA',
        'CLAVE_CREADA',
        'CLAVE_ELIMINADA',
        'CLAVE_PUBLICADA',
        'CUENTA_APROBADA',
        'MARCA_VERIFICADA',
        'PRUEBA_CREADA',
      ].sort(),
    );
    expect([...RECURSO_TIPOS].sort()).toEqual(['clave_respuesta', 'prueba', 'resolucion_manual', 'usuario']);
  });
});

describe('problem+json de HT-AUTH-03 (T-06)', () => {
  it('409 conflicto', () => {
    expect(problemBody(409, ProblemType.CONFLICTO)).toEqual({
      type: 'urn:omr-preicfes:problema:conflicto',
      title: 'El recurso cambió o ya no está en el estado esperado',
      status: 409,
    });
  });

  it('422 clave-incompleta con preguntasFaltantes', () => {
    expect(problemBody(422, ProblemType.CLAVE_INCOMPLETA, undefined, { preguntasFaltantes: [2, 5] })).toEqual({
      type: 'urn:omr-preicfes:problema:clave-incompleta',
      title: 'La clave tiene preguntas sin respuesta',
      status: 422,
      preguntasFaltantes: [2, 5],
    });
  });
});

describe('instituciones:crear (T-01)', () => {
  it('lee y recorta --nombre', () => {
    expect(parseCrearInstitucionArgs(['--nombre', '  Colegio X  '])).toEqual({ nombre: 'Colegio X' });
  });
  it('sin nombre o demasiado largo → mensaje de uso', () => {
    expect(parseCrearInstitucionArgs([])).toHaveProperty('error');
    expect(parseCrearInstitucionArgs(['--nombre', '   '])).toHaveProperty('error');
    expect(parseCrearInstitucionArgs(['--nombre', 'x'.repeat(201)])).toHaveProperty('error');
  });
});
