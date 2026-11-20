---
id: HT-AUTH-03
spec: ./spec.md
status: ready            # draft | ready  (solo el desarrollador marca ready)
owner: JhonDc
updated: 2026-11-17
---

# HT-AUTH-03 — Plan técnico

> **plan.md describe CÓMO se construye lo definido en `spec.md`.** Respeta `specs/000-architecture/architecture.md` y las skills `project-architecture` y `mongodb-mongoose`.
> Persistencia exclusiva: MongoDB + Mongoose. No PostgreSQL, Prisma ni MySQL.
> Generado por `/sdd-spec` como propuesta y aprobado por el responsable (JhonDc) el 2026-11-11. Las decisiones de §14 están **aprobadas**.

## 1. Resumen técnico
Se agregan al backend NestJS cuatro módulos: `admin-users` (aprobación de cuentas sobre la colección existente `usuarios`), `instituciones` y `pruebas` (catálogos mínimos, DEC-03 y DEC-04), `answer-keys` (CRUD de `claves_respuesta` con estados BORRADOR/PUBLICADA y concurrencia optimista) y `manual-review` (esquema, regla y servicio de la casilla «Verificada»; el endpoint productivo se integra en OMR-002). Un `AdminAuditService` registra las acciones en `auditoria_admin`. En el frontend se crea un `AppShell` con `Sidebar` para las rutas privadas y las pantallas de usuarios y claves, más el componente `VerifiedCheckbox`. Sin transacciones multi-documento: toda escritura es atómica de un solo documento (DT-02 sigue standalone).

## 2. Arquitectura
### 2.1 Componentes afectados
| Componente | Ruta | Cambio |
|---|---|---|
| API NestJS | `apps/backend/src/admin-users/` | Nuevo: listado de pendientes y aprobación |
| API NestJS | `apps/backend/src/pruebas/` | Nuevo (DEC-04): esquema, listado y alta mínima |
| API NestJS | `apps/backend/src/instituciones/` | Nuevo (DEC-03): esquema, listado de solo lectura y comando de siembra idempotente |
| API NestJS | `apps/backend/src/answer-keys/` | Nuevo: CRUD de claves |
| API NestJS | `apps/backend/src/manual-review/` | Nuevo: esquema, DTO, regla y servicio de verificación (endpoint en OMR-002, DEC-07) |
| API NestJS | `apps/backend/src/audit/` | Nuevo `AdminAuditService` + esquema `auditoria_admin` |
| API NestJS | `apps/backend/src/common/http/problem.ts` | Nuevo `ProblemType.CONFLICTO` (`conflicto`, 409) |
| Migraciones | `apps/backend/migrations/003-ht-auth-03-indices.ts`, `004-seed-instituciones-dev.ts` | Índices de §4; siembra de instituciones solo de desarrollo (DEC-03) |
| CLI | `apps/backend/src/cli/crear-institucion.ts` (`pnpm instituciones:crear --nombre`) | Alta idempotente de instituciones en producción (DEC-03) |
| Frontend React | `apps/frontend/src/app/` | `AppShell` y rutas privadas nuevas (`routes.ts`, `router.tsx`, `PRIVATE_ROUTES`) |
| Frontend React | `apps/frontend/src/features/navigation/` | `Sidebar`, `nav-items.ts` |
| Frontend React | `apps/frontend/src/features/admin-users/` | Panel de usuarios |
| Frontend React | `apps/frontend/src/features/answer-keys/` | Listado, editor y grilla |
| Frontend React | `apps/frontend/src/features/manual-review/` | `VerifiedCheckbox` |
| Worker BullMQ / Motor OMR | — | No aplica: sin colas ni cambios en `apps/omr` |

### 2.2 Flujo técnico
```
React (AppShell + Sidebar) ──► NestJS
   ├─ AdminUsersController ──► AdminUsersService ──► usuarios (findOneAndUpdate condicional)
   ├─ PruebasController ─────► PruebasService ─────► pruebas
   ├─ AnswerKeysController ──► AnswerKeysService ──► claves_respuesta (version optimista)
   ├─ (OMR-002) ManualReviewController ► ManualReviewService ► resoluciones_manuales
   └─ todos ──► AdminAuditService ──► auditoria_admin
Guards existentes: JwtAuthGuard → RolesGuard; alcance con InstitutionScopePolicy (RN-13).
```

