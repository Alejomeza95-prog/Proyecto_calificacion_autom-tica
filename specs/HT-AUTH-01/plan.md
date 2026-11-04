---
id: HT-AUTH-01
spec: ./spec.md
status: draft            # draft | ready  (solo el desarrollador marca ready)
owner: JulianD27-ia
updated: 2026-11-02
---

# HT-AUTH-01 — Plan técnico

> **plan.md describe CÓMO se construye lo definido en `spec.md`.** Respeta `specs/000-architecture/architecture.md` y las skills `project-architecture`, `mongodb-mongoose`, `typescript-strict-mode`, `clean-code-solid` y `testing-quality`.
> Persistencia exclusiva: MongoDB + Mongoose. No PostgreSQL, Prisma ni MySQL.
> **Todas las DEC-NN de esta historia son propuestas** hasta que el responsable las apruebe; la columna «Estado» de §14 lo indica. Lo único ya aprobado y fusionado viene de HT-CORE-01 (estructura `apps/backend`/`apps/frontend`, su DEC-12).

## 1. Resumen técnico
Módulos NestJS `users`, `auth`, `security-tokens`, `sessions`, `mail`, `audit` y `authz` en `apps/backend`, con persistencia en MongoDB mediante Mongoose (colecciones `usuarios`, `tokens_seguridad`, `sesiones` y `auditoria_auth`) y limitación de intentos con contadores en Redis. La consistencia se apoya en índices únicos y operaciones atómicas de un documento, sin transacciones (DT-02 sin resolver). La propuesta de sesión es un JWT de acceso corto con identificador de sesión revocable, más un token de renovación opaco en una cookie `HttpOnly` (DEC-01). Tanto el JWT como la renovación se validan contra la versión de credenciales de la cuenta (DEC-10). El correo se envía en el mismo proceso, después de responder y sin persistir el token (DEC-09). El primer administrador se crea con un comando de consola del backend, sin ruta HTTP (DEC-08). En `apps/frontend`, la feature `auth` contiene las 7 pantallas, el guardia de rutas privadas y el estado de sesión basado en `GET /auth/me`.

