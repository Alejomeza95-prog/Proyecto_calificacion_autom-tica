# Fuente de verdad

## Decisión vigente
La decisión del usuario (2026-10-09) es MongoDB como base de datos única, con Mongoose en NestJS, Redis + BullMQ para colas y GridFS como propuesta de almacenamiento de archivos pendiente de aprobación por spec. Otras propuestas antiguas con PostgreSQL/Prisma no se deben implementar.

## Precedencia
1. Spec y plan de la historia (`specs/<ID>/spec.md` y `plan.md` en `ready` o posterior; revisados en el PR hacia `develop`).
2. Arquitectura canónica (`specs/000-architecture/architecture.md`).
3. Requisitos, historias y backlog en `docs/requisitos/` compatibles con la arquitectura.
4. Documentos históricos.

Resolver divergencias con el equipo antes de implementar.

## Documentos referenciados que aún no están en el repositorio
- "Especificación MongoDB de HU-EVAL-001" (referencia de reglas de persistencia).
- Backlog de historias de usuario (origen del volumen objetivo citado en HU-EVAL-001 §8).
- Documento de requisitos y arquitectura técnica del sistema de evaluación OMR.

Incorporarlos en `docs/requisitos/` según `docs/requisitos/README.md`.