### 2.3 Módulos y responsabilidades
| Módulo / clase | Responsabilidad | Reglas (RN) que implementa |
|---|---|---|
| `AdminUsersController` | Rutas `/api/v1/admin/usuarios`, `@Roles('ADMIN')` | RN-01 |
| `AdminUsersService.listPending` | Pendientes paginados, proyección sin secretos | RN-01 |
| `AdminUsersService.approve` | `findOneAndUpdate({_id, estado:'PENDIENTE_APROBACION'})`, valida rol institucional, institución y autoaprobación; `runValidators` para RN-15 de HT-AUTH-01 | RN-02, RN-03, RN-04 |
| `nav-items.ts` + `Sidebar` | Opciones filtradas por rol; `RequireRole` en rutas | RN-05 |
| `AnswerKeysService` | Crear, editar (con `version`), publicar, eliminar, listar | RN-06, RN-07, RN-08, RN-09, RN-10, RN-11, RN-12, RN-14 |
| `answer-key.rules.ts` | Funciones puras: `isComplete`, `missingQuestions`, `resize(respuestas, n)` | RN-08, RN-10 |
| `InstitutionScopePolicy` (existente) | Filtro `institucion_id` en cada consulta de pruebas y claves | RN-13 |
| `ManualReviewService.resolve` | Exige valor resuelto para `verificada: true`; nunca la establece por defecto | RN-15, RN-16 |
| `AdminAuditService` | Inserta eventos de auditoría | RN-17 |
| `VerifiedCheckbox` | Deshabilitada sin valor resuelto; desmarcada por defecto | RN-16 |

## 3. Colecciones y esquemas MongoDB / Mongoose

### 3.1 `usuarios` (existente — sin cambio de esquema)
- No se agregan campos ni cambia `schemaVersion` (sigue en 1). Solo se agrega la operación de aprobación.
- Actualización: `{ $set: { estado: 'ACTIVA', rol, institucion_id } }` con filtro `{ _id, estado: 'PENDIENTE_APROBACION' }` y `runValidators: true`. Como el validador `pre('validate')` de RN-15 no se ejecuta en `findOneAndUpdate`, el servicio llama a `roleInstitutionViolation('ACTIVA', rol, institucionId)` antes de actualizar.
- PII: `nombre`, `correo_normalizado` (se devuelven solo al ADMIN en el listado; nunca en logs ni auditoría).

### 3.2 `instituciones` (DEC-03)
- Clase `InstitucionSchema` · `@Schema({ collection: 'instituciones', timestamps: { createdAt: 'creado_en', updatedAt: 'actualizado_en' } })`.

| Campo | Tipo Mongoose | Requerido | Validación | Referencia | PII |
|---|---|---|---|---|---|
| `_id` | ObjectId | sí | | | no |
| `schemaVersion` | Number | sí | `default: 1` | | no |
| `nombre` | String | sí | `trim`, `minlength: 1`, `maxlength: 200` | | no |
| `activa` | Boolean | sí | `default: true` | | no |

- **Institución por defecto (T-34, ajuste del 2026-11-14):** al arrancar la API con `NODE_ENV=development`, si `instituciones` está vacía, `InstitucionPorDefectoLifecycle` (`OnApplicationBootstrap`) crea «Institución Educativa Demo» con el upsert idempotente de `crearInstitucion`. No actúa con `test` (cada suite siembra sus instituciones) ni en producción, donde las altas siguen siendo controladas con `instituciones:crear` (DEC-03). Un fallo se registra y no detiene el arranque.

### 3.3 `pruebas` (DEC-04)
- Alta por ADMIN y COORDINADOR (DEC-06); el COORDINADOR solo en su institución, el ADMIN indica `institucionId`.
- Clase `PruebaSchema` · `@Schema({ collection: 'pruebas', timestamps: { createdAt: 'creado_en', updatedAt: 'actualizado_en' } })`.
- Referencia a institución (no embebido): la prueba se lista y filtra por institución.

| Campo | Tipo Mongoose | Requerido | Validación | Referencia | PII |
|---|---|---|---|---|---|
| `_id` | ObjectId | sí | | | no |
| `schemaVersion` | Number | sí | `default: 1` | | no |
| `institucion_id` | ObjectId | sí | | `Institucion` | no |
| `nombre` | String | sí | `trim`, `minlength: 1`, `maxlength: 200` | | no |
| `creado_por` | ObjectId | sí | | `Usuario` | no |

### 3.4 `claves_respuesta`
- Clase `ClaveRespuestaSchema` · `@Schema({ collection: 'claves_respuesta', timestamps: { createdAt: 'creado_en', updatedAt: 'actualizado_en' }, optimisticConcurrency: true, versionKey: 'version' })`.
- **Respuestas embebidas** como arreglo: se leen y escriben siempre junto con la clave, su tamaño está acotado (RN-08) y la publicación exige ver el arreglo completo de forma atómica.
- `institucion_id` se copia de la prueba al crear (desnormalizado) para filtrar por alcance sin consultar `pruebas` (RN-13).