Parte de los esqueletos de HT-CORE-01, ya en `develop` (PR #1, `baf777d`): NestJS con prefijo global `api/v1`, React + Vite, TypeScript estricto, Jest y Vitest.

## 2. Arquitectura
### 2.1 Componentes afectados
| Componente | Ruta | Cambio |
|---|---|---|
| API NestJS | `apps/backend/src/users/` | Esquema `usuarios`, repositorio y servicio de cuentas y estados. |
| API NestJS | `apps/backend/src/auth/` | Controlador `/api/v1/auth/*`, servicios de registro, login, verificación y recuperación, y DTOs. |
| API NestJS | `apps/backend/src/security-tokens/` | Emisión, hash, invalidación y consumo atómico de tokens. |
| API NestJS | `apps/backend/src/sessions/` | Sesiones revocables y emisión y validación de credenciales de sesión. |
| API NestJS | `apps/backend/src/mail/` | Puerto `MailSender`, adaptador SMTP, adaptador en memoria y plantillas. |
| API NestJS | `apps/backend/src/audit/` | Escritura de `auditoria_auth` con redacción de secretos. |
| API NestJS | `apps/backend/src/authz/` | `JwtAuthGuard`, `RolesGuard`, decoradores `@Roles()` y `@Public()`, catálogo `Role` y política de alcance por institución. |
| API NestJS | `apps/backend/src/common/rate-limit/` | Limitador por IP, cuenta y ventana sobre Redis. |
| Consola del backend | `apps/backend/src/cli/bootstrap-admin.ts` + script `pnpm bootstrap:admin` | Inicialización del primer administrador (DEC-08). Sin controlador HTTP. |
| Frontend React | `apps/frontend/src/features/auth/` | 7 pantallas, cliente API, estado de sesión y `RequireAuth`. |
| Compose (solo local) | `docker-compose.yml` | Servicio de captura de correo para desarrollo (DEC-05, propuesta). |
| Plantilla de entorno | `.env.docker.example` + `docs/onboarding/02-variables-entorno.md` | Variables nuevas con marcadores (§9.4). |
| Motor OMR / workers | — | No aplica. |

### 2.2 Flujo técnico
```
React (features/auth) ──► NestJS AuthController ──► AuthService ──► UsersService ──► MongoDB usuarios
                                │  RateLimitGuard (Redis)        ├──► SecurityTokensService ──► tokens_seguridad
                                │                                ├──► SessionsService ──────► sesiones
                                │                                ├──► MailDispatcher (en proceso, tras responder) ──► SMTP (local: captura)
                                │                                └──► AuditService ─────────► auditoria_auth
Rutas privadas ──► JwtAuthGuard (sid vigente + versión de credenciales + usuario ACTIVO, leídos de MongoDB)
                   ──► RolesGuard + InstitutionScopePolicy (rol e institución del documento, no del JWT) ──► controlador
/auth/refresh  ──► SessionsService.rotate (sesión vigente + misma versión de credenciales + usuario ACTIVO)
Consola: pnpm bootstrap:admin ──► BootstrapAdminService ──► usuarios + tokens_seguridad (ACTIVAR_CUENTA) + MailSender
```

### 2.3 Módulos y responsabilidades
| Módulo / clase | Responsabilidad | Reglas (RN) que implementa |
|---|---|---|
| `UsersService` / `AccountStatus` (enum compartido) | Estados y transiciones de cuenta; creación sin rol ni institución; asignación desde la invitación | RN-01, RN-02 |
| `EmailNormalizer` | `trim` + minúsculas (NFC) del correo antes de guardarlo y buscarlo | RN-03 |
| `RegisterDto` (whitelist + `forbidNonWhitelisted: false`, propiedades extra descartadas) | El cuerpo público no transporta rol ni institución | RN-02 |
| `AuthService.register / forgot / resend / login` | Respuesta idéntica en todos los casos; tiempo de respuesta equilibrado (hash ficticio si no existe la cuenta) | RN-04, RN-07 |
| `PasswordHasher` (Argon2id) + `PasswordPolicy` | Hash y verificación; política de longitud mínima | RN-05 |
| `SecurityTokensService` | 32 bytes de `crypto.randomBytes`, SHA-256 del token, invalidación de los anteriores y consumo atómico con verificación de expiración | RN-06 |
| `SessionsService` | Crear, validar, rotar y revocar sesiones; revocar todas al restablecer; rechazar la renovación si cambió la versión de credenciales o la cuenta no está ACTIVA | RN-08, RN-11, RN-16 |
| `RateLimitGuard` | Contadores por `ip`, `cuenta` (hash del correo normalizado) y ruta | RN-09 |
| `JwtAuthGuard`, `RolesGuard`, `InstitutionScopePolicy` | Autenticación, rol y alcance por institución en el backend. El principal (rol, institución, estado y versión) se lee del documento `usuarios`, no de los claims | RN-07, RN-10, RN-15, RN-16 |
| `Role` + `ROLE_SCOPE` (catálogo de spec §8.1) | Roles válidos, si exigen institución y su alcance; un solo lugar para el catálogo | RN-15 |
| `BootstrapAdminService` + comando de consola | Crear el primer ADMIN o reemitir su enlace de activación; negarse si existe un ADMIN ACTIVO | RN-14 |
| `AuditService` | Eventos sin secretos; correo enmascarado si hace falta | RN-12 |
| `LinkBuilder` | URL desde `APP_PUBLIC_URL` (lista permitida), nunca desde cabeceras de la solicitud | RN-13 |
| `MailService` + `MailDispatcher` | Plantillas de verificación, reenvío, restablecimiento, activación y aviso de cambio; envío en proceso después de responder; nunca registra ni persiste el enlace | RN-06, RN-08, RN-13 |

## 3. Colecciones y esquemas MongoDB / Mongoose
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
| `rol` | String | no | `enum: Role` = `['ADMIN', 'COORDINADOR', 'DOCENTE']` (propuesta, spec §8.1), `default: null` | | no |
| `institucion_id` | ObjectId | no | `default: null`. Validador de documento: obligatorio si `estado = ACTIVA` y `rol ∈ {COORDINADOR, DOCENTE}`; `null` si `rol = ADMIN` (RN-15) | `ref: 'Institucion'` (DT-09; sin validación de existencia en esta historia) | no |
| `origen` | String | sí | `enum: ['AUTORREGISTRO', 'INVITACION', 'BOOTSTRAP']` | | no |
| `correo_verificado_en` | Date | no | | | no |
| `ultimo_acceso_en` | Date | no | | | no |
| `credenciales_actualizadas_en` | Date | sí | `default: Date.now` | | no |
| `version_credenciales` | Number | sí | `default: 0`, `min: 0`; se incrementa con `$inc` al restablecer o activar la contraseña y al dejar de estar ACTIVA (DEC-10) | | no |
| `creado_en` / `actualizado_en` | Date | sí | timestamps | | no |

Validación de dominio adicional en `UsersService` (no solo en Mongoose): una cuenta no pasa a ACTIVA sin `rol`, y nunca se escribe `rol` ni `institucion_id` desde un DTO público.

### 3.2 `tokens_seguridad`
- Clase: `TokenSeguridadSchema` · `@Schema({ collection: 'tokens_seguridad', timestamps: { createdAt: 'creado_en', updatedAt: false } })`

| Campo | Tipo Mongoose | Requerido | Validación | Referencia | PII |
|---|---|---|---|---|---|
| `_id` | ObjectId | sí | | | no |
| `schemaVersion` | Number | sí | `default: 1` | | no |
| `usuario_id` | ObjectId | sí | | `ref: 'Usuario'` | no |
| `proposito` | String | sí | `enum: ['VERIFICAR_CORREO', 'RESTABLECER_PASSWORD', 'ACTIVAR_CUENTA']` | | no |
| `token_hash` | String | sí | SHA-256 hex, `length: 64`, `select: false`; `toJSON` lo elimina | | secreto |
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
| `refresh_hash` | String | sí | SHA-256 del token de renovación vigente; `select: false`; `toJSON` lo elimina | | secreto |
| `refresh_hash_anterior` | String | no | SHA-256 del token rotado inmediatamente antes, para detectar reutilización; `select: false`; `toJSON` lo elimina | | secreto |
| `version_credenciales` | Number | sí | Copia de `usuarios.version_credenciales` al crear la sesión (DEC-10) | | no |
| `expira_en` | Date | sí | | | no |
| `revocada_en` | Date | no | `default: null` | | no |
| `motivo_revocacion` | String | no | `enum: ['LOGOUT', 'RESET_PASSWORD', 'ADMIN', 'REUTILIZACION', 'CUENTA_NO_ACTIVA']` | | no |

La rotación actualiza el mismo documento (el `sid` no cambia), por lo que `ROTACION` deja de ser un motivo de revocación. Ningún endpoint ni log devuelve documentos de `sesiones` o `tokens_seguridad`. Las consultas que necesitan los hashes los piden de forma explícita (`.select('+refresh_hash')`), solo dentro de `SessionsService` y `SecurityTokensService`.

### 3.4 `auditoria_auth`
- Clase: `AuditoriaAuthSchema` · `@Schema({ collection: 'auditoria_auth', timestamps: { createdAt: 'creado_en', updatedAt: false } })`. Solo inserción.

| Campo | Tipo Mongoose | Requerido | Validación | Referencia | PII |
|---|---|---|---|---|---|
| `_id` | ObjectId | sí | | | no |
| `schemaVersion` | Number | sí | `default: 1` | | no |
| `evento` | String | sí | `enum: AuthEvent` (REGISTRO, VERIFICACION, REENVIO, LOGIN_OK, LOGIN_FALLIDO, LOGOUT, RECUPERACION_SOLICITADA, PASSWORD_RESTABLECIDO, LIMITE_EXCEDIDO, ACCESO_DENEGADO, SESION_RENOVADA, RENOVACION_RECHAZADA, REUTILIZACION_DETECTADA, ADMIN_INICIALIZADO, ADMIN_INICIALIZACION_RECHAZADA, CUENTA_ACTIVADA, CORREO_NO_ENVIADO) | | no |
| `usuario_id` | ObjectId | no | null si la cuenta no existe | `ref: 'Usuario'` | no |
| `resultado` | String | sí | `enum: ['OK', 'RECHAZADO']` | | no |
| `ip_hash` | String | no | HMAC de la IP con `AUDIT_IP_PEPPER` | | seudónimo |
| `correlation_id` | String | no | | | no |

**Embebido o referencia:** los tokens y las sesiones se referencian (crecen y caducan de forma independiente al usuario). No hay arreglos embebidos sin límite.

## 4. Índices
| Colección | Índice (campos y orden) | Tipo | `partialFilterExpression` | Consulta o regla (RN/CA) que respalda |
|---|---|---|---|---|
| `usuarios` | `{ correo_normalizado: 1 }` | único | — | RN-03, CA-02 (duplicados y carreras) |
| `tokens_seguridad` | `{ token_hash: 1 }` | único | — | Búsqueda en el consumo; CA-04, CA-09 |
| `tokens_seguridad` | `{ usuario_id: 1, proposito: 1 }` | compuesto | `{ usado_en: null, invalidado_en: null }` | Invalidar los anteriores del mismo propósito (RN-06, CA-06, CA-10) |
| `tokens_seguridad` | `{ expira_en: 1 }` | TTL `expireAfterSeconds: 86400` | — | Solo limpieza, un día después de expirar. La expiración lógica se comprueba en la consulta (RN-06) |
| `sesiones` | `{ usuario_id: 1 }` | compuesto | `{ revocada_en: null }` | Revocar todas al restablecer (RN-08, CA-09) |
| `usuarios` | `{ origen: 1 }` | único | `{ origen: 'BOOTSTRAP' }` | A lo sumo una cuenta de inicialización, incluso con dos ejecuciones simultáneas del comando (RN-14, CA-13) |
| `usuarios` | `{ rol: 1, estado: 1 }` | compuesto | — | Comprobar si existe un ADMIN ACTIVO antes de inicializar (RN-14) |
| `sesiones` | `{ refresh_hash: 1 }` | único | — | Renovación de sesión (DEC-01, CA-09, CA-12) |
| `sesiones` | `{ refresh_hash_anterior: 1 }` | simple | `{ refresh_hash_anterior: { $type: 'string' } }` | Detectar la reutilización de un token rotado (DEC-01, RN-11) |
| `sesiones` | `{ expira_en: 1 }` | TTL `expireAfterSeconds: 0` | — | Limpieza de sesiones vencidas |
| `auditoria_auth` | `{ usuario_id: 1, creado_en: -1 }` | compuesto | — | Consulta de eventos por cuenta (RN-12). Sin TTL hasta definir la retención |

## 5. Consistencia y transacciones
- No se usan transacciones: la instancia es standalone (DT-02).
- **Registro (CA-02):** `insertOne` en `usuarios`. Un E11000 sobre `correo_normalizado` se captura y produce la **misma respuesta 202** que un registro nuevo. El índice único resuelve las carreras.
- **Emisión de token:** primero `updateMany({ usuario_id, proposito, usado_en: null, invalidado_en: null }, { $set: { invalidado_en: now } })` y después `insertOne`. Si falla la inserción, no queda ningún token válido; el usuario reintenta (estado compensatorio aceptable).
- **Consumo de token (CA-04, CA-09, CA-10):** `findOneAndUpdate({ token_hash, proposito, usado_en: null, invalidado_en: null, expira_en: { $gt: now } }, { $set: { usado_en: now } })` es atómico: dos usos simultáneos no pueden tener éxito.
- **Restablecimiento:** 1) consumir el token atómicamente; 2) `updateOne` con `$set` de `password_hash` y `credenciales_actualizadas_en` y `$inc: { version_credenciales: 1 }`; 3) `updateMany` de `sesiones` con `revocada_en` y motivo `RESET_PASSWORD`. Si fallan los pasos 2 o 3, el token ya está consumido y el usuario pide otro. Si el paso 2 se completa y el 3 falla, la revocación sigue siendo efectiva: `JwtAuthGuard` y `/refresh` comparan `sesiones.version_credenciales` con la de `usuarios`, y la sesión anterior ya no coincide (DEC-10). Se usa un contador entero en lugar de comparar `iat` (precisión de segundos) con una fecha en milisegundos, para evitar la ventana del mismo segundo.
- **Renovación (`/refresh`, RN-16):** 1) `findOne` de la sesión por `refresh_hash` con `revocada_en: null` y `expira_en > now`. Si no aparece por `refresh_hash` pero sí por `refresh_hash_anterior`, hay reutilización: se revoca la sesión con motivo `REUTILIZACION` y se responde 401. 2) Cargar el usuario: si `estado ≠ ACTIVA` o su `version_credenciales` ≠ la de la sesión, se revoca la sesión (motivo `CUENTA_NO_ACTIVA` o `RESET_PASSWORD`) y se responde 401 **sin emitir un JWT nuevo**. 3) Rotar de forma atómica con `findOneAndUpdate({ _id: sid, refresh_hash: h, revocada_en: null, version_credenciales: v }, { $set: { refresh_hash: nuevo, refresh_hash_anterior: h } })`. Si no coincide (otra pestaña rotó primero o cambió la versión), 401. Riesgo aceptado: dos pestañas que renuevan a la vez pueden provocar una detección de reutilización y cerrar la sesión (§15).
- **Cuenta que deja de estar ACTIVA** (bloqueo o desactivación, hecho por una historia posterior): se debe aplicar `$inc: { version_credenciales: 1 }` en la misma actualización. Esta historia deja el método `UsersService.changeStatus` preparado para eso y lo cubre con pruebas.
- **Verificación:** consumir el token y luego `updateOne({ _id, estado: 'PENDIENTE_VERIFICACION' }, { $set: { estado: PENDIENTE_APROBACION | ACTIVA*, correo_verificado_en } })` (*ACTIVA solo si el origen es una invitación con rol asignado en el servidor; DEC-07).
- **Inicialización del primer administrador (DEC-08):** 1) si existe un `usuarios` con `rol: 'ADMIN', estado: 'ACTIVA'`, se niega (código de salida ≠ 0, evento `ADMIN_INICIALIZACION_RECHAZADA`). 2) `insertOne` con `origen: 'BOOTSTRAP'`, `rol: 'ADMIN'`, `institucion_id: null`, `estado: 'PENDIENTE_VERIFICACION'` y un `password_hash` de un valor aleatorio descartado (no hay contraseña utilizable). El índice único parcial sobre `origen: 'BOOTSTRAP'` hace que una segunda ejecución simultánea falle con E11000. 3) Si ya existe la cuenta `BOOTSTRAP` sin activar y con el mismo correo normalizado, no se crea otra: se emite un token `ACTIVAR_CUENTA` nuevo (invalida el anterior). Si el correo es otro, se niega. 4) Se envía el enlace de activación.
- **Activación (`/auth/activate`):** consumir el token `ACTIVAR_CUENTA` atómicamente y luego `updateOne({ _id, estado: 'PENDIENTE_VERIFICACION', origen: 'BOOTSTRAP' }, { $set: { password_hash, correo_verificado_en: now, estado: 'ACTIVA', credenciales_actualizadas_en: now }, $inc: { version_credenciales: 1 } })`.

