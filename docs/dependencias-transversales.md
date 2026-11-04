# Dependencias técnicas transversales

Decisiones que afectan a varias historias. Las decisiones de cada historia se citan con su prefijo (`HT-CORE-01/DEC-13`, `HT-AUTH-01/DEC-06`) porque la numeración DEC-NN es local a cada plan. **Ninguna está implementada**; cada una debe resolverse con una spec técnica o un registro de decisión (ADR) aprobado por el equipo antes de implementar las historias que bloquea (`/sdd-implement` se detiene si el plan marca una DT bloqueante sin resolver).

| ID | Tema | Bloquea | Estado |
|---|---|---|---|
| DT-01 | Creación de apps | Todas | Parcial (backend y frontend, HT-CORE-01; validación de DTO del backend: `HT-AUTH-01/DEC-21`, aprobada el 2026-11-04) |
| DT-02 | Replica set MongoDB | HU-EVAL-001 (outbox/evento), cualquier HU con transacciones | Pendiente |
| DT-03 | GridFS | HU-EVAL-001, OMR-001..003 | Propuesta |
| DT-04 | Autenticación y RBAC | HT-AUTH-01 (la materializa), HU-EVAL-001 y toda HU con roles | **Resuelta para HT-AUTH-01** (2026-11-03): decisiones de negocio (`HT-AUTH-01/DEC-07`, `DEC-11`, `DEC-14`) y técnicas (`DEC-01`, `DEC-02`, `DEC-03`, `DEC-06`, `DEC-08`, `DEC-10`, `DEC-15`, `DEC-16`, `DEC-17`) aprobadas. Pendientes antes del release de HT-AUTH-01: proveedor de CAPTCHA y valores de producción de `DEC-15`/`DEC-17` |
| DT-05 | Estrategia de pruebas | Todas | **Resuelta para HT-AUTH-01** (`HT-AUTH-01/DEC-13`, aprobada el 2026-11-03); cobertura mínima, pytest y dataset OMR siguen abiertos |
| DT-06 | Redis + BullMQ | HU-EVAL-001, OMR-002 | Pendiente (HT-AUTH-01 usa Redis sin BullMQ: `HT-AUTH-01/DEC-06` y `DEC-09`, aprobadas el 2026-11-03; no decide la política de colas) |
| DT-07 | Migraciones MongoDB | Toda HU con persistencia | **Resuelta** (`HT-AUTH-01/DEC-12`, aprobada el 2026-11-03); su ejecución en CI y despliegue depende de DT-08 |
| DT-08 | CI y protección de `main` y `develop` | Todas (antes del primer PR de código) | Pendiente |
| DT-09 | Entidades base | HU-EVAL-001 y siguientes | Falta documento fuente (una institución por cuenta y aislamiento aprobados en `HT-AUTH-01/DEC-14`, 2026-11-03) |

---