| Campo | Tipo Mongoose | Requerido | Validación | Referencia | PII |
|---|---|---|---|---|---|
| `_id` | ObjectId | sí | | | no |
| `schemaVersion` | Number | sí | `default: 1` | | no |
| `institucion_id` | ObjectId | sí | | `Institucion` | no |
| `prueba_id` | ObjectId | sí | | `Prueba` | no |
| `fecha` | Date | sí | normalizada a 00:00 UTC (solo día) | | no |
| `sesion` | String | sí | `enum: SESIONES = ['SESION_1','SESION_2']` (spec §12) | | no |
| `materia` | String | sí | `enum: ['MAT','CN','CC','LC','ING']` | | no |
| `cantidad_preguntas` | Number | sí | entero, `min: 1`, `max: MAX_PREGUNTAS = 100` (RN-08) | | no |
| `respuestas` | [String \| null] | sí | cada elemento `enum: ['A','B','C','D', null]`; `length === cantidad_preguntas` (validador) | | no |
| `estado` | String | sí | `enum: ['BORRADOR','PUBLICADA']`, `default: 'BORRADOR'` | | no |
| `creado_por` | ObjectId | sí | | `Usuario` | no |
| `actualizado_por` | ObjectId | sí | | `Usuario` | no |
| `publicada_en` | Date | no | `default: null`; requerido si `PUBLICADA` | | no |
| `publicada_por` | ObjectId | no | `default: null`; requerido si `PUBLICADA` | `Usuario` | no |
| `version` | Number | sí | clave de versión de Mongoose (concurrencia optimista) | | no |

Validador de documento: si `estado === 'PUBLICADA'`, ningún elemento de `respuestas` es `null` (RN-10).

### 3.5 `auditoria_admin`
- Clase `AuditoriaAdminSchema` · `@Schema({ collection: 'auditoria_admin', timestamps: { createdAt: 'creado_en', updatedAt: false }, strict: 'throw' })`. Solo inserción (mismo criterio que `auditoria_auth`).
- Colección separada de `auditoria_auth` para no mezclar eventos de autenticación con acciones de negocio ni cambiar su esquema (DEC-05).

| Campo | Tipo Mongoose | Requerido | Validación | Referencia | PII |
|---|---|---|---|---|---|
| `_id` | ObjectId | sí | | | no |
| `schemaVersion` | Number | sí | `default: 1` | | no |
| `evento` | String | sí | `enum: ['CUENTA_APROBADA','PRUEBA_CREADA','CLAVE_CREADA','CLAVE_ACTUALIZADA','CLAVE_PUBLICADA','CLAVE_ELIMINADA','MARCA_VERIFICADA']` | | no |
| `actor_id` | ObjectId | sí | | `Usuario` | no |
| `recurso_tipo` | String | sí | `enum: ['usuario','prueba','clave_respuesta','resolucion_manual']` | | no |
| `recurso_id` | ObjectId | sí | | | no |
| `institucion_id` | ObjectId | no | `default: null` | `Institucion` | no |
| `detalle` | Mixed | no | solo campos no personales (p. ej. `{rol}`, `{estado_anterior, estado_nuevo}`, `{cantidad_preguntas}`) | | no |
| `correlation_id` | String | no | `maxlength: 128` | | no |

### 3.6 `resoluciones_manuales` (DEC-07 — esquema en esta historia; índices y endpoint en OMR-002)
- Clase `ResolucionManualSchema` · `@Schema({ collection: 'resoluciones_manuales', timestamps: { createdAt: 'creado_en', updatedAt: 'actualizado_en' } })`.
- Referencia a la lectura de OMR-002 (aún sin colección definida); un documento por marca dudosa.

| Campo | Tipo Mongoose | Requerido | Validación | Referencia | PII |
|---|---|---|---|---|---|
| `_id` | ObjectId | sí | | | no |
| `schemaVersion` | Number | sí | `default: 1` | | no |
| `institucion_id` | ObjectId | sí | | `Institucion` | no |
| `lectura_id` | ObjectId | sí | | lectura de OMR-002 | no |
| `numero_pregunta` | Number | sí | entero `min: 1` | | no |
| `materia` | String | sí | `enum` de materias | | no |
| `estado_leido` | String | sí | `enum: ['UNCERTAIN','MULTIPLE']` | | no |
| `valor_resuelto` | String | no | `enum: ['A','B','C','D','BLANK', null]`, `default: null` | | no |
| `verificada` | Boolean | sí | `default: false` | | no |
| `verificada_por` | ObjectId | no | requerido si `verificada` | `Usuario` | no |
| `verificada_en` | Date | no | requerido si `verificada` | | no |

Validador de documento: `verificada === true` ⇒ `valor_resuelto !== null` (RN-16).