## 6. Archivos (GridFS)
No aplica: la historia no maneja archivos.

## 7. Scripts de migración y versionado
**Herramienta pendiente (DT-07; propuesta DEC-12).** Scripts propuestos:

| Script | Colección | `schemaVersion` origen → destino | Acción | Reversión | Idempotente |
|---|---|---|---|---|---|
| `001-auth-indices` | `usuarios`, `tokens_seguridad`, `sesiones`, `auditoria_auth` | — → 1 | `createCollection` + índices de §4 (`syncIndexes` controlado) | `dropIndex` de los índices creados (no borra datos) | sí |
| `002-seed-roles-dev` (solo dev/test) | `usuarios` | — → 1 | Cuentas de prueba ACTIVA por rol (ADMIN, COORDINADOR y DOCENTE de dos instituciones con ObjectId fijos), sin datos personales reales | Borrar por marcador `seed: true` | sí (upsert por correo) |

La inicialización del primer administrador **no** es una migración ni un seed: es un comando operativo (DEC-08) que se ejecuta una vez por entorno y nunca crea contraseñas. El seed `002` no se ejecuta fuera de dev/test: el script se niega si `NODE_ENV=production`.

## 8. Endpoints
Prefijo `/api/v1/auth` (prefijo global `api/v1` fijado por HT-CORE-01, DEC-15 de esa historia). Errores en `application/problem+json`.

