---
name: sdd-plan
description: Actualiza o regenera plan.md (cómo se construye) de una historia de usuario cuando cambian los requisitos de spec.md, sin borrar información aprobada, con arquitectura, colecciones y esquemas MongoDB/Mongoose, índices, endpoints, contratos, seguridad, pruebas y decisiones técnicas. Usar después de modificar spec.md o para completar un plan generado por /sdd-spec.
argument-hint: <ID> [cambios o motivo de la actualización]
---

# SDD Plan — actualizar o regenerar plan.md

## Lugar en el flujo
`/sdd-spec` (crea spec + plan + tasks en `draft`) → revisión → **`/sdd-plan`** (cuando cambian requisitos o hay que completar el plan) → `/sdd-tasks` → `/sdd-implement` → pruebas → `/sdd-release` → PR único hacia `develop`.

`plan.md` normalmente ya existe porque lo genera `/sdd-spec`. Esta skill lo mantiene sincronizado con `spec.md`.

## Precondiciones
1. Rama actual `feature/<ID>` (`git branch --show-current`). En `main` detenerse; en otra rama, advertir y no commitear fuera de `feature/<ID>`.
2. `specs/<ID>/spec.md` existe (cualquier estado). Si no existe, detenerse e indicar `/sdd-spec <ID>`.
3. Leer `specs/000-architecture/architecture.md`, `docs/dependencias-transversales.md` y las skills `project-architecture` y `mongodb-mongoose`.
4. Si `plan.md` no existe, crearlo desde `specs/_templates/plan-template.md` con `status: draft`.

## Conservar la información aprobada
Si `plan.md` ya existe:
1. Leerlo completo e identificar qué cambió en `spec.md` (comparar IDs `RN`/`CA`/`RNF` y spec §14).
2. Modificar solo las secciones afectadas. **No borrar**:
   - decisiones `DEC-NN` (las superadas se marcan «reemplazada por DEC-MM» con fecha);
   - colecciones, índices o endpoints de criterios vigentes;
   - OPEN QUESTIONS resueltas (se marcan `[x]` con la respuesta).
3. Mantener IDs estables; no renumerar.
4. Lo que quede obsoleto por un criterio retirado se marca `~~...~~ (obsoleto: CA-NN retirado)`, no se elimina sin confirmación.
5. Registrar el cambio en §17 «Registro de cambios».
6. Antes de escribir, mostrar un resumen de los cambios por sección. Si el plan estaba en `ready`, pedir confirmación y devolverlo a `draft`: el desarrollador debe volver a confirmar `ready`.
7. «Regenerar» significa rehacer las secciones a partir de la spec actual conservando lo anterior; nunca sobrescribir el archivo completo sin confirmación explícita.

## Contenido a cubrir (plantilla §1–§16)
1. Resumen técnico y componentes afectados (`apps/api`, `apps/web`, `apps/omr`, workers).
2. Flujo técnico y módulos, indicando qué reglas `RN-NN` implementa cada uno.
3. **Colecciones y esquemas Mongoose:** `collection:` explícito, campos, tipos, validaciones, referencias `ObjectId`, `schemaVersion`, PII.
4. **Índices:** cada uno justificado por una consulta, regla o criterio.
5. **Consistencia:** transacciones multi-documento **requieren replica set**; si DT-02 no está resuelta, índices únicos, operaciones atómicas de un documento o `bulkWrite` idempotente.
6. **Archivos:** GridFS solo como propuesta pendiente (DT-03).
7. **Scripts de migración** idempotentes con reversión.
8. **Endpoints** con rol, request, response, códigos e idempotencia; errores `problem+json`.
9. **Contratos de datos:** DTOs/validación, jobs y eventos BullMQ, tipos compartidos.
10. **Dependencias:** historias, DT-NN y librerías nuevas (justificar cada una).
11. **Seguridad:** RBAC por endpoint, PII, auditoría, retención, validación de archivos.
12. **Estrategia de pruebas:** cada CA y RN mapeado a nivel, caso y herramienta.
13. Observabilidad y rendimiento.
14. **Decisiones técnicas** `DEC-NN` con alternativas y motivo.
15. Riesgos y OPEN QUESTIONS técnicas, sin inventar respuestas.
16. Checklist de plan listo.

## Validación y salida
1. Verificar trazabilidad: todo `CA`/`RN` vigente de la spec está en §2.3 o §12; ningún ID del plan falta en la spec.
2. Ejecutar `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/sdd-validate.ps1 -Id <ID>` y reportar el resultado.
3. Indicar si `tasks.md` quedó desincronizado y sugerir `/sdd-tasks <ID>`.
4. Proponer `status: ready` solo si se cumplen el checklist §16 y la spec está en `ready`; marcarlo únicamente con confirmación explícita del desarrollador.
5. Sugerir commit (no ejecutarlo sin pedido): `docs(<ID>): actualizar plan técnico`.

## Guardas
- No introducir PostgreSQL, Prisma, MySQL ni otra base de datos.
- No agregar tecnologías fuera de la arquitectura aprobada sin registrarlo como decisión y avisar al desarrollador.
- Si el plan revela un problema en la spec, proponer el ajuste en `spec.md` (registrarlo en spec §14) antes de continuar.
- No escribir código de la aplicación ni iniciar la implementación.

## Siguiente paso
`/sdd-tasks <ID>` para sincronizar las tareas.
