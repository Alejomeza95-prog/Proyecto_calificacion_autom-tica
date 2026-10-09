# Proyecto OMR PreICFES — reglas obligatorias para Claude Code

## Forma de trabajo: Spec-Driven Development (SDD)
Cada historia de usuario tiene tres archivos en `specs/<ID>/`: `spec.md` (qué), `plan.md` (cómo) y `tasks.md` (pasos).

Flujo por historia, todo en la rama `feature/<ID>` creada desde `develop`:
```
/sdd-spec ─► /sdd-plan ─► /sdd-tasks ─► /sdd-implement + pruebas ─► commits ─► /sdd-release ─► PR único hacia develop ─► revisión ─► merge
```
Detalle: `docs/onboarding/03-flujo-sdd.md`.

1. Leer `specs/000-architecture/architecture.md` antes de realizar cualquier cambio relevante.
2. No hay aprobaciones ni PR separados para spec o plan: el desarrollador responsable confirma que cada documento está `ready` antes de pasar al siguiente, y el equipo revisa todo junto en el PR.
3. No implementar sin `spec.md` y `plan.md` en `ready` y `tasks.md` generado.
4. Cada tarea `T-NN` cubre criterios `CA-NN` verificables y una sección del plan.
5. Si el plan no encaja durante la implementación, actualizar `plan.md` antes de continuar.
6. No modificar archivos, datos ni arquitectura de la aplicación existente sin antes inspeccionarlos.
7. No inventar historias, criterios de aceptación ni estimaciones: deben estar respaldados por documentos en `docs/requisitos/` o por una decisión registrada.
8. Plantillas: `specs/_templates/spec-template.md`, `plan-template.md`, `tasks-template.md`.

## Fuente de verdad
Precedencia: spec y plan de la historia (`ready` o posterior) > arquitectura canónica > requisitos en `docs/requisitos/` > documentos históricos. Ver `docs/SOURCE_OF_TRUTH.md`. Ante divergencias, preguntar antes de implementar.

## Arquitectura aprobada
- Frontend: React + Vite + TypeScript.
- Backend de negocio: NestJS + TypeScript + Mongoose (`@nestjs/mongoose`).
- Base de datos única: MongoDB (colecciones, esquemas e índices).
- Archivos: GridFS como **propuesta pendiente de aprobación** (DT-03).
- Procesamiento OMR: Python + FastAPI + OpenCV + NumPy.
- Colas: Redis + BullMQ.
- Desarrollo local: Docker Compose.
- Transacciones MongoDB multi-documento requieren replica set; la instancia local es standalone hasta que se apruebe lo contrario (DT-02).
- **Prohibido introducir PostgreSQL, Prisma, MySQL u otra base de datos sin aprobación expresa.**

## Reglas OMR
- Áreas: Matemáticas, Ciencias Naturales, Competencias Ciudadanas, Lectura Crítica e Inglés.
- Puntajes por área de 0 a 100.
- Estados de lectura: A/B/C/D, BLANK, MULTIPLE y UNCERTAIN.
- La lectura dudosa o identidad conflictiva debe enviarse a revisión manual.

## Git y colaboración
- `main`: rama estable. `develop`: rama de integración. Ambas protegidas; nadie hace push directo.
- Una rama por historia: `feature/<ID>` (ej. `feature/HU-EVAL-002`) creada desde `develop`.
- Commits en la rama con Conventional Commits y el ID: `feat(HU-EVAL-002): ...`.
- Un único Pull Request por historia hacia `develop`, cuando esté terminada; requiere revisión aprobada y pruebas en verde. Las observaciones se corrigen en la misma rama.
- Claude Code no ejecuta `git commit` sin pedido explícito, y nunca `git push`, creación de PR ni comandos destructivos.
- Detalle: `docs/onboarding/04-git-ramas-commits-pr.md`.

## Seguridad
- No guardar secretos ni información personal en Git. `.env` está ignorado; `.env.docker.example` solo lleva marcadores.
- No leer ni imprimir el contenido de `.env`.

## Calidad
- TypeScript strict. Pruebas unitarias, integración MongoDB y E2E cuando corresponda.
- Definir en `plan.md` colecciones, índices, validaciones, versionado de documentos (`schemaVersion`), scripts de migración y política de auditoría.
- No declarar completada una historia con pruebas fallidas.