## 4. Índices
| Colección | Índice (campos y orden) | Tipo | `partialFilterExpression` | Consulta o regla que respalda |
|---|---|---|---|---|
| `usuarios` | `ix_usuarios_estado_creado` `{ estado: 1, creado_en: 1 }` | compuesto | — | Listado de pendientes ordenado por fecha (CA-01) |
| `pruebas` | `ux_pruebas_institucion_nombre` `{ institucion_id: 1, nombre: 1 }` | único, collation `es` strength 2 | — | Sin pruebas homónimas por institución; listado (CA-06) |
| `claves_respuesta` | `ux_claves_identidad` `{ institucion_id: 1, prueba_id: 1, fecha: 1, sesion: 1, materia: 1 }` | único | — | RN-07, CA-08 |
| `claves_respuesta` | `ix_claves_institucion_estado_fecha` `{ institucion_id: 1, estado: 1, fecha: -1 }` | compuesto | — | Listado filtrado por alcance y estado (CA-11) |
| `auditoria_admin` | `ix_auditoria_admin_recurso` `{ recurso_tipo: 1, recurso_id: 1, creado_en: -1 }` | compuesto | — | Historial de un recurso (CA-14) |
| `resoluciones_manuales` | `ux_resolucion_marca` `{ lectura_id: 1, materia: 1, numero_pregunta: 1 }` | único | — | Una resolución por marca (RN-16) — se crea con OMR-002 |
| `resoluciones_manuales` | `ix_resolucion_pendientes` `{ institucion_id: 1, verificada: 1 }` | parcial | `{ verificada: false }` | Cola de pendientes (RN-15) — se crea con OMR-002 |
| `instituciones` | `ux_instituciones_nombre` `{ nombre: 1 }` | único, collation `es` strength 2 | — | Siembra idempotente sin duplicados (DEC-03, CA-02) |

## 5. Consistencia y transacciones
- ¿Atomicidad entre varios documentos? **No.** Cada operación escribe un único documento de negocio; la auditoría se inserta después.
- Las transacciones multi-documento requieren replica set y la instancia local es standalone (DT-02): **no se usan**.
- Estrategias:
  - Aprobación: `findOneAndUpdate` condicional sobre `estado` → si devuelve `null` y el documento existe, 409 (RN-04).
  - Claves: índice único `ux_claves_identidad` → E11000 se traduce a 409 `conflicto` (CA-08). Edición con `version` enviado por el cliente: `updateOne({ _id, version, estado: 'BORRADOR' }, { $set, $inc: { version: 1 } })`; `matchedCount === 0` → 409 (RN-14, RN-11).
  - Publicación: `updateOne({ _id, version, estado: 'BORRADOR', respuestas: { $not: { $elemMatch: { $eq: null } } } }, { $set: { estado: 'PUBLICADA', ... } })`: la completitud se comprueba en el mismo filtro atómico.
  - Eliminación: `deleteOne({ _id, estado: 'BORRADOR', ...alcance })`.
- Auditoría fuera de la escritura principal: si la inserción falla se registra un error con `correlationId` y la operación de negocio no se revierte (riesgo aceptado en DEC-05; sin outbox mientras DT-02 siga pendiente).

## 6. Archivos (GridFS)
- No aplica: la historia no almacena archivos.

## 7. Scripts de migración y versionado
Runner `MigrationRunner` (`HT-AUTH-01/DEC-12`).

| Script | Colección | `schemaVersion` origen → destino | Acción | Reversión | Idempotente |
|---|---|---|---|---|---|
| `003-ht-auth-03-indices.ts` | `usuarios`, `instituciones`, `pruebas`, `claves_respuesta`, `auditoria_admin` | — (colecciones nuevas en v1; `usuarios` sin cambio) | Crear los índices de §4 excepto los de `resoluciones_manuales` | `dropIndex` de cada índice creado | sí (`createIndex` con la misma especificación) |
| `004-seed-instituciones-dev.ts` (solo desarrollo y pruebas) | `instituciones` | — → 1 | Upsert de las instituciones A y B con los ObjectId que ya usan las cuentas de `002-seed-roles-dev`; se niega en producción | Borra los documentos con `seed: true` | sí (`$setOnInsert` por `_id`) |
| (en OMR-002) | `resoluciones_manuales` | — → 1 | Índices de §3.6 | `dropIndex` | sí |

## 8. Endpoints
Errores en `application/problem+json`. Todas las rutas requieren `JwtAuthGuard`; las que cambian estado llevan `@OriginProtected()` (`HT-AUTH-01/DEC-20`). Roles según DEC-06: «Lectura» = ADMIN, COORDINADOR, DOCENTE; «Edición» = ADMIN, COORDINADOR.

