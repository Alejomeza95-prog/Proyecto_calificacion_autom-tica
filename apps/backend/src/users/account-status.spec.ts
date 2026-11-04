import { ACCOUNT_STATUSES, canTransition, type AccountStatus } from './account-status';
import { normalizeEmail } from './email-normalizer';

const VALID: ReadonlyArray<[AccountStatus, AccountStatus]> = [
  ['PENDIENTE_VERIFICACION', 'PENDIENTE_APROBACION'],
  ['PENDIENTE_VERIFICACION', 'ACTIVA'],
  ['PENDIENTE_APROBACION', 'ACTIVA'],
  ['ACTIVA', 'BLOQUEADA'],
  ['ACTIVA', 'DESACTIVADA'],
];

// T-06 (RN-01, RN-03): tabla completa de transiciones válidas e inválidas y normalización.
describe('AccountStatus y EmailNormalizer (T-06)', () => {
  const all = ACCOUNT_STATUSES.flatMap((from) => ACCOUNT_STATUSES.map((to) => [from, to] as const));

  it.each(all)('%s → %s', (from, to) => {
    const expected = VALID.some(([f, t]) => f === from && t === to);
    expect(canTransition(from, to)).toBe(expected);
  });

  it('ninguna transición lleva a BLOQUEADA salvo desde ACTIVA (los límites nunca bloquean, RN-09)', () => {
    expect(ACCOUNT_STATUSES.filter((s) => canTransition(s, 'BLOQUEADA'))).toEqual(['ACTIVA']);
  });

  it.each([
    ['  Ana@Example.TEST ', 'ana@example.test'],
    ['ANA@EXAMPLE.TEST', 'ana@example.test'],
    ['\tana@example.test\n', 'ana@example.test'],
    ['José@example.test', 'josé@example.test'],
  ])('normaliza %j → %j', (raw, expected) => {
    expect(normalizeEmail(raw)).toBe(expected);
  });
});
