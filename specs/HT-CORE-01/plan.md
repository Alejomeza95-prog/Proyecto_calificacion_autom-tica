---
id: HT-CORE-01
spec: ./spec.md
status: ready            # draft | ready  (solo el desarrollador marca ready)
owner: JulianD27-ia
updated: 2026-10-22
---

# HT-CORE-01 — Plan técnico

> **plan.md describe CÓMO se construye lo definido en `spec.md`.** Respeta `specs/000-architecture/architecture.md` y las skills `project-architecture`, `mongodb-mongoose` y `docker-local`.
> Persistencia exclusiva: MongoDB + Mongoose. No PostgreSQL, Prisma ni MySQL.
> Cada sección se divide en **Bloque A** (base técnica y entorno local) y **Bloque B** (cuentas, acceso y RBAC). Todas las DEC-NN son **propuestas** hasta su aprobación.

## 1. Resumen técnico
**Bloque A — Base técnica y entorno local**

Historia de infraestructura local y documentación. No crea colecciones ni endpoints de negocio; la Fase 0B crea los esqueletos mínimos de `apps/backend` y `apps/frontend` (§9.8). Se trabaja sobre `docker-compose.yml` (healthcheck de Redis), un script nuevo de verificación `scripts/verify-local.ps1` que da evidencia reproducible de los CA sin imprimir secretos, el endurecimiento de `docker-up.ps1` y `docker-down.ps1`, y la consolidación de `README_SETUP.md`, `docs/onboarding/01` y `02`, y del registro de DT-01 en `docs/dependencias-transversales.md`.

**Bloque B — Cuentas, acceso y RBAC (antes HT-AUTH-01)**

Módulos NestJS `users`, `auth`, `security-tokens`, `sessions`, `mail`, `audit` y `authz` en `apps/backend`, con persistencia en MongoDB mediante Mongoose (colecciones `usuarios`, `tokens_seguridad`, `sesiones` y `auditoria_auth`) y limitación de intentos con contadores en Redis. La consistencia se apoya en índices únicos y operaciones atómicas de un documento, sin transacciones (DT-02 sin resolver). La propuesta de sesión es un JWT de acceso corto con identificador de sesión revocable, más un token de renovación opaco en una cookie `HttpOnly` (DEC-05, pendiente de aprobación). En `apps/frontend`, la feature `auth` contiene las 7 pantallas, el guardia de rutas privadas y el estado de sesión basado en `GET /auth/me`.

## 2. Arquitectura
**Bloque A — Base técnica y entorno local**

### 2.1 Componentes afectados
| Componente | Ruta | Cambio |
|---|---|---|
| Compose | `docker-compose.yml` | Agregar `healthcheck` a `redis` (`redis-cli ping`). No se tocan puertos, volúmenes ni el perfil `app` (DEC-02). |
| Plantilla de entorno | `.env.docker.example` | Sin cambios previstos. Solo se revisa que conserve únicamente marcadores (RN-01). |
| Exclusiones de Git | `.gitignore` | Sin cambios previstos. Se verifica con `git check-ignore -v .env`. |
| Scripts | `scripts/verify-local.ps1` (nuevo), `scripts/docker-up.ps1`, `scripts/docker-down.ps1` | Verificación con salida `[OK]`/`[FALLA]`. `up` valida antes de arrancar y `down` nunca usa `-v`. |
| Documentación | `README_SETUP.md`, `docs/onboarding/01-instalacion.md`, `docs/onboarding/02-variables-entorno.md` | Inicio, comprobación, logs, apagado seguro y enlaces SDD. |
| Decisiones transversales | `docs/dependencias-transversales.md` (DT-01) | Estructura aprobada de `apps/*` y convenciones de frontend pendientes. |
| Backend NestJS | `apps/backend/` | Esqueleto: `package.json`, `tsconfig` estricto, `src/main.ts`, `AppModule`, `HealthController`, ESLint, Jest y Dockerfile (§9.8, DEC-12..DEC-15). |
| Frontend React | `apps/frontend/` | Esqueleto: Vite + React + TypeScript estricto, `App` mínima, ESLint, Vitest y Dockerfile (§9.8). |
| Compose | `docker-compose.yml` | Servicios `backend` y `frontend` (antes `api` y `web`) con contexto `./apps/backend` y `./apps/frontend`; healthcheck del backend. `omr` sin cambios. |
| Plantillas | `docker/templates/` | `backend.Dockerfile.example` y `frontend.Dockerfile.example` (antes `api` y `web`). |
| Motor OMR | `apps/omr/` | **No aplica:** se conserva el servicio, sin scaffolding (OMR-001..003). |

### 2.2 Flujo técnico
```
.env.docker.example ──copia (si falta)──► .env (ignorado)
        │
docker compose config --quiet ──► docker compose up -d mongo redis ──► healthchecks (mongo: ping, redis: PING)
        │                                                                  │
scripts/verify-local.ps1 ◄───────── docker compose ps / logs ◄──────────────┘
        │
docker compose down (sin -v) ──► volúmenes mongo_data / redis_data conservados
```

### 2.3 Módulos y responsabilidades
| Módulo / artefacto | Responsabilidad | Reglas (RN) que implementa |
|---|---|---|
| `.gitignore` + `.env.docker.example` | Mantener los secretos fuera de Git; plantilla solo con marcadores | RN-01, RN-06 |
| Procedimiento de creación de `.env` (`Copy-Item` condicionado a `Test-Path`) | No sobrescribir un `.env` existente | RN-02 |
| `scripts/docker-down.ps1` + `README_SETUP.md` §apagado | Apagado sin `-v`, con advertencia explícita | RN-03 |
| `scripts/verify-local.ps1` | Comprobar CA sin imprimir valores. Detectar contraseñas en logs comparando en memoria | RN-01, RN-02, RN-04 |
| Registro DT-01 | Estructura de `apps/*` confirmada antes de cualquier scaffolding | RN-05 |
| Esqueletos `apps/backend` y `apps/frontend` | Configuración, health check y pruebas del propio esqueleto, sin código de negocio | RN-05, RN-20 |
| `docs/onboarding/02-variables-entorno.md` | Tabla de variables idéntica a la plantilla | RN-06 |

**Bloque B — Cuentas, acceso y RBAC (antes HT-AUTH-01)**