| Método | Path | Rol | Request | Response | Códigos | Idempotencia | CA |
|---|---|---|---|---|---|---|---|
| GET | `/api/v1/admin/usuarios?estado=PENDIENTE_APROBACION&pagina&limite` | ADMIN | query | `{ items: UsuarioPendienteDto[], total }` | 200/400/401/403 | sí | CA-01 |
| POST | `/api/v1/admin/usuarios/:id/aprobar` | ADMIN | `AprobarCuentaDto` | `UsuarioAprobadoDto` | 200/400/401/403/404/409 | no (2.ª vez → 409) | CA-02, CA-03 |
| GET | `/api/v1/instituciones` | ADMIN | — | `InstitucionDto[]` | 200/401/403 | sí | CA-02 |
| GET | `/api/v1/pruebas` | Lectura | `?institucionId` (solo ADMIN) | `PruebaDto[]` | 200/401/403 | sí | CA-06 |
| POST | `/api/v1/pruebas` | Edición | `CrearPruebaDto` | `PruebaDto` | 201/400/401/403/409 | no | CA-06 |
| GET | `/api/v1/claves-respuesta` | Lectura | `?pruebaId&fecha&sesion&materia&estado&pagina&limite` | `{ items: ClaveResumenDto[], total }` | 200/400/401/403 | sí | CA-11 |
| GET | `/api/v1/claves-respuesta/:id` | Lectura | — | `ClaveRespuestaDto` | 200/401/403/404 | sí | CA-11 |
| POST | `/api/v1/claves-respuesta` | Edición | `CrearClaveDto` | `ClaveRespuestaDto` (BORRADOR) | 201/400/401/403/404/409 | no (duplicado → 409) | CA-06, CA-07, CA-08 |
| PUT | `/api/v1/claves-respuesta/:id` | Edición | `ActualizarClaveDto` (incluye `version`) | `ClaveRespuestaDto` | 200/400/401/403/404/409 | sí con la misma `version` | CA-07, CA-09, CA-10 |
| POST | `/api/v1/claves-respuesta/:id/publicar` | Edición | `{ version }` | `ClaveRespuestaDto` (PUBLICADA) | 200/401/403/404/409/422 | no | CA-10 |
| DELETE | `/api/v1/claves-respuesta/:id?version=` | Edición | — | — | 204/401/403/404/409 | sí (2.ª vez → 404) | CA-10, CA-12 |
| PATCH | `/api/v1/revision-manual/marcas/:id` | ADMIN, COORDINADOR | `ResolverMarcaDto` | `ResolucionManualDto` | 200/400/401/403/404/409 | sí | Contrato reservado; se implementa en OMR-002 (DEC-07). En esta historia CA-13 se verifica en servicio y componente |

Códigos: 404 también para recursos de otra institución (RN-13); 409 `conflicto` para estado no pendiente, duplicado, versión desactualizada o clave publicada; 422 `clave-incompleta` con `preguntasFaltantes: number[]` al publicar incompleta.

## 9. Contratos de datos
### 9.1 DTOs y validación
Clases concretas con `class-validator` y `ValidationPipe` global (`HT-AUTH-01/DEC-21`).
```ts
export const MATERIAS = ['MAT', 'CN', 'CC', 'LC', 'ING'] as const;
export const OPCIONES_CLAVE = ['A', 'B', 'C', 'D'] as const;
export const SESIONES = ['SESION_1', 'SESION_2'] as const;
export const MAX_PREGUNTAS = 100;

export class AprobarCuentaDto {
  @IsIn(['COORDINADOR', 'DOCENTE']) rol!: 'COORDINADOR' | 'DOCENTE';   // RN-03
  @IsMongoId() institucionId!: string;
}

export class CrearClaveDto {
  @IsMongoId() pruebaId!: string;
  @IsISO8601({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/) fecha!: string; // solo día
  @IsIn(SESIONES) sesion!: Sesion;                                     // 'SESION_1' | 'SESION_2'
  @IsIn(MATERIAS) materia!: Materia;
  @IsInt() @Min(1) @Max(MAX_PREGUNTAS) cantidadPreguntas!: number;
  @IsArray() @ArrayMaxSize(MAX_PREGUNTAS)
  @ValidateIf((_, v) => v !== null, { each: true }) @IsIn(OPCIONES_CLAVE, { each: true })
  respuestas!: (OpcionClave | null)[];                                 // length === cantidadPreguntas (validador de clase)
}

export class ActualizarClaveDto {
  @IsInt() @Min(0) version!: number;
  @IsInt() @Min(1) @Max(MAX_PREGUNTAS) cantidadPreguntas!: number;
  @IsArray() /* igual que CrearClaveDto */ respuestas!: (OpcionClave | null)[];
}

export class ResolverMarcaDto {
  @IsIn(['A', 'B', 'C', 'D', 'BLANK']) @IsOptional() valorResuelto?: 'A' | 'B' | 'C' | 'D' | 'BLANK';
  @IsBoolean() verificada!: boolean;                                   // true exige valorResuelto (RN-16)
}
```
Prueba, fecha, sesión y materia no cambian en `ActualizarClaveDto`: cambiarlas equivale a otra clave (RN-07).

### 9.2 Eventos y jobs
No aplica: sin colas ni eventos (DT-06 no se toca).

### 9.3 Tipos compartidos frontend ↔ backend
No hay paquete compartido (DT-01 abierto). El frontend declara los tipos en `features/*/api/types.ts` y replica `MATERIAS` y `OPCIONES_CLAVE`; una prueba unitaria en cada lado fija los valores (como `shared-enums.spec.ts`).