## DT-01 — Creación de `apps/backend`, `apps/frontend`, `apps/omr`
- **Situación (2026-10-28):** estructura decidida por el responsable de HT-CORE-01: `apps/backend` (NestJS), `apps/frontend` (React + Vite) y `apps/omr` (FastAPI). Compose define `backend`, `frontend` y `omr` en el perfil `app`. Los esqueletos de `apps/backend` y `apps/frontend` se crean en HT-CORE-01 (Fase 0B, carpetas independientes con su propio lockfile, `HT-CORE-01/DEC-13`). `apps/omr` se crea con OMR-001..003. Plantillas en `docker/templates/{backend,frontend,omr}.Dockerfile.example`.
- **A decidir:** ~~estructura de carpetas~~ (resuelta); monorepo con pnpm workspaces o carpetas independientes (propuesta: independientes, `HT-CORE-01/DEC-13`); gestor de paquetes (las plantillas usan pnpm); versión de Node (22) y Python (3.12); estructura de módulos NestJS; ¿paquete compartido de tipos/contratos?
- **Validación de DTO en el backend — `HT-AUTH-01/DEC-21`, aprobada por el desarrollador responsable el 2026-11-04:** `class-validator` + `class-transformer` con `ValidationPipe` **global** con `transform: true`, `whitelist: true`, `forbidNonWhitelisted: true` y `forbidUnknownValues: true`; `validationError: { target: false, value: false }` (los errores no exponen el objeto ni el valor recibido); `transformOptions.enableImplicitConversion: false` (sin conversiones implícitas indiscriminadas; cualquier conversión se declara con `@Type`/`@Transform` en la propiedad); DTO como **clases concretas** con validaciones explícitas en **cada** propiedad (`class-validator`); errores de validación traducidos al formato `application/problem+json` del proyecto. Las demás historias del backend adoptan la misma configuración. Siguen abiertos el paquete compartido de tipos y los workspaces.
- **Entregable:** spec técnica (ej. `specs/TEC-001`) con esqueletos vacíos, lint, typecheck y healthchecks. Sin código de negocio.
- **Histórico — estructura verificada (HT-CORE-01, 2026-10-10, antes de `HT-CORE-01/DEC-12`):** `apps/api`, `apps/web` y `apps/omr` **no existen**; no se creó scaffolding. Solo existen las plantillas `docker/templates/{api,web,omr}.Dockerfile.example` (Node 22 + pnpm, Python 3.12).
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
- **Situación:** la arquitectura indica JWT/OIDC + RBAC; HU-EVAL-001 usa roles DOCENTE y ADMIN. La historia que la materializa es HT-AUTH-01 (2026-11-02; propuestas en su plan §14: sesiones, primer administrador, catálogo de roles).
- **Decisiones de HT-AUTH-01 (2026-11-03; detalle y condiciones en `specs/HT-AUTH-01/plan.md` §14). Todas aprobadas:**
  - *Técnicas — **aprobadas por el responsable del proyecto el 2026-11-03**:* `DEC-01` + `DEC-10` JWT propio de 15 min en memoria del cliente y token de renovación opaco en cookie `HttpOnly`, `Secure`, `SameSite=Strict` (`Path=/api/v1/auth`), con rotación, revocación, detección de reutilización y versión de credenciales; `DEC-02` Argon2id; `DEC-03` tokens de 256 bits guardados como SHA-256; `DEC-08` comando `bootstrap:admin` idempotente, sin endpoint ni contraseña, con activación por enlace de un solo uso; `DEC-15` umbrales de intentos y vencimientos iniciales, configurables, con 429 + `Retry-After`, sin bloqueo de cuenta por intentos fallidos, sin impedir el acceso del propietario con credenciales correctas y sin claves de Redis para tokens inexistentes (ajustada el 2026-11-03); `DEC-16` CAPTCHA adaptativo tras 5 fallos por cuenta (proveedor sin elegir); `DEC-17` límite global (total del despliegue) y control de concurrencia de Argon2id por proceso, con valores solo tras pruebas de carga con k6; 429 para límites atribuibles al cliente y 503 para saturación o indisponibilidad del servicio. **Condiciones de la aprobación:** `DEC-01` exige documentar y verificar la protección CSRF y la configuración segura de la cookie; `DEC-08` sin contraseña expuesta en consola ni logs; `DEC-15` aprueba los mecanismos y los límites de `/auth/activate` (5 por enlace existente y 30 por IP cada 15 min), con los demás valores de producción a validar antes del release; `DEC-16` con fallo cerrado y proveedor pendiente antes del release; `DEC-17` con valores de producción pendientes del informe de T-43 y k6 sujeta a la política de licencias.
  - *Riesgos aceptados por el responsable del proyecto (2026-11-03):* adivinación distribuida de contraseñas; restricciones temporales por IP en redes compartidas; fricción de CAPTCHA forzada; indisponibilidad de Redis y del proveedor de CAPTCHA (fallo cerrado, 503); pérdida de correo ante caídas abruptas (`DEC-09`, con reenvío y recuperación seguros); revocación de sesiones por reutilización o por pérdida de respuestas durante la renovación.
  - *De negocio — **aprobadas** (2026-11-03):* `DEC-11` ADMIN global sobre toda la plataforma, con administración de instituciones y usuarios; COORDINADOR y DOCENTE limitados a la institución asignada; nadie se asigna ni modifica su propio rol; roles asignados solo por operaciones autorizadas del backend; permisos de COORDINADOR pendientes de definición funcional.
    `DEC-07` autorregistro público con verificación de correo y aprobación administrativa obligatoria; invitaciones institucionales con rol asignado desde el servidor.
    `DEC-14` una institución por cuenta en la v1; ADMIN global, COORDINADOR y DOCENTE institucionales; 404 para recursos de otra institución y 403 por permiso insuficiente dentro del alcance; aislamiento por `institucion_id` en los servicios y en las consultas a MongoDB.
- **Sigue a decidir:** ~~aprobación de las propuestas técnicas~~ (aprobadas el 2026-11-03); OIDC externo queda descartado para la v1 (`DEC-01` aprobada); proveedor de CAPTCHA (`DEC-16`) y valores de producción de `DEC-15` y `DEC-17` (antes del release de HT-AUTH-01); historia que implementa la aprobación administrativa de cuentas y las invitaciones (`DEC-07`; fuera de HT-AUTH-01); permisos específicos de COORDINADOR (pendientes de definición funcional, `HT-AUTH-01/DEC-11`); historia que implementa la administración de instituciones y usuarios por el ADMIN; retención de `auditoria_auth`.