### 2.1 Componentes afectados
| Componente | Ruta | Cambio |
|---|---|---|
| API NestJS | `apps/backend/src/users/` | Esquema `usuarios`, repositorio y servicio de cuentas y estados. |
| API NestJS | `apps/backend/src/auth/` | Controlador `/api/v1/auth/*`, servicios de registro, login, verificación y recuperación, y DTOs. |
| API NestJS | `apps/backend/src/security-tokens/` | Emisión, hash, invalidación y consumo atómico de tokens. |
| API NestJS | `apps/backend/src/sessions/` | Sesiones revocables y emisión y validación de credenciales de sesión. |
| API NestJS | `apps/backend/src/mail/` | Puerto `MailSender`, adaptador SMTP y plantillas. |
| API NestJS | `apps/backend/src/audit/` | Escritura de `auditoria_auth` con redacción de secretos. |
| API NestJS | `apps/backend/src/authz/` | `JwtAuthGuard`, `RolesGuard`, decoradores `@Roles()` y `@Public()`, y política de alcance por institución. |
| API NestJS | `apps/backend/src/common/rate-limit/` | Limitador por IP, cuenta y ventana sobre Redis. |
| Frontend React | `apps/frontend/src/features/auth/` | 7 pantallas, cliente API, estado de sesión y `RequireAuth`. |
| Compose (solo local) | `docker-compose.yml` | Servicio de captura de correo para desarrollo (DEC-09, propuesta). |
| Plantilla de entorno | `.env.docker.example` + `docs/onboarding/02-variables-entorno.md` | Variables nuevas con marcadores (§9.7). |
| Motor OMR / workers | — | No aplica. |

### 2.2 Flujo técnico
```
React (features/auth) ──► NestJS AuthController ──► AuthService ──► UsersService ──► MongoDB usuarios
                                │  RateLimitGuard (Redis)        ├──► SecurityTokensService ──► tokens_seguridad
                                │                                ├──► SessionsService ──────► sesiones
                                │                                ├──► MailService ──► SMTP (local: captura)
                                │                                └──► AuditService ─────────► auditoria_auth
Rutas privadas ──► JwtAuthGuard (sid vigente) ──► RolesGuard + política de institución ──► controlador
```

### 2.3 Módulos y responsabilidades
| Módulo / clase | Responsabilidad | Reglas (RN) que implementa |
|---|---|---|
| `UsersService` / `AccountStatus` (enum compartido) | Estados y transiciones de cuenta; creación sin rol ni institución; asignación desde la invitación | RN-07, RN-08 |
| `EmailNormalizer` | `trim` + minúsculas (NFC) del correo antes de guardarlo y buscarlo | RN-09 |
| `RegisterDto` (whitelist + `forbidNonWhitelisted: false`, propiedades extra descartadas) | El cuerpo público no transporta rol ni institución | RN-08 |
| `AuthService.register / forgot / resend / login` | Respuesta idéntica en todos los casos; tiempo de respuesta equilibrado (hash ficticio si no existe la cuenta) | RN-10, RN-13 |
| `PasswordHasher` (Argon2id) + `PasswordPolicy` | Hash y verificación; política de longitud mínima | RN-11 |
| `SecurityTokensService` | 32 bytes de `crypto.randomBytes`, SHA-256 del token, invalidación de los anteriores y consumo atómico con verificación de expiración | RN-12 |
| `SessionsService` | Crear, validar y revocar sesiones; revocar todas al restablecer | RN-14, RN-17 |
| `RateLimitGuard` | Contadores por `ip`, `cuenta` (hash del correo normalizado) y ruta | RN-15 |
| `JwtAuthGuard`, `RolesGuard`, `InstitutionScopePolicy` | Autenticación, rol y alcance por institución en el backend | RN-13, RN-16 |
| `AuditService` | Eventos sin secretos; correo enmascarado si hace falta | RN-18 |
| `LinkBuilder` | URL desde `APP_PUBLIC_URL` (lista permitida), nunca desde cabeceras de la solicitud | RN-19 |
| `MailService` | Plantillas de verificación, reenvío, restablecimiento y aviso de cambio; nunca registra el enlace | RN-12, RN-14, RN-19 |

## 3. Colecciones y esquemas MongoDB / Mongoose
**Bloque A — Base técnica y entorno local**

No aplica: la historia no crea colecciones ni esquemas. MongoDB se arranca vacío; la base `omr_preicfes` se crea al insertar datos.

**Bloque B — Cuentas, acceso y RBAC (antes HT-AUTH-01)**

Los nombres de campo siguen el modelo aportado (español, snake_case). La convención definitiva queda en OPEN QUESTION §15.

### 3.1 `usuarios`
- Clase: `UsuarioSchema` · `@Schema({ collection: 'usuarios', timestamps: { createdAt: 'creado_en', updatedAt: 'actualizado_en' } })`
- `password_hash` con `select: false`; `toJSON` elimina `password_hash`.

| Campo | Tipo Mongoose | Requerido | Validación | Referencia | PII |
|---|---|---|---|---|---|
| `_id` | ObjectId | sí | | | no |
| `schemaVersion` | Number | sí | `default: 1` | | no |
| `nombre` | String | sí | `trim`, `minlength: 1`, `maxlength: 120` | | **sí** |
| `correo_normalizado` | String | sí | `lowercase`, `trim`, `match` de correo, `maxlength: 254` | | **sí** |
| `password_hash` | String | sí | `select: false` | | secreto |
| `estado` | String | sí | `enum: AccountStatus` (5 valores), `default: PENDIENTE_VERIFICACION` | | no |
| `rol` | String | no | `enum: Role` (catálogo pendiente), `default: null` | | no |
| `institucion_id` | ObjectId | no | `default: null` | `ref: 'Institucion'` (DT-09) | no |
| `origen` | String | sí | `enum: ['AUTORREGISTRO', 'INVITACION']` | | no |
| `correo_verificado_en` | Date | no | | | no |
| `ultimo_acceso_en` | Date | no | | | no |
| `credenciales_actualizadas_en` | Date | sí | `default: Date.now` | | no |
| `creado_en` / `actualizado_en` | Date | sí | timestamps | | no |

### 3.2 `tokens_seguridad`
- Clase: `TokenSeguridadSchema` · `@Schema({ collection: 'tokens_seguridad', timestamps: { createdAt: 'creado_en', updatedAt: false } })`

| Campo | Tipo Mongoose | Requerido | Validación | Referencia | PII |
|---|---|---|---|---|---|
| `_id` | ObjectId | sí | | | no |
| `schemaVersion` | Number | sí | `default: 1` | | no |
| `usuario_id` | ObjectId | sí | | `ref: 'Usuario'` | no |
| `proposito` | String | sí | `enum: ['VERIFICAR_CORREO', 'RESTABLECER_PASSWORD']` | | no |
| `token_hash` | String | sí | SHA-256 hex, `length: 64` | | secreto |
| `expira_en` | Date | sí | | | no |
| `usado_en` | Date | no | `default: null` | | no |
| `invalidado_en` | Date | no | `default: null` (lo reemplaza otro token) | | no |
| `creado_en` | Date | sí | timestamp | | no |

