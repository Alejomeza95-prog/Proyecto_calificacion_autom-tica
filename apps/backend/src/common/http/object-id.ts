import { Types } from 'mongoose';
import { ProblemException, ProblemType } from './problem';

/**
 * Identificador de ruta → ObjectId. Un identificador mal formado responde 404, igual que uno inexistente
 * o fuera del alcance (HT-AUTH-01 DEC-14): no revela si el recurso existe.
 */
export function parseObjectIdOr404(id: string): Types.ObjectId {
  if (!/^[0-9a-f]{24}$/i.test(id)) throw new ProblemException(404, ProblemType.NO_ENCONTRADO);
  return new Types.ObjectId(id);
}

export function notFound(): ProblemException {
  return new ProblemException(404, ProblemType.NO_ENCONTRADO);
}

export function conflict(): ProblemException {
  return new ProblemException(409, ProblemType.CONFLICTO);
}

export function invalidField(campo: string, regla: string): ProblemException {
  return new ProblemException(400, ProblemType.SOLICITUD_INVALIDA, [{ campo, reglas: [regla] }]);
}