| Método | Path | Rol | Request | Response | Códigos | Idempotencia | CA |
|---|---|---|---|---|---|---|---|
| POST | `/api/v1/auth/register` | público | `RegisterDto` | mensaje genérico | 202 / 400 / 422 / 429 | sí (correo único) | CA-01, CA-02, CA-03, CA-05 |
| POST | `/api/v1/auth/verify-email` | público | `{ token }` | `{ estado: 'PENDIENTE_APROBACION' \| 'ACTIVA' }` | 200 / 400 (inválido, vencido o usado, genérico) / 429 | sí (segundo uso = 400) | CA-04, CA-05, CA-10 |
| POST | `/api/v1/auth/resend-verification` | público | `{ correo }` | mensaje genérico | 202 / 400 / 429 | sí | CA-06, CA-10 |
| POST | `/api/v1/auth/login` | público | `{ correo, password }` | `{ accessToken, expiresIn }` + cookie de renovación | 200 / 401 genérico / 429 | no | CA-05, CA-07 |
| POST | `/api/v1/auth/refresh` | cookie | — | `{ accessToken, expiresIn }` | 200 / 401 / 403 (`Origin` ajeno) | rotación | CA-09, CA-12 (DEC-01, DEC-10) |
| POST | `/api/v1/auth/activate` | público | `ActivateAccountDto` | — | 204 / 400 (token genérico) / 422 (política) / 429 | sí (segundo uso = 400) | CA-13 |
| GET | `/api/v1/auth/me` | autenticado | — | `{ id, nombre, rol, institucionId, estado }` | 200 / 401 | sí | CA-05, CA-11 |
| POST | `/api/v1/auth/logout` | autenticado | — | — | 204 / 401 | sí | CA-12 |
| POST | `/api/v1/auth/password/forgot` | público | `{ correo }` | mensaje genérico | 202 / 400 / 429 | sí | CA-08, CA-10 |
| POST | `/api/v1/auth/password/reset` | público | `{ token, password }` | — | 204 / 400 (token genérico) / 422 (política) / 429 | sí (segundo uso = 400) | CA-03, CA-09, CA-10 |

Una ruta autenticada sin permiso por rol o institución responde 403 (CA-11).

**Sin endpoint:** la inicialización del primer administrador es un comando de consola, `pnpm --dir apps/backend bootstrap:admin --nombre "<nombre>" --correo <correo>` (o el equivalente dentro del contenedor `backend`). No acepta contraseña por argumento, variable ni entrada estándar, e imprime solo un resultado genérico (creado, reenviado o rechazado), nunca el enlace.

## 9. Contratos de datos
### 9.1 DTOs y validación
```ts
// RegisterDto — ValidationPipe({ whitelist: true }) descarta rol/institucion
class RegisterDto { nombre: string; correo: string; password: string; invitacion?: string }
// LoginDto { correo: string; password: string }
// EmailOnlyDto { correo: string }            // resend-verification, password/forgot
// TokenDto { token: string }                 // verify-email
// ResetPasswordDto { token: string; password: string }
// ActivateAccountDto { token: string; password: string }   // primer administrador (CA-13)
// MeResponse { id: string; nombre: string; rol: Role | null; institucionId: string | null; estado: AccountStatus }
// AccessTokenClaims { sub: string; sid: string; cv: number; iat: number; exp: number }  // sin rol ni institución (RN-15)
```
La biblioteca de validación (class-validator o Zod) se fija con DT-01 (skill `typescript-strict-mode`).

### 9.2 Eventos y jobs
**Primera versión: sin colas (DEC-09).** El envío de correo no usa BullMQ ni ningún almacenamiento persistente.

| Mecanismo | Productor | Consumidor | Contenido | Reintentos | Garantías |
|---|---|---|---|---|---|
| `MailDispatcher` en proceso (DEC-09) | `AuthService`, `BootstrapAdminService` | `MailSender` (SMTP o adaptador en memoria) | `{ plantilla, destinatario, enlace }` solo en memoria del proceso, y se descarta al terminar el envío | Ninguno automático; el fallo se audita como `CORREO_NO_ENVIADO`, sin enlace ni correo, y la persona pide otro enlace | El token crudo nunca se escribe en Redis, MongoDB ni logs (RN-06) |

- **Anti-enumeración con envío síncrono:** el controlador responde 202 antes de enviar y el envío se ejecuta después (`setImmediate` desacoplado de la respuesta). Además, todas las respuestas de `register`, `resend-verification` y `password/forgot` esperan un tiempo mínimo configurable (`AUTH_MIN_RESPONSE_MS`) para que el costo de Argon2 y de las consultas no distinga una cuenta existente de una inexistente.
- **Evolución futura con cola:** si DT-06 aprueba una cola, el job solo puede llevar `{ usuarioId, proposito }`. El worker emite el token (lo que invalida los anteriores) y envía el correo en el mismo paso, de modo que el token crudo tampoco se persiste. ~~Payload `{ plantilla, usuarioId, enlaceRef }` con el token crudo dentro del job en Redis~~ (descartado: contradice RN-06).

### 9.3 Tipos compartidos frontend ↔ backend
`AccountStatus`, `Role`, `MeResponse` y los DTOs de request en un paquete compartido si DT-01 lo aprueba; si no, se duplican en `apps/frontend/src/features/auth/types.ts` con una prueba de contrato.

### 9.4 Variables de entorno nuevas (solo marcadores en `.env.docker.example`)
`APP_PUBLIC_URL`, `JWT_ACCESS_SECRET`, `JWT_ACCESS_TTL=15m`, `SESSION_REFRESH_TTL=7d`, `VERIFY_TOKEN_TTL=24h`, `RESET_TOKEN_TTL=30m`, `ACTIVATION_TOKEN_TTL=24h`, `AUTH_MIN_RESPONSE_MS`, `RATE_LIMIT_*` (por ruta, IP y cuenta), `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`, `AUDIT_IP_PEPPER`. Todas se documentan en `docs/onboarding/02-variables-entorno.md` (regla del repositorio).