### 3.3 `sesiones`
- Clase: `SesionSchema` · `@Schema({ collection: 'sesiones', timestamps: { createdAt: 'creado_en', updatedAt: false } })`

| Campo | Tipo Mongoose | Requerido | Validación | Referencia | PII |
|---|---|---|---|---|---|
| `_id` | ObjectId | sí | se usa como `sid` en el JWT | | no |
| `schemaVersion` | Number | sí | `default: 1` | | no |
| `usuario_id` | ObjectId | sí | | `ref: 'Usuario'` | no |
| `refresh_hash` | String | sí | SHA-256 del token de renovación | | secreto |
| `expira_en` | Date | sí | | | no |
| `revocada_en` | Date | no | `default: null` | | no |
| `motivo_revocacion` | String | no | `enum: ['LOGOUT', 'RESET_PASSWORD', 'ADMIN', 'ROTACION']` | | no |

### 3.4 `auditoria_auth`
- Clase: `AuditoriaAuthSchema` · `@Schema({ collection: 'auditoria_auth', timestamps: { createdAt: 'creado_en', updatedAt: false } })`. Solo inserción.

| Campo | Tipo Mongoose | Requerido | Validación | Referencia | PII |
|---|---|---|---|---|---|
| `_id` | ObjectId | sí | | | no |
| `schemaVersion` | Number | sí | `default: 1` | | no |
| `evento` | String | sí | `enum: AuthEvent` (REGISTRO, VERIFICACION, REENVIO, LOGIN_OK, LOGIN_FALLIDO, LOGOUT, RECUPERACION_SOLICITADA, PASSWORD_RESTABLECIDO, LIMITE_EXCEDIDO, ACCESO_DENEGADO) | | no |
| `usuario_id` | ObjectId | no | null si la cuenta no existe | `ref: 'Usuario'` | no |
| `resultado` | String | sí | `enum: ['OK', 'RECHAZADO']` | | no |
| `ip_hash` | String | no | HMAC de la IP con `AUDIT_IP_PEPPER` | | seudónimo |
| `correlation_id` | String | no | | | no |

**Embebido o referencia:** los tokens y las sesiones se referencian (crecen y caducan de forma independiente al usuario). No hay arreglos embebidos sin límite.

## 4. Índices
**Bloque A — Base técnica y entorno local**

No aplica: sin colecciones.

**Bloque B — Cuentas, acceso y RBAC (antes HT-AUTH-01)**

| Colección | Índice (campos y orden) | Tipo | `partialFilterExpression` | Consulta o regla (RN/CA) que respalda |
|---|---|---|---|---|
| `usuarios` | `{ correo_normalizado: 1 }` | único | — | RN-09, CA-10 (duplicados y carreras) |
| `tokens_seguridad` | `{ token_hash: 1 }` | único | — | Búsqueda en el consumo; CA-12, CA-17 |
| `tokens_seguridad` | `{ usuario_id: 1, proposito: 1 }` | compuesto | `{ usado_en: null, invalidado_en: null }` | Invalidar los anteriores del mismo propósito (RN-12, CA-14, CA-18) |
| `tokens_seguridad` | `{ expira_en: 1 }` | TTL `expireAfterSeconds: 86400` | — | Solo limpieza, un día después de expirar. La expiración lógica se comprueba en la consulta (RN-12) |
| `sesiones` | `{ usuario_id: 1 }` | compuesto | `{ revocada_en: null }` | Revocar todas al restablecer (RN-14, CA-17) |
| `sesiones` | `{ refresh_hash: 1 }` | único | — | Renovación de sesión (DEC-05) |
| `sesiones` | `{ expira_en: 1 }` | TTL `expireAfterSeconds: 0` | — | Limpieza de sesiones vencidas |
| `auditoria_auth` | `{ usuario_id: 1, creado_en: -1 }` | compuesto | — | Consulta de eventos por cuenta (RN-18). Sin TTL hasta definir la retención |

## 5. Consistencia y transacciones
**Bloque A — Base técnica y entorno local**

No aplica. Se mantiene la instancia standalone (DT-02 sin resolver); no se habilita replica set en esta historia.

**Bloque B — Cuentas, acceso y RBAC (antes HT-AUTH-01)**

- No se usan transacciones: la instancia es standalone (DT-02).
- **Registro (CA-10):** `insertOne` en `usuarios`. Un E11000 sobre `correo_normalizado` se captura y produce la **misma respuesta 202** que un registro nuevo. El índice único resuelve las carreras.
- **Emisión de token:** primero `updateMany({ usuario_id, proposito, usado_en: null, invalidado_en: null }, { $set: { invalidado_en: now } })` y después `insertOne`. Si falla la inserción, no queda ningún token válido; el usuario reintenta (estado compensatorio aceptable).
- **Consumo de token (CA-12, CA-17, CA-18):** `findOneAndUpdate({ token_hash, proposito, usado_en: null, invalidado_en: null, expira_en: { $gt: now } }, { $set: { usado_en: now } })` es atómico: dos usos simultáneos no pueden tener éxito.
- **Restablecimiento:** 1) consumir el token atómicamente; 2) `updateOne` de `password_hash` y `credenciales_actualizadas_en`; 3) `updateMany` de `sesiones` con `revocada_en`. Si fallan los pasos 2 o 3, el token ya está consumido y el usuario pide otro. Además, `JwtAuthGuard` rechaza cualquier JWT con `iat` anterior a `credenciales_actualizadas_en`, lo que da revocación efectiva aunque falle el paso 3.
- **Verificación:** consumir el token y luego `updateOne({ _id, estado: 'PENDIENTE_VERIFICACION' }, { $set: { estado: PENDIENTE_APROBACION | ACTIVA*, correo_verificado_en } })` (*ACTIVA solo si el origen es una invitación con rol asignado en el servidor).

## 6. Archivos (GridFS)
**Bloque A — Base técnica y entorno local**

No aplica (DT-03 sigue como propuesta).

**Bloque B — Cuentas, acceso y RBAC (antes HT-AUTH-01)**

No aplica.

## 7. Scripts de migración y versionado
**Bloque A — Base técnica y entorno local**

No aplica: sin cambios de datos.

**Bloque B — Cuentas, acceso y RBAC (antes HT-AUTH-01)**

Herramienta pendiente (DT-07). Scripts propuestos:

| Script | Colección | `schemaVersion` origen → destino | Acción | Reversión | Idempotente |
|---|---|---|---|---|---|
| `001-auth-indices` | `usuarios`, `tokens_seguridad`, `sesiones`, `auditoria_auth` | — → 1 | `createCollection` + índices de §4 (`syncIndexes` controlado) | `dropIndex` de los índices creados (no borra datos) | sí |
| `002-seed-roles-dev` (solo dev/test) | `usuarios` | — → 1 | Cuentas de prueba ACTIVA por rol, sin datos personales reales | Borrar por marcador `seed: true` | sí (upsert por correo) |

