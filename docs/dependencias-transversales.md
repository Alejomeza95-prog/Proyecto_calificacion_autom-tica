# Dependencias técnicas transversales

Decisiones que afectan a varias historias. **Ninguna está implementada**; cada una debe resolverse con una spec técnica o un registro de decisión (ADR) aprobado por el equipo antes de implementar las historias que bloquea (`/sdd-implement` se detiene si el plan marca una DT bloqueante sin resolver).

| ID | Tema | Bloquea | Estado |
|---|---|---|---|
| DT-01 | Creación de apps | Todas | Parcial (backend y frontend, HT-CORE-01) |
| DT-02 | Replica set MongoDB | HU-EVAL-001 (outbox/evento), cualquier HU con transacciones | Pendiente |
| DT-03 | GridFS | HU-EVAL-001, OMR-001..003 | Propuesta |
| DT-04 | Autenticación y RBAC | HU-EVAL-001 y toda HU con roles | Pendiente |
| DT-05 | Estrategia de pruebas | Todas | Pendiente |
| DT-06 | Redis + BullMQ | HU-EVAL-001, OMR-002 | Pendiente |
| DT-07 | Migraciones MongoDB | Toda HU con persistencia | Pendiente |
| DT-08 | CI y protección de `main` y `develop` | Todas (antes del primer PR de código) | Pendiente |
| DT-09 | Entidades base | HU-EVAL-001 y siguientes | Falta documento fuente |

---

## DT-01 — Creación de `apps/backend`, `apps/frontend`, `apps/omr`
- **Situación (2026-10-28):** estructura decidida por el responsable de HT-CORE-01: `apps/backend` (NestJS), `apps/frontend` (React + Vite) y `apps/omr` (FastAPI). Compose define `backend`, `frontend` y `omr` en el perfil `app`. Los esqueletos de `apps/backend` y `apps/frontend` se crean en HT-CORE-01 (Fase 0B, carpetas independientes con su propio lockfile, DEC-13). `apps/omr` se crea con OMR-001..003. Plantillas en `docker/templates/{backend,frontend,omr}.Dockerfile.example`.
- **A decidir:** ~~estructura de carpetas~~ (resuelta); monorepo con pnpm workspaces o carpetas independientes (propuesta: independientes, HT-CORE-01 DEC-13); gestor de paquetes (las plantillas usan pnpm); versión de Node (22) y Python (3.12); estructura de módulos NestJS; ¿paquete compartido de tipos/contratos?
- **Entregable:** spec técnica (ej. `specs/TEC-001`) con esqueletos vacíos, lint, typecheck y healthchecks. Sin código de negocio.
- **Histórico — estructura verificada (HT-CORE-01, 2026-10-10, antes de DEC-12):** `apps/api`, `apps/web` y `apps/omr` **no existen**; no se creó scaffolding. Solo existen las plantillas `docker/templates/{api,web,omr}.Dockerfile.example` (Node 22 + pnpm, Python 3.12).
- **Convenciones de frontend pendientes** (registradas por HT-CORE-01, a decidir por el equipo):

  | Convención | Pregunta abierta | DT |
  |---|---|---|
  | Lint | Herramienta y reglas para React + TypeScript strict | DT-01 / DT-08 |
  | Formato | Formateador y si se valida en CI | DT-01 / DT-08 |
  | Pruebas | Framework de componentes y E2E | DT-05 |
  | Variables públicas y privadas | Qué variables llegan al navegador, convención de nombres y dónde se documentan | DT-01 |
  | Diseño de interfaz | Tokens, accesibilidad y movimiento | HU-UX-001 |

## DT-02 — Replica set de MongoDB
- **Situación:** `mongo` corre standalone. **Las transacciones multi-documento, el outbox transaccional y los change streams requieren replica set.**
- **Opciones:**
  1. Mantener standalone y diseñar con índices únicos, operaciones atómicas de un documento y estados compensatorios.
  2. Replica set de un nodo en Compose (`--replSet` + inicialización + keyfile, ya que hay autenticación). Requiere modificar `docker-compose.yml` y la URI (`replicaSet=`/`directConnection`).
- **Impacto:** HU-EVAL-001 (evento `RespuestasAsociadas`), pruebas de integración, producción.

## DT-03 — GridFS
- **Situación:** propuesta en la arquitectura para hojas OMR, imágenes y archivos de carga; pendiente de aprobación por spec.
- **A decidir:** buckets (ej. `cargas`, `hojas_omr`), metadatos obligatorios (SHA-256, MIME, tamaño, usuario, documento dueño), límite de tamaño, retención y borrado, alternativa si se descarta.

## DT-04 — Autenticación y RBAC
- **Situación:** la arquitectura indica JWT/OIDC + RBAC; HU-EVAL-001 usa roles DOCENTE y ADMIN. No hay historia de autenticación en el roadmap.
- **A decidir:** proveedor (JWT propio vs. OIDC externo), catálogo de roles y permisos, colección de usuarios, auditoría. Confirmar con el backlog si existe una historia para esto.

## DT-05 — Estrategia de pruebas
- **A decidir:** framework (Jest/Vitest para NestJS, Vitest para React, pytest para OMR, Playwright E2E); MongoDB de integración (Testcontainers, instancia Compose con base aislada, o `mongodb-memory-server`; nota: transacciones exigen replica set también en pruebas); cobertura mínima; dataset OMR con ground truth (sin datos personales reales).

## DT-06 — Redis + BullMQ
- **A decidir:** nombres de colas, política de reintentos y backoff, idempotencia, dónde corren los workers (proceso aparte del API o dentro), cómo se reporta progreso, persistencia de Redis (AOF ya activo).

## DT-07 — Migraciones MongoDB
- **A decidir:** `migrate-mongo` o scripts propios con colección `migrations`; convención de nombres; ejecución en CI y despliegue; uso de `syncIndexes`.

## DT-08 — CI y protección de `main` y `develop`
- **A decidir:** plataforma (GitHub Actions), checks requeridos en los PR hacia `develop` y `main` (lint, typecheck, unit, integración MongoDB, `docker compose config`), protección de `main` y `develop`, escaneo de secretos.
- **Estado del repositorio:** ya existe en GitHub con `main` y `develop`. Falta configurar la protección de ambas ramas y los checks de CI.

## DT-09 — Entidades base
- **Situación:** HU-EVAL-001 depende de estudiantes inscritos, exámenes, formas y usuarios, pero no hay IDs ni specs para ellos.
- **Acción:** revisar el backlog original; si existen historias, incorporarlas con sus IDs; si no, decidir en equipo si se crean o si HU-EVAL-001 usará datos sembrados (seed).
