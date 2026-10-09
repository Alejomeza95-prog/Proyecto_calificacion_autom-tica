---
name: project-architecture
description: Protege y aplica la arquitectura canónica del sistema OMR PreICFES. Usar al diseñar módulos, elegir tecnologías, crear APIs, tocar persistencia, colas, almacenamiento, seguridad o cuando haya documentos contradictorios.
---

# Project Architecture

## Objetivo
Mantener decisiones técnicas coherentes y evitar que documentos históricos desvíen la implementación.

## Procedimiento
1. Leer `specs/000-architecture/architecture.md`.
2. Leer `spec.md` y `plan.md` de la HU activa si existen.
3. Resolver conflictos con el orden de fuente de verdad definido en `docs/SOURCE_OF_TRUTH.md`: spec y plan de la historia (`ready` o posterior) > arquitectura canónica > requisitos en `docs/requisitos/` > documentos históricos. Si persiste la divergencia, preguntar al usuario.
4. Antes de proponer una dependencia nueva, explicar qué problema resuelve y si ya existe una tecnología equivalente en el stack.
5. Evitar microservicios adicionales sin una necesidad demostrable en la spec.

## Decisiones vigentes que no se cambian sin decisión aprobada por el equipo (ADR)
- MongoDB + Mongoose como única persistencia de datos de negocio.
- NestJS para backend principal.
- FastAPI + OpenCV para OMR.
- Redis + BullMQ para asincronía, cuando la spec lo requiera.
- React + TypeScript + Vite para frontend.

## Propuestas pendientes de aprobación por spec
- GridFS para hojas OMR, imágenes y archivos cargados.
- Replica set en MongoDB: necesario para transacciones multi-documento, outbox transaccional y change streams. Hoy la instancia local es standalone.

## Guardas
- No introducir PostgreSQL, Prisma ni MySQL por copiar documentos legacy.
- Guardar imágenes grandes en GridFS cuando esté aprobado en la spec, no incrustarlas en documentos ordinarios.
- No usar transacciones MongoDB sin replica set documentado en la spec.
- No ejecutar procesamiento pesado de visión dentro del request HTTP del backend principal.
- No duplicar reglas de negocio entre frontend y backend: el backend es autoritativo.