## 8. Endpoints
**Bloque A — Base técnica y entorno local**

Solo el health check del esqueleto del backend (DEC-15):

| Método | Path | Rol | Request | Response | Códigos | Idempotencia | CA |
|---|---|---|---|---|---|---|---|
| GET | `/api/v1/health` | público | — | `{ "status": "ok" }` | 200 | sí | CA-21 |

**Bloque B — Cuentas, acceso y RBAC (antes HT-AUTH-01)**

Prefijo propuesto `/api/v1/auth` (ajustar a la convención de NestJS que fije DT-01). Errores en `application/problem+json`.

| Método | Path | Rol | Request | Response | Códigos | Idempotencia | CA |
|---|---|---|---|---|---|---|---|
| POST | `/api/v1/auth/register` | público | `RegisterDto` | mensaje genérico | 202 / 400 / 422 / 429 | sí (correo único) | CA-09, CA-10, CA-11, CA-13 |
| POST | `/api/v1/auth/verify-email` | público | `{ token }` | `{ estado: 'PENDIENTE_APROBACION' \| 'ACTIVA' }` | 200 / 400 (inválido, vencido o usado, genérico) / 429 | sí (segundo uso = 400) | CA-12, CA-13, CA-18 |
| POST | `/api/v1/auth/resend-verification` | público | `{ correo }` | mensaje genérico | 202 / 400 / 429 | sí | CA-14, CA-18 |
| POST | `/api/v1/auth/login` | público | `{ correo, password }` | `{ accessToken, expiresIn }` + cookie de renovación | 200 / 401 genérico / 429 | no | CA-13, CA-15 |
| POST | `/api/v1/auth/refresh` | cookie | — | `{ accessToken, expiresIn }` | 200 / 401 | rotación | DEC-05 |
| GET | `/api/v1/auth/me` | autenticado | — | `{ id, nombre, rol, institucionId, estado }` | 200 / 401 | sí | CA-13, CA-19 |
| POST | `/api/v1/auth/logout` | autenticado | — | — | 204 / 401 | sí | CA-20 |
| POST | `/api/v1/auth/password/forgot` | público | `{ correo }` | mensaje genérico | 202 / 400 / 429 | sí | CA-16, CA-18 |
| POST | `/api/v1/auth/password/reset` | público | `{ token, password }` | — | 204 / 400 (token genérico) / 422 (política) / 429 | sí (segundo uso = 400) | CA-11, CA-17, CA-18 |

## 9. Contratos de datos
**Bloque A — Base técnica y entorno local**

### 9.1 Contrato de configuración local
- Fuente: `.env.docker.example`. Variables: `MONGO_ROOT_USER`, `MONGO_ROOT_PASSWORD`, `MONGO_ROOT_PASSWORD_URLENCODED`, `MONGO_DB`, `MONGO_PORT`, `REDIS_PORT`, `MONGODB_URI`, `REDIS_URL` (documentadas en `docs/onboarding/02-variables-entorno.md`).
- Creación: `if (-not (Test-Path .env)) { Copy-Item .env.docker.example .env }` (RN-02). Claude Code no lee `.env` (denegado en `.claude/settings.json`).
- Redis local sin contraseña, publicado solo en `127.0.0.1`.

### 9.2 Contrato de `scripts/verify-local.ps1`
| # | Comprobación | CA / RN | Modo |
|---|---|---|---|
| 1 | `.env` existe | CA-03 | `-Static` y completo |
| 2 | `git check-ignore -q .env` = 0 | CA-03, RN-01 | `-Static` y completo |
| 3 | `.env.docker.example` solo contiene marcadores `cambiar_*` en las variables secretas | CA-03, RN-01 | `-Static` y completo |
| 4 | `git ls-files` no contiene ningún `.env` real | CA-03, RN-01 | `-Static` y completo |
| 5 | `docker compose config --quiet` = 0 | CA-01 | `-Static` y completo |
| 6 | `docker info` responde (Docker operativo) | CA-02 | completo |
| 7 | `mongo` y `redis` en estado `healthy` | CA-02, CA-04 | completo |
| 8 | Ningún servicio del perfil `app` en ejecución sin su carpeta `apps/<servicio>` (antes de la Fase 0B: ningún servicio `app` en ejecución) | CA-02, RN-05 | completo |
| 9 | `docker compose logs mongo redis` no contiene la contraseña de `.env` (leída en memoria, nunca impresa) | CA-04, RN-04 | completo |

Salida: una línea por comprobación `[OK]`/`[FALLA] <CA>: <motivo sin valores>`. Código de salida 0 si todo pasa y 1 si algo falla.

### 9.3 Comandos documentados
- Validar: `docker compose config --quiet`
- Arrancar: `docker compose up -d mongo redis` (o `scripts/docker-up.ps1`)
- Estado: `docker compose ps`; logs: `docker compose logs --tail 100 mongo redis`
- Verificar: `scripts/verify-local.ps1`
- Apagar sin borrar datos: `docker compose down` (o `scripts/docker-down.ps1`). `down -v` y `docker-reset.ps1` solo con confirmación y sin datos que conservar.
- Aplicaciones: `docker compose --profile app up -d --build backend frontend` (sin `omr` hasta OMR-001).

### 9.8 Contrato de los esqueletos de aplicación (Fase 0B)
| Carpeta | Stack | Scripts (`pnpm <script>`) | Puerto | Verificación |
|---|---|---|---|---|
| `apps/backend` | NestJS 12 + TypeScript ~6.0 estricto, Jest + Supertest | `build`, `start`, `start:dev`, `lint`, `typecheck`, `test` | 3000, prefijo global `api/v1` | `GET /api/v1/health` → 200 `{ "status": "ok" }` |
| `apps/frontend` | React 19 + Vite 8 + TypeScript ~6.0 estricto, Vitest + Testing Library | `dev`, `build`, `preview`, `lint`, `typecheck`, `test` | 5173 | Página inicial servida por Vite |

- Cada carpeta tiene su `package.json`, su `pnpm-lock.yaml`, su `Dockerfile` (desde `docker/templates/`) y su `.dockerignore`, porque Compose construye cada una con su propio contexto (DEC-13).
- Node >= 22 (`engines`); pnpm mediante corepack (`packageManager`).
- Sin variables de entorno nuevas: el esqueleto no lee `.env` (RN-06 sin cambios). Las variables públicas del frontend siguen pendientes (CA-08).

**Bloque B — Cuentas, acceso y RBAC (antes HT-AUTH-01)**

