---
name: sdd-plan
description: Crea o actualiza plan.md (cómo se construye) de una historia de usuario a partir de su spec.md lista, con arquitectura, colecciones y esquemas MongoDB/Mongoose, índices, endpoints, contratos de datos, dependencias, seguridad, estrategia de pruebas y decisiones técnicas. Usar después de /sdd-spec y antes de /sdd-tasks.
---

# SDD Plan

## Lugar en el flujo
`/sdd-spec` → **`/sdd-plan`** → `/sdd-tasks` → `/sdd-implement` → pruebas → `/sdd-release` → PR único hacia `develop`.

## Precondiciones
1. Rama actual `feature/<ID>` (`git branch --show-current`). Si no, detenerse e indicarlo.
2. `specs/<ID>/spec.md` existe con `status: ready`. Si está en `draft`, detenerse y listar lo que falta para que esté lista.
3. Leer `specs/000-architecture/architecture.md`, `docs/dependencias-transversales.md` y las skills `project-architecture` y `mongodb-mongoose`.
4. Si `specs/<ID>/plan.md` ya existe, actualizarlo conservando su contenido; nunca sobrescribirlo completo sin confirmación.

## Salida
`specs/<ID>/plan.md` creado desde `specs/_templates/plan-template.md`.

## Pasos
1. Resumen técnico y componentes afectados (`apps/api`, `apps/web`, `apps/omr`, workers).
2. Flujo técnico y módulos, indicando qué reglas `RN-NN` implementa cada uno.
3. **Colecciones y esquemas Mongoose:** `collection:` explícito, campos, tipos, validaciones, referencias `ObjectId`, `schemaVersion`, campos con PII.
4. **Índices:** cada uno justificado por una consulta, regla o criterio.
5. **Consistencia:** decidir si hace falta atomicidad multi-documento. Las transacciones **requieren replica set**; si DT-02 no está resuelta, diseñar con índices únicos, operaciones atómicas de un documento o `bulkWrite` idempotente.
6. **Archivos:** GridFS solo como propuesta pendiente (DT-03).
7. **Scripts de migración** idempotentes con reversión.
8. **Endpoints** con rol, request, response, códigos e idempotencia; errores `problem+json`.
9. **Contratos de datos:** DTOs/validación, jobs y eventos BullMQ, tipos compartidos.
10. **Dependencias:** historias, DT-NN y librerías nuevas (justificar cada una).
11. **Seguridad:** RBAC por endpoint, PII, auditoría, retención, validación de archivos.
12. **Estrategia de pruebas:** cada CA y RN mapeado a nivel, caso y herramienta.
13. Observabilidad y rendimiento.
14. **Decisiones técnicas** `DEC-NN` con alternativas y motivo.
15. Riesgos y OPEN QUESTIONS técnicas, sin inventar respuestas. Si una depende de una DT sin resolver, indicarlo.
16. Revisar el checklist de la plantilla (§16); si se cumple, proponer `status: ready` y pedir confirmación al desarrollador.
17. Sugerir commit (no ejecutarlo sin pedido): `docs(<ID>): crear plan técnico`.

## Guardas
- No introducir PostgreSQL, Prisma, MySQL ni otra base de datos.
- No agregar tecnologías fuera de la arquitectura aprobada sin registrarlo como decisión y avisar al desarrollador.
- Si el plan revela un problema en la spec, proponer el ajuste en `spec.md` (registrarlo en §14 de la spec) antes de continuar.
- No escribir código de la aplicación.

## Siguiente paso
Con el plan en `ready`: `/sdd-tasks <ID>`.