## 10. Dependencias
| Tipo | Dependencia | Estado | Impacto si no está lista |
|---|---|---|---|
| Historia | HT-CORE-01 (servicios locales y esqueletos `apps/backend`/`apps/frontend`) | **Fusionada en `develop`** el 2026-10-29 (PR #1, merge `baf777d`, cabeza `2740980`). Su spec sigue en `in-progress` (T-12 y T-46 abiertas) | Los esqueletos ya no bloquean. **Pendiente (no se modifica HT-CORE-01 aquí):** `develop` todavía contiene el Bloque B en `specs/HT-CORE-01/`; la separación del 2026-11-02 está sin confirmar en la copia local y debe llegar a `develop` antes del PR de esta historia o junto con él. |
| Rama | `feature/HT-AUTH-01` | No existe | Crearla desde `origin/develop` actualizado (≥ `baf777d`). El `develop` local está en `7156f5f` (desactualizado): `git fetch` y `git switch develop && git pull` antes de `git switch -c feature/HT-AUTH-01`. |
| Técnica transversal | DT-01 (creación de apps) | Parcial: estructura y esqueletos resueltos por HT-CORE-01; workspaces y tipos compartidos pendientes | No bloquea; afecta §9.3. |
| Técnica transversal | DT-04 (Auth y RBAC) | Pendiente | **Bloquea:** esta historia la materializa; requiere aprobar DEC-01..DEC-03, DEC-05..DEC-11 y el catálogo de roles (spec §8.1). |
| Técnica transversal | DT-05 (estrategia de pruebas) | Pendiente; propuesta DEC-13 | **Bloquea** §12 (framework E2E y MongoDB de integración). |
| Técnica transversal | DT-07 (migraciones) | Pendiente; propuesta DEC-12 | **Bloquea** la creación de índices fuera de pruebas (§7). |
| Técnica transversal | DT-06 (Redis + BullMQ) | Pendiente | **Ya no es dependencia** con DEC-09 (correo sin cola). Redis sigue siendo necesario para los límites (DEC-06), que HT-CORE-01 ya provee. |
| Técnica transversal | DT-09 (entidades base: institución) | Falta documento | **No bloquea esta historia:** el alcance se resuelve comparando `institucion_id` (ObjectId) entre la cuenta y el recurso; las pruebas usan dos ObjectId sembrados. **Sí bloquea** la historia de aprobación e invitaciones, que debe validar que la institución exista y esté vigente. DT-09 debe fijar: colección `instituciones` (nombre, estado, `schemaVersion`), si una cuenta puede pertenecer a varias instituciones (esta historia supone una) y qué pasa con las cuentas al desactivar una institución. |
| Técnica transversal | DT-02 (replica set) | Pendiente | No bloquea: el diseño evita las transacciones (§5). |
| Historia | HU-UX-001 (diseño de interfaz) | pending spec | No bloquea: las pantallas usan HTML semántico sin identidad visual (T-22). HU-UX-001 aplica después DESIGN.md y el estilo. |
| Librería nueva | `argon2` — hash Argon2id (RNF-01) | Propuesta | Sin alternativa en el stack. |
| Librería nueva | `@nestjs/jwt` + `@nestjs/passport` — JWT (la arquitectura indica JWT/OIDC) | Propuesta | — |
| Librería nueva | `@nestjs/throttler` con almacenamiento en Redis — límites (RN-09) | Propuesta | Alternativa: contadores propios con `INCR`/`EXPIRE` en Redis. |
| Librería nueva | `nodemailer` — SMTP | Propuesta | Depende del proveedor elegido. |
| Herramienta dev | Mailpit (contenedor solo en Compose local) — captura de correo | Propuesta DEC-05 | **Fuera de la arquitectura:** requiere aprobación. Alternativa sin Mailpit: adaptador en memoria expuesto solo en pruebas E2E. |
| Librería nueva | `@playwright/test` + `@axe-core/playwright` — E2E y accesibilidad | Propuesta DEC-13 | Depende de DT-05. |

## 11. Seguridad
- **Autenticación y RBAC:** `JwtAuthGuard` global con `@Public()` explícito en las rutas públicas. El guard comprueba la firma y la expiración del JWT, que el `sid` siga vigente en `sesiones`, que el claim `cv` sea igual a `sesiones.version_credenciales` y a `usuarios.version_credenciales`, y que el estado sea ACTIVA (DEC-10). Con eso construye el principal (`id`, `rol`, `institucionId`) **desde el documento `usuarios`**, no desde los claims, para que un cambio de rol o institución no deje privilegios viejos durante la vida del JWT (DEC-11). `RolesGuard` con `@Roles()` e `InstitutionScopePolicy` en el servicio: el `institucion_id` del recurso se compara con el del principal; ADMIN tiene alcance global (propuesta, spec §8.1); un COORDINADOR o DOCENTE sin institución se rechaza siempre. La otra institución responde 403 (o 404 para no revelar el recurso; a decidir). Costo: dos lecturas por índice de `_id` por solicitud, aceptable sin RNF de volumen.
- **Primer administrador (DEC-08):** solo por consola en el servidor. Sin endpoint, sin contraseña por argumento ni por variable de entorno, sin imprimir el enlace, idempotente y auditado. El enlace de activación es un token `ACTIVAR_CUENTA` de un solo uso (mismas garantías que RN-06). Ningún DTO público acepta `rol`, `institucion_id`, `estado` ni `origen` (whitelist).
- **Anti-enumeración:** respuestas y códigos idénticos y tiempo equilibrado (Argon2 sobre un hash ficticio cuando la cuenta no existe).
- **Contraseñas:** Argon2id con parámetros OWASP vigentes (`m=19456 KiB, t=2, p=1` como mínimo). Política: longitud de 12 a 128 sin reglas de composición.
- **Tokens:** 256 bits aleatorios, base64url en el enlace, SHA-256 en la base. El enlace lleva el token en el fragmento (`#token=`) o en la ruta del frontend, que lo envía por POST. Nunca va en query strings que acaben en logs de proxy.
- **Sesión (DEC-01):** JWT de acceso de 15 min solo en memoria del cliente. Token de renovación opaco de 256 bits en una cookie `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`, con rotación en cada uso y detección de reutilización (si reaparece un token ya rotado, se revoca la sesión). La cookie usa `Path=/api/v1/auth` porque `/logout` también necesita leerla para revocar la sesión: con el `Path` anterior (`/api/v1/auth/refresh`), el navegador no la enviaba a `/logout`. CSRF: `SameSite=Strict` y comprobación de `Origin` en `/refresh` y `/logout` (RNF-06).
- **Renovación e invalidación de credenciales (DEC-10, RN-16):** `/refresh` no emite un JWT nuevo si la sesión está revocada o vencida, si la cuenta no está ACTIVA o si `version_credenciales` cambió desde que se creó la sesión. Así, un restablecimiento invalida también las sesiones cuya revocación masiva haya fallado (§5).
- **Protección de los hashes de tokens:** `refresh_hash`, `refresh_hash_anterior` y `token_hash` llevan `select: false` y se eliminan en `toJSON`. Ningún DTO de respuesta los incluye, ningún endpoint devuelve documentos de `sesiones` ni `tokens_seguridad`, y el redactor de logs también enmascara las claves `*_hash`. La auditoría no guarda hashes. Con tokens de 256 bits, un hash filtrado no permite reconstruir el token. Endurecimiento opcional, no propuesto para la v1: HMAC con un secreto del servidor en lugar de SHA-256, para que una copia de la base sola no sirva ni para comparar tokens.
- **Logs:** redactor de Pino o del logger de NestJS que enmascara `password`, `token`, `authorization`, `cookie`, `correo` y las claves `*_hash`. Prohibido registrar los enlaces de correo.
- **Enlaces:** `LinkBuilder` solo usa `APP_PUBLIC_URL`, validada al arrancar contra una lista permitida. No hay parámetro `redirect` libre (RN-13).
- **PII:** `nombre` y `correo_normalizado` en `usuarios`. La auditoría guarda `usuario_id` y `ip_hash`, nunca el correo ni la IP en claro.
- **HTTPS:** obligatorio fuera de local (RNF-03). `Secure` en la cookie (en local, `localhost` se trata como contexto seguro).
- **Pantallas con token:** `Referrer-Policy: no-referrer` y envío del token por POST (§15).

## 12. Estrategia de pruebas
Herramientas (propuesta DEC-13, sujeta a DT-05): Jest + Supertest en la API y Vitest + Testing Library en web, **ya configurados en los esqueletos de HT-CORE-01**; MongoDB real de Compose con una base aislada por suite; Playwright para E2E con captura de correo (Mailpit, DEC-05, o adaptador en memoria) y `@axe-core/playwright` para accesibilidad (**nuevos, propuesta**).

| CA / RN | Nivel | Caso | Herramienta | Datos de prueba |
|---|---|---|---|---|
| CA-01 | E2E API + integración | Registro válido → `usuarios` con `estado=PENDIENTE_VERIFICACION`, `rol=null`, `institucion_id=null`, aunque el cuerpo incluya `rol: 'ADMIN'` | Supertest + MongoDB | Correos `@example.test` |
| CA-02 | Integración | 20 registros concurrentes con `" Ana@Example.test "` → 1 documento; las respuestas son byte a byte iguales a las de un correo nuevo | Supertest + `Promise.all` | — |
| CA-03 | Unit + integración | La política rechaza 11 caracteres y acepta una frase de 12; el documento tiene `$argon2id$`; la búsqueda de la contraseña en claro en la base y los logs capturados da 0 resultados | Jest, captura del logger | — |
| CA-04 | Integración | Token de 43 caracteres base64url; en la base solo está el SHA-256; usarlo con el reloj adelantado 24 h + 1 s → 400; el segundo uso → 400 | Jest con reloj falso | — |
| CA-05 | E2E API | Login con PENDIENTE_VERIFICACION, PENDIENTE_APROBACION, BLOQUEADA y DESACTIVADA → 401 genérico; verificar un autorregistro → PENDIENTE_APROBACION; registro con invitación sembrada → rol de la invitación | Supertest | Seed |
| CA-06 | Integración | El reenvío invalida el token anterior; el anterior → 400; correo inexistente → misma respuesta 202; el exceso → 429 | Supertest | — |
| CA-07 | E2E API | Correo inexistente, contraseña errónea y cuenta no ACTIVA → mismo 401 y mismo cuerpo; ACTIVA válida → 200 | Supertest | Seed |
| CA-08 | Integración | `forgot` con un correo existente y uno inexistente → mismo 202; solo el elegible genera un token de 30 min; los logs no contienen el token | Supertest + captura | — |
| CA-09 | E2E | `reset` → el token queda usado; el refresh de la sesión previa → 401; el JWT previo → 401; login con la nueva contraseña → 200 y con la anterior → 401; se envía el correo de aviso | Supertest | — |
| CA-10 | Integración | Dos consumos simultáneos del mismo token → exactamente 1 éxito; el límite por IP y por cuenta → 429 al superar el umbral | Supertest + Redis | — |
| CA-11 | E2E API | Matriz rol × ruta: un DOCENTE en una ruta de ADMIN → 403; un usuario de la institución A sobre un recurso de B → 403/404; sin token → 401; un cliente que envía `rol`/`institucion_id` en cualquier ruta pública no los obtiene | Supertest con un controlador de prueba protegido | Seed de 2 instituciones |
| CA-12 | E2E | `logout` → el JWT y la cookie de renovación quedan inválidos (401), y la cookie llega a `/logout` (su `Path` la cubre); `auditoria_auth` contiene LOGOUT y ningún documento de auditoría contiene `password`, `token`, hashes ni correo | Supertest + consulta Mongo | — |
| CA-13 | Integración + E2E API | Base sin ADMIN → el comando crea 1 cuenta `BOOTSTRAP` con `rol=ADMIN`, PENDIENTE_VERIFICACION y sin contraseña utilizable (login → 401); `activate` con el token → ACTIVA y login → 200; segundo uso del token → 400; dos ejecuciones simultáneas → 1 documento (E11000); con un ADMIN ACTIVO → el comando sale con código ≠ 0 y no cambia nada; reejecutar con la cuenta pendiente → token nuevo y el anterior → 400; la salida del comando no contiene el enlace; `register`, `verify-email` y `password/reset` con `rol: 'ADMIN'` en el cuerpo nunca producen un ADMIN | Jest + MongoDB, Supertest, captura de stdout | Correos `@example.test` |
| RN-01 | Unit | Tabla de transiciones válidas e inválidas de `AccountStatus` | Jest | — |
| RN-02 | E2E API | Igual que CA-01 + no existe ruta pública que acepte `rol` | Supertest | — |
| RN-03 | Unit + integración | `EmailNormalizer` + índice único (E11000) | Jest + MongoDB | — |
| RN-04 | E2E API | Comparación de estado y cuerpo en register, resend, forgot y login | Supertest | — |
| RN-05 | Integración | Igual que CA-03 + `GET /me` y `toJSON` sin `password_hash` | Jest | — |
| RN-06 | Integración | Igual que CA-04, CA-06 y CA-10 | Jest | — |
| RN-07 | E2E API | Igual que CA-05 y CA-07 + una cuenta ACTIVA que se BLOQUEA → su JWT vigente → 401 | Supertest | — |
| RN-08 | E2E | Igual que CA-09 | Supertest | — |
| RN-09 | Integración | Igual que CA-10 (IP, cuenta y ventana) | Supertest + Redis | — |
| RN-10 | E2E API | Igual que CA-11 | Supertest | — |
| RN-11 | E2E | Igual que CA-12 | Supertest | — |
| RN-12 | Integración | Escaneo de `auditoria_auth` y de los logs capturados con patrones de secretos | Jest | — |
| RN-13 | Unit | `LinkBuilder` ignora `Host` y `X-Forwarded-Host` maliciosos; arrancar con un `APP_PUBLIC_URL` fuera de la lista permitida falla | Jest | — |
| RN-14 | Integración + E2E API | Igual que CA-13; además, no existe ninguna ruta registrada en Nest que llame a `BootstrapAdminService` (inspección de las rutas del módulo) | Jest, Supertest | — |
| RN-15 | Unit + E2E API | Validador de `usuarios`: ACTIVA sin rol → rechazo; DOCENTE/COORDINADOR ACTIVO sin institución → rechazo; ADMIN con institución → rechazo. Cambiar `rol` o `institucion_id` en la base con un JWT vigente → la siguiente solicitud ya aplica los datos nuevos (el principal sale del documento) | Jest + MongoDB, Supertest | Seed de 2 instituciones |
| RN-16 | E2E API | Simular el fallo del paso 3 del restablecimiento (las sesiones no se revocan): `/refresh` con la cookie previa → 401 y no emite un JWT; el JWT previo → 401. Cuenta pasada a BLOQUEADA con `changeStatus` → `/refresh` → 401. Reutilizar un token de renovación ya rotado → 401 y la sesión queda revocada con motivo REUTILIZACION | Supertest + MongoDB | — |
| Hashes protegidos (§11) | Integración | Las respuestas de todos los endpoints y los logs capturados de toda la suite no contienen ningún valor de `refresh_hash`, `refresh_hash_anterior` ni `token_hash` presente en la base; `find()` sin `select('+…')` no los devuelve | Jest + escaneo | — |
| Correo sin persistencia (DEC-09) | Integración | Después de `register`, `resend-verification`, `password/forgot` y `bootstrap:admin`, ninguna clave de Redis ni ningún documento de MongoDB contiene el token crudo (búsqueda del valor capturado por el adaptador en memoria). Un fallo de SMTP → 202 igual y evento `CORREO_NO_ENVIADO` sin enlace | Jest + Redis `SCAN` + MongoDB | — |
| RNF-01 | Unit | El hash empieza por `$argon2id$` con los parámetros configurados | Jest | — |
| RNF-02 | Componente + E2E | Pegar en el campo contraseña funciona; `autocomplete="new-password"` y `current-password`; acepta una frase de 64 caracteres | Vitest + Playwright | — |
| RNF-03 | Revisión de despliegue | HSTS y redirección HTTPS en la configuración de despliegue (fuera de local) | Checklist de release | — |
| RNF-04 | Unit | Los TTL se leen de la configuración; si el valor no es válido, el arranque falla | Jest | — |
| RNF-05 | E2E + a11y | `axe` sin violaciones serias en las 7 pantallas; foco en el primer error; región `aria-live` anuncia los resultados; recorrido completo con teclado; vista móvil y 200 % de zoom | Playwright + axe | — |
| RNF-06 | E2E API | `/refresh` y `/logout` con un `Origin` ajeno → 403; cookie con `HttpOnly; Secure; SameSite=Strict` | Supertest | — |

- Índices únicos probados con inserciones duplicadas. Sin transacciones (no requieren replica set).
- El correo en las pruebas usa un adaptador en memoria (unit e integración) y Mailpit (E2E). Nunca se envía correo real.

## 13. Observabilidad y rendimiento
- Logs estructurados con `correlationId` por solicitud, con redacción (§11). Métricas: login OK/fallido, 429 por ruta y correos enviados y fallidos.
- Alerta sugerida: un pico de LOGIN_FALLIDO o LIMITE_EXCEDIDO por IP.
- Argon2id cuesta unos 50–100 ms por hash a propósito. Sin RNF de volumen en la spec.

## 14. Decisiones técnicas
Estado: **Propuesta** (pendiente de aprobación del responsable), **Aprobada** (con fecha y quién) o **Reemplazada**. A la fecha ninguna DEC de esta historia está aprobada.

| ID | Tema | Decisión | Alternativas consideradas | Motivo | Estado | Fecha |
|---|---|---|---|---|---|---|
| DEC-01 | Sesiones | JWT de acceso de 15 min (en memoria) con `sid` validado contra `sesiones`, más un token de renovación opaco rotativo en una cookie `HttpOnly` (`Path=/api/v1/auth`) | a) Sesión opaca solo en cookie; b) JWT sin estado en `localStorage` | La arquitectura indica JWT. El `sid` permite revocar (CA-09, CA-12) y la cookie `HttpOnly` evita exponer el token de renovación a XSS | **Propuesta** (DT-04) | 2026-10-22; `Path` corregido 2026-11-02 |
| DEC-02 | Contraseñas | Argon2id con el paquete `argon2` | bcrypt | Requisito RNF-01 | **Propuesta** | 2026-10-22 |
| DEC-03 | Tokens | Tokens de 256 bits, SHA-256 en la base (sin sal: la entropía alta lo hace innecesario) | Argon2 del token; HMAC con secreto del servidor (§11) | Búsqueda por índice único; el costo de Argon2 no aporta con 256 bits | **Propuesta** | 2026-10-22 |
| DEC-04 | Correo | ~~Envío de correo por la cola BullMQ `mail`~~ | Envío síncrono en la solicitud | Tiempo de respuesta uniforme y reintentos. **Descartada:** el job guardaba el token crudo en Redis, lo que contradice RN-06 | **Reemplazada por DEC-09** | 2026-10-22 → 2026-11-02 |
| DEC-05 | Correo (pruebas) | Mailpit en Compose solo para desarrollo y E2E | Adaptador en memoria; servicio externo de pruebas | Probar sin distribuir correos reales. **Tecnología fuera de la arquitectura: requiere aprobación expresa** | **Propuesta** | 2026-10-22 |
| DEC-06 | Límites | Límites de intentos con contadores en Redis | Contadores en MongoDB | Redis ya está en el stack; TTL nativo | **Propuesta** | 2026-10-22 |
| DEC-07 | Estados | La verificación deja ACTIVA solo las cuentas de invitación con rol asignado; el autorregistro queda en PENDIENTE_APROBACION | — | RN-01 y RN-02 | **Propuesta** | 2026-10-22 |
| DEC-08 | Primer administrador | Comando de consola `bootstrap:admin` que crea una única cuenta `BOOTSTRAP` con rol ADMIN sin contraseña utilizable y envía un enlace `ACTIVAR_CUENTA` (24 h); se niega si existe un ADMIN ACTIVO; sin endpoint HTTP | a) Consola interactiva que pide la contraseña sin eco y deja la cuenta ACTIVA con el correo marcado como verificado por el operador; b) variables de entorno `ADMIN_EMAIL`/`ADMIN_PASSWORD` al arrancar; c) endpoint protegido por un secreto de instalación | Prueba la posesión del correo, no expone contraseñas en el historial de la consola ni en variables, y reutiliza los tokens de un solo uso. (b) deja la contraseña en la configuración; (c) agrega superficie pública. Si el correo aún no funciona, (a) es la alternativa | **Propuesta** | 2026-11-02 |
| DEC-09 | Correo | Envío en el mismo proceso, después de responder (`setImmediate`), con un tiempo mínimo de respuesta (`AUTH_MIN_RESPONSE_MS`), sin cola ni persistencia del token. Si falla: se audita `CORREO_NO_ENVIADO` y la persona pide otro enlace | Cola BullMQ con el token en el job (DEC-04, descartada); cola en la que el worker emite el token (futuro, §9.2) | Primera versión simple, sin dependencia de DT-06 y coherente con RN-06. Se pierden los reintentos automáticos (riesgo aceptado, §15) | **Propuesta** | 2026-11-02 |
| DEC-10 | Sesiones | `version_credenciales` entera en `usuarios`, copiada en `sesiones` y en el claim `cv`. El guard y `/refresh` exigen igualdad; se incrementa al restablecer o activar la contraseña y al dejar de estar ACTIVA | Comparar `iat` con `credenciales_actualizadas_en` (plan anterior) | `iat` tiene precisión de segundos (ventana del mismo segundo) y no cubría `/refresh`, que emitía un JWT nuevo con `iat` posterior al cambio | **Propuesta** | 2026-11-02 |
| DEC-11 | RBAC | Catálogo `Role` = ADMIN (global), COORDINADOR y DOCENTE (por institución). El JWT no lleva rol ni institución: el principal se lee de `usuarios` en cada solicitud | Rol e institución como claims del JWT | Un cambio de rol, institución o estado se aplica en la siguiente solicitud, no al vencer el JWT (RN-15). Alcance global del ADMIN y existencia de COORDINADOR pendientes (spec §8.1) | **Propuesta** | 2026-11-02 |
| DEC-12 | Migraciones | Scripts TypeScript propios en `apps/backend/migrations/` ejecutados con un runner mínimo que registra lo aplicado en la colección `migraciones` (id, fecha, checksum); `up` y `down` idempotentes | `migrate-mongo`; `syncIndexes` al arrancar la app | Sin dependencias nuevas y con control explícito en entornos compartidos. Depende de la decisión transversal DT-07 | **Propuesta** (DT-07) | 2026-11-02 |
| DEC-13 | Pruebas | Jest + Supertest (API) y Vitest + Testing Library (web), ya presentes en los esqueletos; MongoDB de Compose con una base aislada por suite; Playwright + `@axe-core/playwright` para E2E y accesibilidad | `mongodb-memory-server`; Testcontainers; Cypress | Reutiliza lo que HT-CORE-01 ya configuró y prueba contra el mismo MongoDB 7 standalone. Depende de la decisión transversal DT-05 | **Propuesta** (DT-05) | 2026-11-02 |