### 9.4 DTOs y validación
```ts
// RegisterDto — ValidationPipe({ whitelist: true }) descarta rol/institucion
class RegisterDto { nombre: string; correo: string; password: string; invitacion?: string }
// LoginDto { correo: string; password: string }
// EmailOnlyDto { correo: string }            // resend-verification, password/forgot
// TokenDto { token: string }                 // verify-email
// ResetPasswordDto { token: string; password: string }
// MeResponse { id: string; nombre: string; rol: Role | null; institucionId: string | null; estado: AccountStatus }
```
La biblioteca de validación (class-validator o Zod) se fija con DT-01 (skill `typescript-strict-mode`).

### 9.5 Eventos y jobs
| Cola / evento | Productor | Consumidor | Payload | Reintentos / backoff | Idempotencia |
|---|---|---|---|---|---|
| `mail` (BullMQ, propuesta DEC-08) | `AuthService` | `MailWorker` | `{ plantilla, usuarioId, enlaceRef }`: el token crudo viaja solo dentro del job en Redis, nunca en los logs | 3 intentos, exponencial | `jobId` = `tokenId` |

### 9.6 Tipos compartidos frontend ↔ backend
`AccountStatus`, `Role`, `MeResponse` y los DTOs de request en un paquete compartido si DT-01 lo aprueba; si no, se duplican en `apps/frontend/src/features/auth/types.ts` con una prueba de contrato.

### 9.7 Variables de entorno nuevas (solo marcadores en `.env.docker.example`)
`APP_PUBLIC_URL`, `JWT_ACCESS_SECRET`, `JWT_ACCESS_TTL=15m`, `SESSION_REFRESH_TTL=7d`, `VERIFY_TOKEN_TTL=24h`, `RESET_TOKEN_TTL=30m`, `RATE_LIMIT_*` (por ruta, IP y cuenta), `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`, `AUDIT_IP_PEPPER`. Todas se documentan en `docs/onboarding/02-variables-entorno.md` (regla del repositorio).

## 10. Dependencias
**Bloque A — Base técnica y entorno local**

| Tipo | Dependencia | Estado | Impacto si no está lista |
|---|---|---|---|
| Entorno | Docker Desktop/WSL con Compose v2 | Requisito de cada máquina | CA-02, CA-04 y CA-07 no se pueden verificar. |
| Técnica transversal | DT-01 (estructura de apps) | Parcial (2026-10-28): estructura y esqueletos de backend y frontend resueltos aquí; workspaces y tipos compartidos pendientes | No bloquea. |
| Técnica transversal | DT-08 (CI) | Pendiente | No bloquea: los comandos de CI quedan como OPEN QUESTION. |
| Rama | `origin/feature/HT-CORE-01` previa | Sin fusionar | Riesgo de conflicto al hacer push o PR (§15). |
| Librería nueva | Esqueletos: `@nestjs/*`, `react`, `vite`, `typescript`, `eslint`, `jest`, `vitest` y afines (§9.8) | Stack aprobado por la arquitectura | Sin ellas no hay esqueleto (CA-21). |

**Bloque B — Cuentas, acceso y RBAC (antes HT-AUTH-01)**

| Tipo | Dependencia | Estado | Impacto si no está lista |
|---|---|---|---|
| Bloque | Bloque A de esta historia | draft | **Bloquea el Bloque B:** sin MongoDB y Redis locales no hay integración. |
| Técnica transversal | DT-01 (creación de apps) | Pendiente | **Bloquea** toda la implementación. |
| Técnica transversal | DT-04 (Auth y RBAC) | Pendiente | **Bloquea:** esta historia la materializa; requiere aprobar DEC-05..DEC-09 y el catálogo de roles. |
| Técnica transversal | DT-05 (estrategia de pruebas) | Pendiente | **Bloquea** §12 (framework y MongoDB de integración). |
| Técnica transversal | DT-07 (migraciones) | Pendiente | Bloquea la creación de índices en entornos compartidos (§7). |
| Técnica transversal | DT-06 (Redis + BullMQ) | Pendiente | Solo si se aprueba la cola de correo (DEC-08); alternativa: envío síncrono. |
| Técnica transversal | DT-09 (entidades base: institución) | Falta documento | `institucion_id` sin colección destino; las pruebas usan ObjectId sembrado. |
| Técnica transversal | DT-02 (replica set) | Pendiente | No bloquea: el diseño evita las transacciones (§5). |
| Librería nueva | `argon2` — hash Argon2id (RNF-02) | Propuesta | Sin alternativa en el stack. |
| Librería nueva | `@nestjs/jwt` + `@nestjs/passport` — JWT (la arquitectura indica JWT/OIDC) | Propuesta | — |
| Librería nueva | `@nestjs/throttler` con almacenamiento en Redis — límites (RN-15) | Propuesta | Alternativa: contadores propios con `INCR`/`EXPIRE` en Redis. |
| Librería nueva | `nodemailer` — SMTP | Propuesta | Depende del proveedor elegido. |
| Herramienta dev | Mailpit (contenedor solo en Compose local) — captura de correo | Propuesta DEC-09 | **Fuera de la arquitectura:** requiere aprobación. |

## 11. Seguridad
**Bloque A — Base técnica y entorno local**

- Secretos solo en `.env`, ignorado por Git (RN-01). Claude Code tiene denegada su lectura.
- `verify-local.ps1` nunca imprime valores de variables ni URIs. La comparación contra los logs se hace en memoria (RN-04).
- Puertos publicados solo en `127.0.0.1` (sin cambios).
- `docker-down.ps1` sin `-v`. `docker-reset.ps1` conserva su confirmación escrita (RN-03).
- La evidencia de las tareas no incluye valores de `.env` ni URIs con credenciales.
- Sin datos personales; sin auditoría de negocio.

**Bloque B — Cuentas, acceso y RBAC (antes HT-AUTH-01)**