## 10. Dependencias
| Tipo | Dependencia | Estado | Impacto si no está lista |
|---|---|---|---|
| Historia | HT-AUTH-01 (guards, `usuarios`, alcance) | En `develop` | — |
| Historia | HT-AUTH-02 (sesión y rutas privadas en el frontend) | En `develop` (in-review) | — |
| Historia | OMR-002 (lecturas dudosas) | pending spec | No bloquea: el endpoint y los índices de `resoluciones_manuales` se trasladan a OMR-002 (DEC-07) |
| Historia | HU-EVAL-002 (claves versionadas) | pending spec | Separada: corregirá y versionará claves publicadas; deberá migrar `ux_claves_identidad` si agrega versión |
| Técnica transversal | DT-09 entidades base (instituciones, pruebas) | Pendiente | No bloquea: DEC-03 y DEC-04 crean catálogos mínimos compatibles con la futura administración completa |
| Técnica transversal | DT-02 replica set | Pendiente | No bloquea: diseño sin transacciones (§5) |
| Técnica transversal | DT-04 RBAC (permisos de COORDINADOR) | Parcial | No bloquea: DEC-06 define los permisos de COORDINADOR sobre claves y pruebas |
| Técnica transversal | DT-07 migraciones | Resuelta | — |
| Librería nueva | Ninguna | — | — |

## 11. Seguridad
- **Autenticación y RBAC:** `JwtAuthGuard` + `RolesGuard`. `/admin/usuarios/*` con `@Roles('ADMIN')`. El principal se relee de `usuarios` en cada solicitud (HT-AUTH-01), de modo que una cuenta recién aprobada no requiere token nuevo para el rol, pero sí iniciar sesión.
- **Autoaprobación:** `approve` rechaza `id === principal.id` (409/403) aunque la cuenta propia no pueda estar pendiente (defensa en profundidad, `DEC-11`).
- **Alcance:** `InstitutionScopePolicy.scoped()` en todo filtro de `pruebas`, `claves_respuesta` y `resoluciones_manuales`; fuera de alcance → 404 (RN-13).
- **CSRF:** rutas que cambian estado con `@OriginProtected()`.
- **PII:** el listado de pendientes devuelve nombre y correo solo al ADMIN; logs con `RedactingLogger`; `auditoria_admin` sin nombre ni correo (`strict: 'throw'`).
- **Auditoría:** §3.5; retención pendiente (igual que `auditoria_auth`, DT-04).
- **Frontend:** el `Sidebar` y `RequireRole` solo mejoran la experiencia; la autorización real es del backend (RN-05).
- Validación de archivos: no aplica.

## 12. Estrategia de pruebas
Integración contra MongoDB 7 de Compose con base aislada por suite (`HT-AUTH-01/DEC-13`). Datos sembrados sin datos personales reales.

| CA / RN | Nivel | Caso | Herramienta | Datos de prueba |
|---|---|---|---|---|
| CA-01, RN-01 | integración API | ADMIN lista solo PENDIENTE_APROBACION sin `password_hash`; DOCENTE/COORDINADOR → 403; sin sesión → 401 | Jest + Supertest | 1 cuenta por estado |
| CA-02, RN-02 | integración API | Aprobar → ACTIVA con rol e institución; luego login OK; evento `CUENTA_APROBADA` | Jest + Supertest | cuenta pendiente |
| CA-03, RN-03 | integración API | rol ADMIN → 400; sin institución → 400; cuenta ACTIVA → 409; autoaprobación → rechazo; no ADMIN → 403; id inexistente → 404 | Jest + Supertest | varias |
| RN-04 | integración MongoDB | Dos `approve` en paralelo: exactamente uno OK y otro 409 | Jest | cuenta pendiente |
| CA-04, RN-05 | componente + E2E | Opciones por rol; `aria-current` en la actual; URL de opción no permitida → redirección y 403 de la API | Vitest + Testing Library; Playwright | sesión simulada por rol |
| CA-05, RNF-01 | E2E | Navegación solo teclado; viewport 375 px con botón de menú; axe sin infracciones serious/critical | Playwright + axe-core | — |
| CA-06, RN-08 | unit + componente | `resize()` conserva respuestas y recorta; grilla de N filas; aviso al reducir N | Jest; Vitest | N = 1, 25, 5→3 |
| CA-07, RN-06, RN-09 | unit + integración API | `E`, `BLANK`, `MULTIPLE`, `UNCERTAIN`, materia `FIS`, N = 0, N = 1.5, `respuestas.length ≠ N` → 400; validador de esquema | Jest + Supertest | — |
| CA-08, RN-07 | integración MongoDB | Segunda clave con la misma identidad → 409 (E11000); misma identidad en otra institución → 201 | Jest + Supertest | 2 instituciones |
| CA-09, RN-14 | integración API | PUT con `version` vigente → 200 y `version+1`; con `version` vieja → 409 sin cambios | Jest + Supertest | borrador |
| CA-10, RN-10, RN-11 | integración API | Publicar completa → PUBLICADA con `publicada_por/en`; incompleta → 422 con `preguntasFaltantes`; PUT/DELETE sobre PUBLICADA → 409 | Jest + Supertest | — |
| CA-11, RN-13 | integración API | DOCENTE de inst. A no ve claves de B en listado; GET por id de B → 404; ADMIN ve ambas; filtros por materia/estado | Jest + Supertest | 2 instituciones |
| CA-12, RN-12 | integración API | DELETE de borrador → 204 y evento; segunda vez → 404 | Jest + Supertest | — |
| CA-13, RN-15, RN-16 | unit + componente + integración MongoDB del esquema | Casilla deshabilitada sin valor; habilitada tras elegir; nunca marcada por defecto; servicio rechaza `verificada: true` sin valor; validador de esquema | Vitest; Jest | marcas simuladas UNCERTAIN/MULTIPLE |
| CA-14, RN-17 | integración MongoDB | Cada acción inserta un evento con actor y recurso; `strict: 'throw'` rechaza un campo `correo` | Jest | — |
| E2E crítico | E2E | ADMIN aprueba cuenta → DOCENTE inicia sesión → crea, edita y publica clave | Playwright | seed |
| RNF-02 | estático | `tsc --noEmit` strict y lint en backend y frontend | tsc, ESLint | — |