## 15. Riesgos y OPEN QUESTIONS técnicas
- [x] ~~**HT-CORE-01 sin fusionar**~~ (resuelto: fusionada en `develop` el 2026-10-29, PR #1, `baf777d`).
- [ ] **Separación del Bloque B fuera de `develop`:** `develop` todavía contiene el Bloque B en `specs/HT-CORE-01/` (17 menciones) y no contiene `specs/HT-AUTH-01/`. Hay que llevar a `develop` los cambios del 2026-11-02 (separación en HT-CORE-01 y en `docs/`) antes de implementar, para no tener dos especificaciones vigentes. Esta revisión no modifica HT-CORE-01.
- [ ] **DT-04 bloqueante:** aprobar DEC-01, DEC-08, DEC-10 y DEC-11, el catálogo de roles (spec §8.1) y quién aprueba.
- [ ] **DT-05 y DT-07 bloqueantes:** aprobar DEC-13 y DEC-12 o sus alternativas.
- [ ] Proveedor de correo de producción y aprobación de Mailpit para local (DEC-05).
- [x] ~~¿La cola de correo (DEC-04) entra en esta historia?~~ Propuesta DEC-09: no; envío en proceso sin persistencia. Riesgo aceptado: sin reintentos automáticos, y un reinicio del proceso entre la respuesta y el envío pierde el correo (la persona pide otro enlace).
- [ ] Riesgo de la rotación del token de renovación: dos pestañas que renuevan a la vez pueden disparar la detección de reutilización y cerrar la sesión. Mitigación propuesta para el frontend: una sola renovación en curso (promesa compartida) y `BroadcastChannel` entre pestañas.
- [ ] Al cambiar rol, institución o estado desde la historia de aprobación (posterior), aplicar `$inc: { version_credenciales: 1 }` (DEC-10).
- [ ] Convención de nombres de campos en MongoDB (español snake_case, como se propuso, o camelCase).
- [ ] Recurso de otra institución: ¿403 o 404?
- [ ] Umbrales de los límites de intentos (por IP, cuenta y ventana) y política de BLOQUEADA por intentos fallidos.
- [ ] Retención de `auditoria_auth` (sin TTL hasta decidir).
- [ ] Colección `instituciones` (DT-09) para validar `institucion_id`: no bloquea esta historia (§10), sí la de aprobación.
- [ ] Riesgo: la ruta de verificación con el token en la URL puede filtrarse por `Referer`. Mitigación: `Referrer-Policy: no-referrer` en las pantallas de token y enviar el token por POST.
- [ ] DESIGN.md no existe y no se crea aquí: la identidad visual es de HU-UX-001. Las pantallas se construyen con HTML semántico y estilos mínimos del esqueleto (T-22).
- [ ] ¿Qué hacer si el correo de producción aún no funciona al instalar? DEC-08 alternativa (a).

## 16. Checklist de plan listo (`status: ready`)
- [ ] Cada CA y RN de la spec tiene diseño y estrategia de prueba.
- [ ] Colecciones con `collection:` explícito, validaciones y `schemaVersion`.
- [ ] Cada índice justificado por una consulta o regla.
- [ ] Decisión de transacciones coherente con replica set (DT-02).
- [ ] Endpoints y contratos completos.
- [ ] Sin tecnologías fuera de la arquitectura aprobada (DEC-05, Mailpit, aprobada expresamente o descartada).
- [ ] Ningún ID (`RN`/`CA`/`RNF`) citado aquí falta en la spec; `scripts/sdd-validate.ps1 -Id HT-AUTH-01` sin `[FALLA]`.
- [ ] DEC-01..DEC-03 y DEC-05..DEC-13 aprobadas o reemplazadas (DT-04, DT-05, DT-07); DEC-04 ya figura como reemplazada.
- [ ] La separación del Bloque B de HT-CORE-01 está en `develop`.
- [ ] `spec.md` en `ready`.

## 17. Registro de cambios
No borrar decisiones ni contenido aprobado: las decisiones superadas se marcan «reemplazada por DEC-NN»; lo obsoleto se tacha con su motivo.

| Fecha | Cambio | Motivo (CA/RN/spec §14) | Estado previo → nuevo |
|---|---|---|---|
| 2026-10-22 | Creación con `/sdd-spec` como HT-AUTH-01 | — | — → draft |
| 2026-10-22 | Fusionado en HT-CORE-01 como Bloque B (DEC-01..07 → DEC-05..11 de HT-CORE-01) | spec §14 | draft → (HT-CORE-01) |
| 2026-11-02 | Separado de HT-CORE-01 con la numeración original. Ajustes por el estado actual del repositorio: rutas `apps/backend`/`apps/frontend` y prefijo `api/v1` ya existentes (HT-CORE-01, Fase 0B), dependencia de HT-CORE-01 sin fusionar, §9.1–§9.4 según la plantilla, DESIGN.md pendiente. Sin cambios de diseño. Las aprobaciones obtenidas como Bloque B no se trasladan: queda en `draft` para revisión. | spec §14 | ready (Bloque B) → draft |
| 2026-11-02 | **Revisión técnica** (9 observaciones del responsable): §10 y §15 con el estado real de HT-CORE-01 (fusionada, PR #1) y la rama base; primer administrador (DEC-08, `/auth/activate`, índice parcial `BOOTSTRAP`, §5); catálogo de roles y principal leído de la base (DEC-11, §3.1, §11); correo sin cola ni token persistido (DEC-04 reemplazada por DEC-09, §9.2); DT-09 como no bloqueante con su relación con RBAC (§10); estado explícito de cada DEC y nuevas DEC-12 (migraciones) y DEC-13 (pruebas); renovación ligada a `version_credenciales` (DEC-10, §5, §11); hashes con `select: false` y escaneo; corrección del `Path` de la cookie para que `/logout` la reciba; pruebas de CA-13 y RN-14..RN-16 en §12. | spec §14 | draft → draft |