- **Autenticación y RBAC:** `JwtAuthGuard` global con `@Public()` explícito en las rutas públicas. El guard comprueba la firma, la expiración, que el `sid` siga vigente en `sesiones` y que `iat ≥ credenciales_actualizadas_en`, y que el estado sea ACTIVA. `RolesGuard` con `@Roles()` e `InstitutionScopePolicy` en el servicio: un recurso se compara con el `institucion_id` del token y la otra institución responde 403 (o 404 para no revelar el recurso; a decidir).
- **Anti-enumeración:** respuestas y códigos idénticos y tiempo equilibrado (Argon2 sobre un hash ficticio cuando la cuenta no existe).
- **Contraseñas:** Argon2id con parámetros OWASP vigentes (`m=19456 KiB, t=2, p=1` como mínimo). Política: longitud de 12 a 128 sin reglas de composición.
- **Tokens:** 256 bits aleatorios, base64url en el enlace, SHA-256 en la base. El enlace lleva el token en el fragmento (`#token=`) o en la ruta del frontend, que lo envía por POST. Nunca va en query strings que acaben en logs de proxy.
- **Sesión (DEC-05):** JWT de acceso de 15 min solo en memoria del cliente. Token de renovación opaco en una cookie `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth/refresh`, con rotación en cada uso y detección de reutilización (si reaparece un token ya rotado, se revocan las sesiones). CSRF: `SameSite=Strict` y comprobación de `Origin` en `/refresh` y `/logout` (RNF-07).
- **Logs:** redactor de Pino o del logger de NestJS que enmascara `password`, `token`, `authorization`, `cookie` y `correo`. Prohibido registrar los enlaces de correo.
- **Enlaces:** `LinkBuilder` solo usa `APP_PUBLIC_URL`, validada al arrancar contra una lista permitida. No hay parámetro `redirect` libre (RN-19).
- **PII:** `nombre` y `correo_normalizado` en `usuarios`. La auditoría guarda `usuario_id` y `ip_hash`, nunca el correo ni la IP en claro.
- **HTTPS:** obligatorio fuera de local (RNF-04). `Secure` en la cookie (en local, `localhost` se trata como contexto seguro).

## 12. Estrategia de pruebas
**Bloque A — Base técnica y entorno local**

| CA / RN | Nivel | Caso | Herramienta | Datos de prueba |
|---|---|---|---|---|
| CA-01 | Verificación de entorno | `docker compose config --quiet` devuelve 0 con `.env` válido y ≠ 0 con una copia temporal sin `MONGO_ROOT_PASSWORD_URLENCODED` (`--env-file` temporal en el scratchpad, borrada después) | `verify-local.ps1 -Static`, PowerShell | Marcadores de la plantilla |
| CA-02 | Verificación de entorno | Tras `up -d mongo redis`, ambos `healthy` y ningún servicio `app` en ejecución | `verify-local.ps1` (comprobaciones 6–8) | — |
| CA-03 | Verificación de entorno | `.env` existe, `git check-ignore -v .env` muestra la regla y `git ls-files` sin `.env` | `verify-local.ps1` (1–4) | — |
| CA-04 | Verificación de entorno | `docker compose ps` muestra `healthy` y los logs no contienen la contraseña | `verify-local.ps1` (7, 9) | — |
| CA-05 | Revisión documental | Todos los enlaces de `README_SETUP.md` resuelven a archivos existentes | Script de comprobación de enlaces (`Test-Path` por enlace) | — |
| CA-06 | Revisión + manual | `docker-down.ps1` no contiene `-v`/`--volumes`. Tras `down` y `up`, los volúmenes `mongo_data` y `redis_data` siguen existiendo (`docker volume ls`) | `Select-String`, Docker | — |
| CA-07 | Manual reproducible | Otro integrante sigue `README_SETUP.md` desde un clon limpio y `verify-local.ps1` devuelve 0 | Checklist en la evidencia de la tarea | Su propio `.env` |
| CA-08 | Revisión documental | DT-01 registra la estructura aprobada (`apps/backend`, `apps/frontend`, `apps/omr`) y lista las convenciones de frontend pendientes | Revisión del diff | — |
| CA-21 | Esqueleto (unit + E2E) + Compose | `pnpm install --frozen-lockfile`, `lint`, `typecheck`, `test` y `build` en verde en ambas apps; prueba E2E de `GET /api/v1/health`; `docker compose --profile app up -d --build backend frontend` → backend `healthy` y frontend responde 200 | pnpm, Jest + Supertest, Vitest, Docker | — |
| RN-01 | Verificación | Comprobaciones 2–4 | `verify-local.ps1` | — |
| RN-02 | Revisión | El procedimiento documentado usa `Test-Path` antes de `Copy-Item` | Revisión | — |
| RN-03 | Revisión | Igual que CA-06 | `Select-String` | — |
| RN-04 | Verificación | Comprobación 9; la salida del script no contiene valores | `verify-local.ps1` | — |
| RN-05 | Revisión | El diff solo crea `apps/backend` y `apps/frontend`; no existe `apps/omr` ni otras carpetas | `git diff --stat` | — |
| RN-20 | Revisión | Los esqueletos solo contienen configuración, `HealthController`, `App` mínima y sus pruebas | Revisión del diff | — |
| RN-06 | Verificación | Las variables de la tabla de `02-variables-entorno.md` coinciden con las claves de `.env.docker.example` | Comparación en PowerShell | — |
| RNF-01 | Manual reproducible | Igual que CA-07 | — | — |

**Bloque B — Cuentas, acceso y RBAC (antes HT-AUTH-01)**

Herramientas propuestas (sujetas a DT-05): Jest + Supertest en la API, MongoDB real de Compose con una base aislada por suite, Vitest + Testing Library en web, Playwright para E2E con captura de correo (Mailpit) y `@axe-core/playwright` para accesibilidad.