## DT-05 — Estrategia de pruebas
- **`HT-AUTH-01/DEC-13` — aprobada por el responsable del proyecto el 2026-11-03:** Jest + Supertest en la API y Vitest + Testing Library en el frontend (ya presentes en los esqueletos de HT-CORE-01); Playwright + `@axe-core/playwright` para E2E y accesibilidad; **MongoDB 7 de Compose** con una base aislada por suite para integración (sin `mongodb-memory-server` ni Testcontainers); Redis y Mailpit de Compose (Mailpit aprobado expresamente **solo para desarrollo y pruebas**, `HT-AUTH-01/DEC-05`). Sirve de base para las demás historias; pytest para OMR sigue fuera de su alcance.
- **Pruebas de carga:** `HT-AUTH-01/DEC-17` (aprobada el 2026-11-03) toma k6 (imagen `grafana/k6` con versión fija) como herramienta de referencia, **sujeta a la política de licencias del equipo (AGPL-3.0)**; si se confirma, puede reutilizarse en otras historias.
- **A decidir:** ~~framework de NestJS, React y E2E~~ y ~~MongoDB de integración~~ (resueltos por `HT-AUTH-01/DEC-13`; nota: transacciones exigen replica set también en pruebas); pytest para OMR; cobertura mínima; dataset OMR con ground truth (sin datos personales reales).

## DT-06 — Redis + BullMQ
- **HT-AUTH-01 (2026-11-03, aprobadas por el responsable del proyecto; riesgos del fallo cerrado y de pérdida de correo aceptados):** usa Redis **sin BullMQ**. `HT-AUTH-01/DEC-06`: contadores propios de límites de intentos con script Lua atómico (`INCR` + `PEXPIRE`), claves con HMAC y **fallo cerrado** (503) en las operaciones sensibles si Redis no responde; Redis pasa a ser dependencia del inicio de sesión. Las claves del limitador expiran con su ventana (umbrales en `HT-AUTH-01/DEC-15`), así que no dependen de la persistencia AOF. `HT-AUTH-01/DEC-09`: el correo se envía en proceso después de responder (sin cola; reemplaza a `HT-AUTH-01/DEC-04`), con pérdida posible ante una caída y reenvío iniciado por la persona. Nada de esto decide la política de colas de HU-EVAL-001 ni de OMR.
- **A decidir:** nombres de colas, política de reintentos y backoff, idempotencia, dónde corren los workers (proceso aparte del API o dentro), cómo se reporta progreso, persistencia de Redis (AOF ya activo).

## DT-07 — Migraciones MongoDB
- **`HT-AUTH-01/DEC-12` — aprobada por el responsable del proyecto el 2026-11-03:** runner propio en TypeScript (`MigrationRunner`) con scripts versionados `NNN-descripcion.ts` en `apps/backend/migrations/`, `up`/`down` idempotentes, registro de id y checksum en la colección `migraciones`, comandos `pnpm migrate:up` / `migrate:down` / `migrate:status`; `autoIndex: false` y **sin `syncIndexes()` automático en producción** (los índices se crean solo como paso explícito del despliegue). El runner queda disponible para toda historia con persistencia.
- **Sigue a decidir:** ejecución en CI y en el despliegue (depende de DT-08); ~~`migrate-mongo` o scripts propios~~, ~~convención de nombres y uso de `syncIndexes`~~ (resueltos por `HT-AUTH-01/DEC-12`).

## DT-08 — CI y protección de `main` y `develop`
- **A decidir:** plataforma (GitHub Actions), checks requeridos en los PR hacia `develop` y `main` (lint, typecheck, unit, integración MongoDB, `docker compose config`), protección de `main` y `develop`, escaneo de secretos.
- **Estado del repositorio:** ya existe en GitHub con `main` y `develop`. Falta configurar la protección de ambas ramas y los checks de CI.

## DT-09 — Entidades base
- **Situación:** HU-EVAL-001 depende de estudiantes inscritos, exámenes, formas y usuarios, pero no hay IDs ni specs para ellos.
- **Acción:** revisar el backlog original; si existen historias, incorporarlas con sus IDs; si no, decidir en equipo si se crean o si HU-EVAL-001 usará datos sembrados (seed).
- **Decisión de negocio `HT-AUTH-01/DEC-14` (aprobada el 2026-11-03):** una institución por cuenta en la v1 (`usuarios.institucion_id`); ADMIN global; aislamiento por `institucion_id` en los servicios y en las consultas a MongoDB; 404 para recursos de otra institución y 403 por permiso insuficiente dentro del alcance (RN-17 de HT-AUTH-01). Toda historia con recursos institucionales debe aplicar el mismo filtro de alcance. HT-AUTH-01 compara identificadores y **no** crea la colección de instituciones: qué historia la crea sigue pendiente.
