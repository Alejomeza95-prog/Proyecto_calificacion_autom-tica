# Presentación al equipo — Sistema OMR PreICFES

Guía breve para la reunión de arranque (≈ 30–45 min).

## 1. Qué construimos (5 min)
Sistema para calificar evaluaciones tipo PreICFES: lectura OMR de hojas de respuesta, asociación con estudiantes, comparación con claves, puntajes por área de 0 a 100 y estadísticas. Áreas: Matemáticas, Ciencias Naturales, Competencias Ciudadanas, Lectura Crítica e Inglés.

## 2. Arquitectura (10 min)
- React + TypeScript → NestJS + TypeScript → **MongoDB + Mongoose (única base de datos)**.
- Motor OMR en Python + FastAPI + OpenCV, comunicado por colas **Redis + BullMQ**.
- GridFS para archivos: **propuesta pendiente de aprobación**.
- Docker Compose: hoy corren `mongo` y `redis`; las apps se crearán (DT-01).
- Prohibido PostgreSQL/Prisma.
- Detalle: [`docs/arquitectura.md`](arquitectura.md).

## 3. Cómo trabajamos: SDD (10 min)
**`feature/<ID>` desde `develop` → spec.md → plan.md → tasks.md → implementación + pruebas → commits → PR único hacia `develop` → revisión → merge**
- Tres documentos por historia: `spec.md` (qué), `plan.md` (cómo: MongoDB, índices, endpoints, contratos, pruebas) y `tasks.md` (pasos).
- Sin aprobaciones separadas: el desarrollador marca cada documento `ready`; el equipo revisa todo en el PR.
- No se programa sin spec y plan listos y tareas generadas.
- Cada tarea `T-NN` cubre criterios `CA-NN` verificables; matriz de cobertura obligatoria.
- No se inventan historias, criterios ni estimaciones: salen de `docs/requisitos/` o de decisiones registradas.
- Detalle: [`docs/onboarding/03-flujo-sdd.md`](onboarding/03-flujo-sdd.md).

## 4. Claude Code y Skills (5 min)
- `CLAUDE.md` contiene las reglas que Claude Code siempre sigue.
- `/sdd-spec`, `/sdd-plan`, `/sdd-tasks`, `/sdd-implement`, `/sdd-release` + skills de MongoDB, pruebas, Docker, TypeScript y OMR.
- `.claude/settings.json` bloquea lectura de `.env`, `git push` y comandos destructivos.
- Detalle: [`docs/onboarding/05-skills-claude-code.md`](onboarding/05-skills-claude-code.md).

## 5. Git (5 min)
`main` estable y `develop` integración (ambas protegidas). Una rama `feature/<ID>` por historia desde `develop`, Conventional Commits con ID, un único PR hacia `develop` con revisión aprobada y pruebas en verde; las observaciones se corrigen en la misma rama. Detalle: [`docs/onboarding/04-git-ramas-commits-pr.md`](onboarding/04-git-ramas-commits-pr.md).

## 6. Reparto de historias (10 min)
- 11 historias en el roadmap: HU-EVAL-001..007, HU-UX-001, OMR-001..003. Solo HU-EVAL-001 tiene spec (borrador).
- [`docs/matriz-asignacion.md`](matriz-asignacion.md): asignar responsables de spec, empezando por las decisiones transversales DT-01..DT-09.
- Propuesta de arranque:
  1. Incorporar documentos fuente en `docs/requisitos/`.
  2. Resolver DT-01 (apps), DT-04 (auth), DT-05 (pruebas), DT-07 (migraciones) y DT-08 (CI).
  3. Cada responsable crea su rama `feature/<ID>` y elabora spec, plan y tareas; HU-EVAL-001 debe completarse con `plan.md`.

## 7. Decisiones para la reunión
Ver [`docs/dependencias-transversales.md`](dependencias-transversales.md): replica set, GridFS, autenticación, pruebas, BullMQ, migraciones, CI, entidades base, y quién inicializa el repositorio Git, crea `develop` y protege `main` y `develop`.