| CA / RN | Nivel | Caso | Herramienta | Datos de prueba |
|---|---|---|---|---|
| CA-09 | E2E API + integración | Registro válido → `usuarios` con `estado=PENDIENTE_VERIFICACION`, `rol=null`, `institucion_id=null`, aunque el cuerpo incluya `rol: 'ADMIN'` | Supertest + MongoDB | Correos `@example.test` |
| CA-10 | Integración | 20 registros concurrentes con `" Ana@Example.test "` → 1 documento; las respuestas son byte a byte iguales a las de un correo nuevo | Supertest + `Promise.all` | — |
| CA-11 | Unit + integración | La política rechaza 11 caracteres y acepta una frase de 12; el documento tiene `$argon2id$`; la búsqueda de la contraseña en claro en la base y los logs capturados da 0 resultados | Jest, captura del logger | — |
| CA-12 | Integración | Token de 43 caracteres base64url; en la base solo está el SHA-256; usarlo con el reloj adelantado 24 h + 1 s → 400; el segundo uso → 400 | Jest con reloj falso | — |
| CA-13 | E2E API | Login con PENDIENTE_VERIFICACION, PENDIENTE_APROBACION, BLOQUEADA y DESACTIVADA → 401 genérico; verificar un autorregistro → PENDIENTE_APROBACION; registro con invitación sembrada → rol de la invitación | Supertest | Seed |
| CA-14 | Integración | El reenvío invalida el token anterior; el anterior → 400; correo inexistente → misma respuesta 202; el exceso → 429 | Supertest | — |
| CA-15 | E2E API | Correo inexistente, contraseña errónea y cuenta no ACTIVA → mismo 401 y mismo cuerpo; ACTIVA válida → 200 | Supertest | Seed |
| CA-16 | Integración | `forgot` con un correo existente y uno inexistente → mismo 202; solo el elegible genera un token de 30 min; los logs no contienen el token | Supertest + captura | — |
| CA-17 | E2E | `reset` → el token queda usado; el refresh de la sesión previa → 401; el JWT previo → 401; login con la nueva contraseña → 200 y con la anterior → 401; se envía el correo de aviso | Supertest | — |
| CA-18 | Integración | Dos consumos simultáneos del mismo token → exactamente 1 éxito; el límite por IP y por cuenta → 429 al superar el umbral | Supertest + Redis | — |
| CA-19 | E2E API | Matriz rol × ruta: un DOCENTE en una ruta de ADMIN → 403; un usuario de la institución A sobre un recurso de B → 403/404; sin token → 401 | Supertest con un controlador de prueba protegido | Seed de 2 instituciones |
| CA-20 | E2E | `logout` → el JWT y la cookie de renovación quedan inválidos (401); `auditoria_auth` contiene LOGOUT y ningún documento de auditoría contiene `password`, `token` ni correo | Supertest + consulta Mongo | — |
| RN-07 | Unit | Tabla de transiciones válidas e inválidas de `AccountStatus` | Jest | — |
| RN-08 | E2E API | Igual que CA-09 + no existe ruta pública que acepte `rol` | Supertest | — |
| RN-09 | Unit + integración | `EmailNormalizer` + índice único (E11000) | Jest + MongoDB | — |
| RN-10 | E2E API | Comparación de estado y cuerpo en register, resend, forgot y login | Supertest | — |
| RN-11 | Integración | Igual que CA-11 + `GET /me` y `toJSON` sin `password_hash` | Jest | — |
| RN-12 | Integración | Igual que CA-12, CA-14 y CA-18 | Jest | — |
| RN-13 | E2E API | Igual que CA-13 y CA-15 + una cuenta ACTIVA que se BLOQUEA → su JWT vigente → 401 | Supertest | — |
| RN-14 | E2E | Igual que CA-17 | Supertest | — |
| RN-15 | Integración | Igual que CA-18 (IP, cuenta y ventana) | Supertest + Redis | — |
| RN-16 | E2E API | Igual que CA-19 | Supertest | — |
| RN-17 | E2E | Igual que CA-20 | Supertest | — |
| RN-18 | Integración | Escaneo de `auditoria_auth` y de los logs capturados con patrones de secretos | Jest | — |
| RN-19 | Unit | `LinkBuilder` ignora `Host` y `X-Forwarded-Host` maliciosos; arrancar con un `APP_PUBLIC_URL` fuera de la lista permitida falla | Jest | — |
| RNF-02 | Unit | El hash empieza por `$argon2id$` con los parámetros configurados | Jest | — |
| RNF-03 | Componente + E2E | Pegar en el campo contraseña funciona; `autocomplete="new-password"` y `current-password`; acepta una frase de 64 caracteres | Vitest + Playwright | — |
| RNF-04 | Revisión de despliegue | HSTS y redirección HTTPS en la configuración de despliegue (fuera de local) | Checklist de release | — |
| RNF-05 | Unit | Los TTL se leen de la configuración; si el valor no es válido, el arranque falla | Jest | — |
| RNF-06 | E2E + a11y | `axe` sin violaciones serias en las 7 pantallas; foco en el primer error; región `aria-live` anuncia los resultados; recorrido completo con teclado | Playwright + axe | — |
| RNF-07 | E2E API | `/refresh` y `/logout` con un `Origin` ajeno → 403; cookie con `HttpOnly; Secure; SameSite=Strict` | Supertest | — |

- Índices únicos probados con inserciones duplicadas. Sin transacciones (no requieren replica set).
- El correo en las pruebas usa un adaptador en memoria (unit e integración) y Mailpit (E2E). Nunca se envía correo real.

## 13. Observabilidad y rendimiento
**Bloque A — Base técnica y entorno local**

- Healthchecks de `mongo` (existente) y `redis` (nuevo) visibles en `docker compose ps`.
- Logs consultables con `docker compose logs`, sin credenciales.
- Sin requisitos de volumen ni rendimiento.

**Bloque B — Cuentas, acceso y RBAC (antes HT-AUTH-01)**

- Logs estructurados con `correlationId` por solicitud, con redacción (§11). Métricas: login OK/fallido, 429 por ruta y correos enviados y fallidos.
- Alerta sugerida: un pico de LOGIN_FALLIDO o LIMITE_EXCEDIDO por IP.
- Argon2id cuesta unos 50–100 ms por hash a propósito. Sin RNF de volumen en la spec.

## 14. Decisiones técnicas
**Bloque A — Base técnica y entorno local**

| ID | Decisión | Alternativas consideradas | Motivo | Fecha |
|---|---|---|---|---|
| DEC-01 | Propuesta: script `scripts/verify-local.ps1` (con modo `-Static`) como evidencia reproducible de los CA | Solo comandos manuales documentados | Repetibilidad (CA-07) y verificación sin exponer secretos (RN-04) | 2026-10-22 |
| DEC-02 | Propuesta: healthcheck `redis-cli ping` en `redis` | Mantener `service_started` | Skill `docker-local`: healthchecks en dependencias críticas. Permite verificar disponibilidad (CA-02, CA-04) | 2026-10-22 |
| DEC-03 | ~~Propuesta: registrar estructura de apps y convenciones de frontend en DT-01, sin crear carpetas~~ (reemplazada por DEC-12) | Crear scaffolding mínimo | RN-05; la estructura del monorepo sigue abierta | 2026-10-22 |
| DEC-04 | Propuesta: scripts solo para PowerShell (Windows) | Agregar equivalentes `.sh` | Supuesto de spec §3; los scripts existentes son `.ps1` | 2026-10-22 |
| DEC-12 | **Aprobada por el responsable:** estructura `apps/backend`, `apps/frontend` y `apps/omr`; esqueletos de backend y frontend en esta historia | `apps/api` y `apps/web`; historia técnica aparte | Decisión del responsable (spec §14) | 2026-10-28 |
| DEC-13 | Propuesta: cada app es una carpeta independiente con su `package.json` y `pnpm-lock.yaml`, sin workspace raíz | pnpm workspaces | Coincide con los contextos de build de Compose y las plantillas (`COPY package.json pnpm-lock.yaml*`); los workspaces pueden adoptarse después sin mover carpetas | 2026-10-28 |
| DEC-14 | Propuesta: TypeScript ~6.0 estricto; ESLint (flat config) + typescript-eslint; Jest + ts-jest + Supertest en backend; Vitest + Testing Library en frontend; sin formateador hasta decidir la convención (CA-08) | TypeScript 7; Vitest en backend | TS 7 aún no es compatible con Nest CLI, typescript-eslint ni ts-jest; plan §12 propone Jest en la API y Vitest en web (DT-05) | 2026-10-28 |
| DEC-15 | Propuesta: prefijo global `api/v1` y `GET /api/v1/health` sin dependencia de MongoDB; healthcheck de Compose con `wget` | `@nestjs/terminus` con ping a MongoDB | El esqueleto aún no conecta a MongoDB (RN-20); el prefijo coincide con los endpoints del Bloque B | 2026-10-28 |

