import { Types } from 'mongoose';
import { canVerify } from '../manual-review/manual-review.service';
import { verificationViolation, type ValorResuelto } from '../manual-review/resolucion-manual.schema';
import { MATERIAS, MAX_PREGUNTAS, MIN_PREGUNTAS, OPCIONES_CLAVE, SESIONES, ESTADOS_CLAVE } from './answer-key.constants';
import { isComplete, missingQuestions, resize } from './answer-key.rules';
import { parseDay } from './answer-keys.service';
import { claveViolation } from './clave-respuesta.schema';

function verificationViolationFor(o: { verificada: boolean; valor_resuelto: ValorResuelto | null; conAutor?: boolean }) {
  const conAutor = o.conAutor ?? true;
  return verificationViolation({
    verificada: o.verificada,
    valor_resuelto: o.valor_resuelto,
    verificada_por: conAutor ? new Types.ObjectId() : null,
    verificada_en: conAutor ? new Date() : null,
  });
}

// HT-AUTH-03 T-10 (CA-06, CA-10, RN-08, RN-10) y T-30 (RN-06, RN-09, RNF-02).
describe('reglas de la clave de respuesta', () => {
  describe('catálogos (T-30)', () => {
    it('materias, opciones, sesiones, estados y límites coinciden con la spec', () => {
      expect([...MATERIAS]).toEqual(['MAT', 'CN', 'CC', 'LC', 'ING']);
      expect([...OPCIONES_CLAVE]).toEqual(['A', 'B', 'C', 'D']);
      expect([...SESIONES]).toEqual(['SESION_1', 'SESION_2']);
      expect([...ESTADOS_CLAVE]).toEqual(['BORRADOR', 'PUBLICADA']);
      expect([MIN_PREGUNTAS, MAX_PREGUNTAS]).toEqual([1, 100]);
    });
  });

  describe('resize (CA-06, RN-08)', () => {
    it('amplía con preguntas vacías', () => {
      expect(resize(['A'], 3)).toEqual(['A', null, null]);
    });
    it('recorta conservando las primeras', () => {
      expect(resize(['A', 'B', 'C', 'D', 'A'], 3)).toEqual(['A', 'B', 'C']);
    });
    it('no muta el arreglo original', () => {
      const original = ['A', 'B'] as const;
      resize(original, 1);
      expect(original).toEqual(['A', 'B']);
    });
    it('rechaza n no entero o negativo', () => {
      expect(() => resize([], 1.5)).toThrow(RangeError);
      expect(() => resize([], -1)).toThrow(RangeError);
    });
  });

  describe('missingQuestions e isComplete (CA-10, RN-10)', () => {
    it('lista las preguntas sin respuesta numeradas desde 1', () => {
      expect(missingQuestions(['A', null, 'C', null])).toEqual([2, 4]);
    });
    it('completa solo si todas tienen A–D', () => {
      expect(isComplete(['A', 'B', 'C', 'D'])).toBe(true);
      expect(isComplete(['A', null])).toBe(false);
      expect(isComplete([])).toBe(false);
    });
  });

  describe('claveViolation (validador del esquema)', () => {
    const base = { cantidad_preguntas: 2, publicada_en: null, publicada_por: null };
    it('exige tantas respuestas como preguntas', () => {
      expect(claveViolation({ ...base, respuestas: ['A'], estado: 'BORRADOR' })).toMatchObject({ campo: 'respuestas' });
    });
    it('admite un BORRADOR incompleto', () => {
      expect(claveViolation({ ...base, respuestas: ['A', null], estado: 'BORRADOR' })).toBeNull();
    });
    it('rechaza una PUBLICADA incompleta o sin autor', () => {
      expect(claveViolation({ ...base, respuestas: ['A', null], estado: 'PUBLICADA' })).not.toBeNull();
      expect(claveViolation({ ...base, respuestas: ['A', 'B'], estado: 'PUBLICADA' })).toMatchObject({ campo: 'publicada_por' });
      expect(
        claveViolation({
          cantidad_preguntas: 2,
          respuestas: ['A', 'B'],
          estado: 'PUBLICADA',
          publicada_en: new Date(),
          publicada_por: new Types.ObjectId(),
        }),
      ).toBeNull();
    });
  });

  describe('parseDay', () => {
    it('convierte YYYY-MM-DD a 00:00 UTC', () => {
      expect(parseDay('2026-11-11').toISOString()).toBe('2026-11-11T00:00:00.000Z');
    });
    it.each(['2026-02-30', '2026-13-01', 'no-es-fecha'])('rechaza %s con 400', (v) => {
      expect(() => parseDay(v)).toThrow(expect.objectContaining({ status: 400 }) as Error);
    });
  });

  describe('casilla «Verificada» (CA-13, RN-16)', () => {
    it('solo se puede marcar con un valor resuelto, incluido BLANK', () => {
      expect(canVerify(null)).toBe(false);
      expect(canVerify(undefined)).toBe(false);
      expect(canVerify('BLANK')).toBe(true);
      expect(canVerify('C')).toBe(true);
    });
    it('el validador rechaza verificada sin valor, autor o fecha', () => {
      expect(verificationViolationFor({ verificada: true, valor_resuelto: null })).not.toBeNull();
      expect(verificationViolationFor({ verificada: true, valor_resuelto: 'A', conAutor: false })).not.toBeNull();
      expect(verificationViolationFor({ verificada: true, valor_resuelto: 'A' })).toBeNull();
      expect(verificationViolationFor({ verificada: false, valor_resuelto: null })).toBeNull();
    });
  });
});