- Índices únicos probados con inserciones duplicadas (CA-08, `ux_pruebas_institucion_nombre`).
- Migración 003 ejecutada dos veces sin efecto y revertida.
- Sin pruebas de transacciones (no se usan).

## 13. Observabilidad y rendimiento
- Logs con `correlationId` (existente) para aprobar, publicar y eliminar; sin PII.
- Métricas: contador de aprobaciones y de publicaciones (reutilizando `observability`), opcional.
- Volumen: no hay RNF de volumen respaldado. Listados paginados (`limite` máx. 100) apoyados por los índices de §4. Tamaño del documento de clave acotado por `MAX_PREGUNTAS`.

## 14. Decisiones técnicas
| ID | Decisión | Alternativas consideradas | Motivo | Fecha |
|---|---|---|---|---|
| DEC-01 | *(aprobada)* Aprobación con `findOneAndUpdate` condicional sobre `estado` | Leer + guardar; transacción | Atómico en un documento; sin replica set (RN-04) | 2026-11-11 |
| DEC-02 | *(aprobada)* Respuestas de la clave embebidas como arreglo en `claves_respuesta` | Colección `respuestas_clave` por pregunta | Lectura/escritura conjunta, tamaño acotado, publicación atómica | 2026-11-11 |
| DEC-03 | *(aprobada)* Catálogo mínimo `instituciones` (solo lectura por API, alta por comando de siembra idempotente) | Esperar DT-09; ObjectId libre sin validar | Aprobar exige institución (HT-AUTH-01 RN-15) y no existe catálogo | 2026-11-11 |
| DEC-04 | *(aprobada)* Catálogo mínimo `pruebas` por institución con listado y alta | Esperar historia de exámenes; texto libre en la clave | «Selección» del nombre exige una lista; texto libre impide la unicidad de RN-07 | 2026-11-11 |
| DEC-05 | *(aprobada)* Colección nueva `auditoria_admin` en lugar de ampliar `auditoria_auth`; inserción posterior sin outbox | Ampliar `auditoria_auth` (cambio de esquema y `strict`); outbox (requiere DT-02) | Separa dominios; no toca una colección aprobada | 2026-11-11 |
| DEC-06 | *(aprobada)* Claves y pruebas: ADMIN y COORDINADOR crean/editan/publican/eliminan; DOCENTE solo consulta; ADMIN y COORDINADOR revisan marcas dudosas | Todos los roles institucionales con permisos completos | Publicar afecta la calificación; pendiente de definir permisos de COORDINADOR (DT-04) | 2026-11-11 |
| DEC-07 | *(aprobada)* `resoluciones_manuales` como colección propia ligada a la lectura de OMR-002; en esta historia esquema, servicio, DTO y componente; endpoint e índices trasladados a OMR-002 | Campo `verificada` dentro de la lectura OMR | La colección de lecturas aún no existe; evita fijar el esquema de OMR-002 | 2026-11-11 |
| DEC-08 | *(aprobada)* Concurrencia optimista con `version` en `claves_respuesta` | Último en guardar gana | Evitar pérdida silenciosa de cambios (RN-14) | 2026-11-11 |
| DEC-09 | *(aprobada)* `AppShell` con `Sidebar` envuelve solo las rutas privadas; las pantallas de autenticación de HT-AUTH-02 no cambian | Menú global | No altera flujos aprobados de HT-AUTH-02 | 2026-11-11 |