**Bloque B — Cuentas, acceso y RBAC (antes HT-AUTH-01)**

| ID | Decisión | Alternativas consideradas | Motivo | Fecha |
|---|---|---|---|---|
| DEC-05 | **Propuesta:** JWT de acceso de 15 min (en memoria) con `sid` validado contra `sesiones`, más un token de renovación opaco rotativo en una cookie `HttpOnly` | a) Sesión opaca solo en cookie; b) JWT sin estado en `localStorage` | La arquitectura indica JWT. El `sid` permite revocar (CA-17, CA-20) y la cookie `HttpOnly` evita exponer el token de renovación a XSS | 2026-10-22 |
| DEC-06 | **Propuesta:** Argon2id con el paquete `argon2` | bcrypt | Requisito RNF-02 | 2026-10-22 |
| DEC-07 | **Propuesta:** tokens de 256 bits, SHA-256 en la base (sin sal: la entropía alta lo hace innecesario) | Argon2 del token | Búsqueda por índice único; el costo de Argon2 no aporta con 256 bits | 2026-10-22 |
| DEC-08 | **Propuesta:** envío de correo por la cola BullMQ `mail` | Envío síncrono en la solicitud | Tiempo de respuesta uniforme (anti-enumeración) y reintentos. Depende de DT-06 | 2026-10-22 |
| DEC-09 | **Propuesta:** Mailpit en Compose solo para desarrollo y E2E | Adaptador en memoria; servicio externo de pruebas | Probar sin distribuir correos reales. **Tecnología fuera de la arquitectura: requiere aprobación** | 2026-10-22 |
| DEC-10 | **Propuesta:** límites de intentos con contadores en Redis | Contadores en MongoDB | Redis ya está en el stack; TTL nativo | 2026-10-22 |
| DEC-11 | **Propuesta:** la verificación deja ACTIVA solo las cuentas de invitación con rol asignado; el autorregistro queda en PENDIENTE_APROBACION | — | RN-07 y RN-08 | 2026-10-22 |

## 15. Riesgos y OPEN QUESTIONS técnicas
**Bloque A — Base técnica y entorno local**

- [x] **Conflicto de rama** (resuelto con el merge `09d1986`, 2026-10-22): `origin/feature/HT-CORE-01` contiene una implementación previa (healthcheck de redis, `verify-local.ps1`, cambios de docs). Esta rama local no la sigue. Decidir antes de hacer push si se reutiliza ese trabajo o se sustituye.
- [ ] Comandos de test/lint que exige CI (DT-08).
- [x] Estructura de carpetas (DEC-12, 2026-10-28).
- [ ] Workspaces y tipos compartidos (DT-01, DEC-13).
- [ ] ¿Se necesitan scripts equivalentes para macOS/Linux? (DEC-04).
- [ ] Archivo `env` sin seguimiento en la raíz de algunas copias de trabajo: no lo cubre la regla `.env`. Revisar si contiene secretos y si `.gitignore` debe excluirlo.

**Bloque B — Cuentas, acceso y RBAC (antes HT-AUTH-01)**

- [ ] **DT-04 bloqueante:** aprobar DEC-05 (cookie o token), el catálogo de roles y quién aprueba.
- [ ] **DT-05 y DT-07 bloqueantes:** sin estrategia de pruebas aprobada y sin herramienta de migraciones no se puede implementar. DT-01 queda resuelta en lo necesario por la Fase 0B (esqueletos).
- [ ] Proveedor de correo de producción y aprobación de Mailpit para local (DEC-09).
- [ ] ¿La cola de correo (DEC-08) entra en esta historia o se envía de forma síncrona hasta DT-06?
- [ ] Convención de nombres de campos en MongoDB (español snake_case, como se propuso, o camelCase).
- [ ] Recurso de otra institución: ¿403 o 404?
- [ ] Umbrales de los límites de intentos (por IP, cuenta y ventana) y política de BLOQUEADA por intentos fallidos.
- [ ] Retención de `auditoria_auth` (sin TTL hasta decidir).
- [ ] Colección `instituciones` (DT-09) para validar `institucion_id`.
- [ ] Riesgo: la ruta de verificación con el token en la URL puede filtrarse por `Referer`. Mitigación: `Referrer-Policy: no-referrer` en las pantallas de token y enviar el token por POST.

## 16. Checklist de plan listo (`status: ready`)
- [ ] Cada CA y RN de la spec tiene diseño y estrategia de prueba.
- [ ] Colecciones con `collection:` explícito, validaciones y `schemaVersion` (no aplica).
- [ ] Cada índice justificado por una consulta o regla (no aplica).
- [ ] Decisión de transacciones coherente con replica set (DT-02) (no aplica).
- [ ] Endpoints y contratos completos (contrato de configuración y de script).
- [ ] Sin tecnologías fuera de la arquitectura aprobada.
- [ ] Ningún ID (`RN`/`CA`/`RNF`) citado aquí falta en la spec; `scripts/sdd-validate.ps1 -Id HT-CORE-01` sin `[FALLA]`.
- [ ] DEC-05..DEC-11 del Bloque B aprobadas o reemplazadas (DT-04); DEC-09 (Mailpit) aprobada expresamente o descartada.
- [ ] `spec.md` en `ready`.

## 17. Registro de cambios
No borrar decisiones ni contenido aprobado: las decisiones superadas se marcan «reemplazada por DEC-NN»; lo obsoleto se tacha con su motivo.

| Fecha | Cambio | Motivo (CA/RN/spec §14) | Estado previo → nuevo |
|---|---|---|---|
| 2026-10-22 | Creación con `/sdd-spec` | — | — → draft |
| 2026-10-22 | Creación con `/sdd-spec` | — | — → draft |
| 2026-10-22 | Fusión de HT-AUTH-01 como Bloque B (IDs renumerados; las subsecciones §9.4–§9.7 son las antiguas §9.1–§9.4 de HT-AUTH-01) | spec §14 | draft → draft |
| 2026-10-22 | Plan aprobado por el responsable. | Confirmación en sesión | draft → ready |
| 2026-10-28 | Fase 0B: estructura `apps/backend`/`apps/frontend` (DEC-12..DEC-15), §9.8, endpoint de health, CA-21 y RN-20 en §12; rutas del Bloque B renombradas. Aprobado por el responsable en la misma instrucción | spec §14 | ready → ready |