## 15. Riesgos y OPEN QUESTIONS técnicas
- [x] ~~DEC-03 y DEC-04 (DT-09)~~ **Resuelta:** aprobadas el 2026-11-11.
- [x] ~~Valores de `SESIONES` y `MAX_PREGUNTAS`~~ **Resuelta:** `SESION_1`/`SESION_2` y 100 (spec §12).
- [x] ~~DEC-06 (roles sobre claves)~~ **Resuelta:** aprobada el 2026-11-11.
- [x] ~~Corrección de claves PUBLICADA y solapamiento con HU-EVAL-002~~ **Resuelta:** solo consulta aquí; HU-EVAL-002 separada. Riesgo aceptado: si HU-EVAL-002 introduce versiones, deberá migrar `ux_claves_identidad`.
- [x] ~~Esquema de OMR-002 frente a `resoluciones_manuales`~~ **Resuelta:** DEC-07 aprobada. Riesgo aceptado: OMR-002 puede ajustar el esquema (`schemaVersion` 1 → 2 con migración).
- [x] ~~Auditoría perdida si falla la inserción posterior~~ **Resuelta:** riesgo aceptado (DEC-05) mientras DT-02 siga pendiente.
- [x] ~~Tamaño de la historia~~ **Resuelta:** historia única con un PR (spec §12).

## 16. Checklist de plan listo (`status: ready`)
- [x] Cada CA y RN de la spec tiene diseño y estrategia de prueba.
- [x] Colecciones con `collection:` explícito, validaciones y `schemaVersion`.
- [x] Cada índice justificado por una consulta o regla.
- [x] Decisión de transacciones coherente con replica set (DT-02).
- [x] Endpoints y contratos completos.
- [x] Sin tecnologías fuera de la arquitectura aprobada.
- [x] Ningún ID (`RN`/`CA`/`RNF`) citado aquí falta en la spec; `scripts/sdd-validate.ps1 -Id HT-AUTH-03` sin `[FALLA]`.
- [x] `spec.md` en `ready`.

## 17. Registro de cambios
| Fecha | Cambio | Motivo (CA/RN/spec §14) | Estado previo → nuevo |
|---|---|---|---|
| 2026-11-11 | Creación con `/sdd-spec` | spec §14 | — → draft |
| 2026-11-11 | Decisiones DEC-01..DEC-09 aprobadas; `SESIONES` y `MAX_PREGUNTAS` fijados; roles de §8 concretados; endpoint de verificación e índices de `resoluciones_manuales` trasladados a OMR-002; DT-09 y DT-04 dejan de bloquear; §15 resuelta; checklist §16 completo | spec §12 y §14 (decisión de JhonDc) | draft → ready |
| 2026-11-11 | **Ajustes de implementación** (`/sdd-implement`, sin cambio de comportamiento de la spec): (1) §3.5 agrega el evento `PRUEBA_CREADA` y el recurso `prueba` (el alta de pruebas de DEC-04 también se audita, RN-17); (2) §2.1 y §7: migración `004-seed-instituciones-dev` y comando `instituciones:crear` materializan la «siembra controlada» de DEC-03; (3) aprobar exige una institución existente y activa (400 `institucionVigente`), y crear una prueba con una institución ajena responde 404 (RN-13); (4) `ManualReviewService`: una marca ya verificada no se modifica (409), para que la confirmación de RN-16 no cambie en silencio; (5) frontend: `/inicio` pasa a mostrarse dentro de `AppShell` y el cierre de sesión de HT-AUTH-02 se mueve al menú lateral (CA-04); las rutas nuevas viven en `APP_ROUTES`, separadas de `ROUTES` de autenticación; el controlador de sesión expone `request` para `/api/v1` sin sacar el token (HT-AUTH-02 RN-02); (6) pruebas: el arnés E2E acepta la lista de migraciones y `migrations.int-spec.ts` (HT-AUTH-01) se acota a 001 y 002. Pendiente de confirmación del responsable en la revisión del PR | Implementación de HT-AUTH-03 | ready → ready |
| 2026-11-14 | **Ajuste pedido por JhonDc** (sin cambio de CA): §3.2 agrega la institución por defecto al arrancar en desarrollo con el catálogo vacío (T-34), para que el ADMIN pueda dar de alta pruebas en una base limpia; complementa la siembra controlada de DEC-03 sin reemplazarla. Además, T-33 corrige el frontend para enviar `institucionId` en el alta de pruebas del ADMIN, como ya decía §3.3. Pendiente de confirmación del responsable en la revisión del PR | Reporte y pedido de JhonDc (2026-11-14) | ready → ready |
| 2026-11-17 | **Confirmación del responsable** de los ajustes de implementación pendientes, como decisiones ya implementadas y sin cambios nuevos de código ni de CA: entrada del 2026-11-11, ajustes (1) a (6), **aprobados** (los ajustes (5) y (6) modificaron archivos de HT-AUTH-02 y de las pruebas de HT-AUTH-01; se informará en el Pull Request para su revisión); entrada del 2026-11-14, corrección T-33 (`institucionId` en el alta de pruebas del ADMIN) **aprobada**, e institución por defecto en desarrollo (T-34, §3.2) **aceptada como funcionalidad opcional de desarrollo ya existente** | Decisión de JhonDc (2026-11-17) | ready → ready |
