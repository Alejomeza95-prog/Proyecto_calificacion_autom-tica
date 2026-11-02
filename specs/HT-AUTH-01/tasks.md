---
id: HT-AUTH-01
spec: ./spec.md
plan: ./plan.md
status: draft            # draft | ready | in-progress | in-review | done
updated: 2026-11-02
---

# HT-AUTH-01 — Tasks

Rama: `feature/HT-AUTH-01`, creada desde `origin/develop` actualizado (≥ `baf777d`, que ya incluye HT-CORE-01 por el PR #1). El `develop` local está desactualizado: traer `origin/develop` antes de crear la rama.

Reglas:
- Generado por `/sdd-spec` (en `draft`) junto con `spec.md` y `plan.md`. `/sdd-tasks` lo actualiza cuando cambian. Pasa a `ready` solo cuando spec y plan están en `ready` y la trazabilidad se valida (`scripts/sdd-validate.ps1 -Id HT-AUTH-01`).
- No se implementa con este archivo en `draft`. **Bloqueos:** separación del Bloque B de HT-CORE-01 llevada a `develop` (T-37), DT-04, DT-05 y DT-07 y las DEC propuestas (plan §10, §14 y §15).
- Cada tarea `T-NN` referencia al menos un `CA-NN`, `RN-NN` o `RNF-NN` y la sección del plan que implementa.
- Una tarea solo se marca `[x]` cuando su verificación pasa; registrar evidencia y commit. **La evidencia nunca incluye valores de `.env`, contraseñas, tokens crudos, enlaces de correo, URIs con credenciales ni datos personales reales.**
- Al actualizar: nunca borrar ni desmarcar tareas `[x]` ni su evidencia; no renumerar; las tareas obsoletas se tachan `~~T-NN~~ (obsoleta: motivo)`.

## Fase 0 — Preparación
| ID | Tarea | Cubre | Plan § | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|---|
| T-37 | Confirmar que `develop` contiene la separación del Bloque B (HT-CORE-01 con el Bloque B retirado y `specs/HT-AUTH-01/` presente) y crear `feature/HT-AUTH-01` desde `origin/develop` actualizado | Soporte: precondición de rama y de fuente única de verdad (CLAUDE.md, «Fuente de verdad») | §10, §15 | `git merge-base --is-ancestor baf777d HEAD` = 0; `sdd-validate.ps1 -Id HT-CORE-01` y `-Id HT-AUTH-01` sin `[FALLA]` en la rama | [ ]  **Parcial (2026-11-02):** `git fetch origin` → `origin/develop` = `baf777d`; `feature/HT-AUTH-01` creada con `git switch --no-track -c` desde `origin/develop` (`merge-base --is-ancestor baf777d HEAD` = 0), llevando la separación sin confirmar sin conflictos (árbol de `2740980` = `baf777d`). En la rama: HT-CORE-01 sin Bloque B vigente y ambos validadores sin `[FALLA]`. **Falta:** que la separación llegue a `develop` mediante el PR de esta rama. |

## Fase 1 — Datos (MongoDB / Mongoose)
| ID | Tarea | Cubre | Plan § | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|---|
| T-01 | Enums compartidos `AccountStatus`, `Role` (ADMIN, COORDINADOR, DOCENTE) con `ROLE_SCOPE` (global o institucional), `TokenPurpose` (incluye ACTIVAR_CUENTA) y `AuthEvent` | RN-01, RN-15 | §3.1, §2.3 | Unit: los valores coinciden con spec §7 y spec §8.1; `ROLE_SCOPE` cubre todos los roles | [ ] | |
| T-02 | Esquema `usuarios` con `collection` explícito, validaciones, `schemaVersion`, `version_credenciales`, origen `BOOTSTRAP`, validador rol/institución, `password_hash` con `select: false` y `toJSON` sin hash | RN-01, RN-02, RN-05, RN-15 | §3.1 | Integración: rechaza un estado fuera del enum; ACTIVA sin rol, DOCENTE ACTIVO sin institución y ADMIN con institución → rechazo; `toJSON` sin `password_hash` | [ ] | |
| T-03 | Esquemas `tokens_seguridad`, `sesiones` (con `refresh_hash_anterior` y `version_credenciales`) y `auditoria_auth`; hashes con `select: false` y fuera de `toJSON` | RN-06, RN-11, RN-12, RN-16 | §3.2, §3.3, §3.4, §11 | Integración: validaciones de esquema; `find()` sin `select('+…')` no devuelve hashes | [ ] | |
| T-04 | Índices de §4 (únicos, parciales y TTL), incluido el único parcial de `origen: 'BOOTSTRAP'` | CA-02, CA-13, RN-03, RN-06, RN-14 | §4 | Integración: un duplicado de `correo_normalizado`, de `token_hash` y una segunda cuenta `BOOTSTRAP` → E11000; `getIndexes()` coincide con §4 | [ ] | |
| T-05 | Script `001-auth-indices` idempotente con reversión y seed `002-seed-roles-dev` (sin datos personales reales) | RN-03, RN-10 | §7 | Ejecutar dos veces sin cambios; la reversión elimina solo los índices o el seed | [ ] | |

## Fase 2 — Dominio y servicios
| ID | Tarea | Cubre | Plan § | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|---|
| T-06 | `EmailNormalizer` y transiciones de `AccountStatus` en `UsersService`; `changeStatus` incrementa `version_credenciales` al salir de ACTIVA | RN-01, RN-03, RN-16 | §2.3, §5 | Unit: tabla de transiciones válidas e inválidas; normalización de mayúsculas y espacios; ACTIVA → BLOQUEADA incrementa la versión | [ ] | |
| T-07 | `PasswordHasher` (Argon2id) y `PasswordPolicy` (12–128, sin composición) | CA-03, RN-05, RNF-01, RNF-02 | §2.3, §11 | Unit: `$argon2id$`; 11 caracteres rechazado; frase de 12 aceptada | [ ] | |
| T-08 | `SecurityTokensService`: emitir (256 bits + SHA-256), invalidar los anteriores y consumir atómicamente con la expiración comprobada | CA-04, CA-10, RN-06, RNF-04 | §2.3, §5 | Integración: un token vencido, usado o invalidado → rechazado; consumo concurrente → 1 éxito | [ ] | |
| T-09 | `SessionsService`: crear (copiando `version_credenciales`), validar `sid`, rotar el token de renovación de forma atómica con detección de reutilización (`refresh_hash_anterior`), rechazar la renovación si la cuenta no está ACTIVA o cambió la versión, revocar una o todas | CA-09, CA-12, RN-08, RN-11, RN-16 | §2.3, §5, §11 | Integración: revocar todas → ninguna sesión vigente; reutilizar un token rotado → revoca con REUTILIZACION; versión distinta o cuenta BLOQUEADA → la rotación falla sin token nuevo | [ ] | |
| T-10 | `AuditService` con redacción, y redactor del logger (`password`, `token`, `cookie`, `authorization`, `correo`, claves `*_hash`) | CA-12, RN-12 | §3.4, §11 | Integración: escaneo de auditoría y logs capturados sin patrones de secretos ni hashes | [ ] | |
| T-11 | `LinkBuilder` con `APP_PUBLIC_URL` en lista permitida y validación de configuración (TTL y URL) al arrancar | RN-13, RNF-04 | §2.3, §9.4 | Unit: ignora `Host` malicioso; un `APP_PUBLIC_URL` no permitido hace fallar el arranque | [ ] | |
| T-12 | `MailService` (puerto + adaptador SMTP + adaptador en memoria), `MailDispatcher` en proceso después de responder (DEC-09), tiempo mínimo de respuesta `AUTH_MIN_RESPONSE_MS`, y plantillas de verificación, reenvío, restablecimiento, activación y aviso de cambio | CA-04, CA-08, RN-04, RN-06, RN-08, RN-13 | §2.1, §9.2 | Unit: las plantillas renderizan con el enlace de `LinkBuilder`; el log del envío no contiene el enlace; un fallo de SMTP se audita como `CORREO_NO_ENVIADO` sin enlace. Integración: tras enviar, ninguna clave de Redis ni documento de MongoDB contiene el token crudo | [ ] | |
| T-13 | `RateLimitGuard` con contadores en Redis por IP, cuenta y ruta | CA-06, CA-10, RN-09 | §2.3, §14 | Integración: superar el umbral → 429; la ventana se reinicia | [ ] | |

## Fase 3 — API / jobs
| ID | Tarea | Cubre | Plan § | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|---|
| T-14 | Configuración de `.env.docker.example` (solo marcadores) y `docs/onboarding/02-variables-entorno.md` con las variables de §9.4 | RNF-04, RN-13 | §9.4 | Revisión: claves de la tabla = plantilla; ningún valor real | [ ] | |
| T-15 | `POST /auth/register` (whitelist de DTO, E11000 → 202 idéntico, hash ficticio para equilibrar tiempos, uso de invitación desde el servidor) | CA-01, CA-02, CA-03, CA-05, RN-02, RN-04 | §8, §9.1, §5 | E2E API: el cuerpo con `rol: 'ADMIN'` crea la cuenta sin rol; 20 registros concurrentes → 1 documento; respuestas idénticas | [ ] | |
| T-16 | `POST /auth/verify-email` y `POST /auth/resend-verification` | CA-04, CA-05, CA-06, CA-10, RN-06 | §8, §5 | E2E API: verificar → PENDIENTE_APROBACION; segundo uso → 400; el reenvío invalida el anterior; inexistente → mismo 202 | [ ] | |
| T-17 | `POST /auth/login`, `POST /auth/refresh` y `POST /auth/logout` según DEC-01 y DEC-10 (cookie `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`, comprobación de `Origin`, claim `cv`; `/refresh` sin JWT nuevo si la cuenta no está ACTIVA o cambió la versión) | CA-07, CA-09, CA-12, RN-07, RN-11, RN-16, RNF-06 | §5, §8, §11, §14 | E2E API: 401 idéntico en los 3 casos de fallo; después de logout el JWT y el refresh → 401 (la cookie llega a `/logout`); un `Origin` ajeno → 403; reset con revocación masiva simulada como fallida → `/refresh` previo → 401 | [ ] | |
| T-18 | `POST /auth/password/forgot` y `POST /auth/password/reset` (consumir el token, actualizar el hash, incrementar `version_credenciales`, revocar sesiones y avisar) | CA-08, CA-09, CA-10, RN-04, RN-08, RN-16 | §8, §5 | E2E API: mismo 202; después del reset la sesión previa → 401, login con la nueva → 200 y con la anterior → 401; segundo uso → 400 | [ ] | |
| T-19 | `JwtAuthGuard` global (`@Public()`, `sid` vigente, `cv` = versión de la sesión y del usuario, estado ACTIVA, principal leído de `usuarios`), `RolesGuard`, `InstitutionScopePolicy` y `GET /auth/me` | CA-05, CA-11, RN-07, RN-10, RN-15, RN-16 | §8, §11 | E2E API: matriz rol × ruta con un controlador de prueba; otra institución → 403/404; ADMIN global → acceso; DOCENTE sin institución → 403; cambio de rol en la base con JWT vigente → aplica en la siguiente solicitud; sin token → 401; `me` sin `password_hash` | [ ] | |
| ~~T-20~~ | ~~Cola `mail` en BullMQ y `MailWorker` con reintentos e idempotencia por `tokenId`~~ (obsoleta: DEC-04 reemplazada por DEC-09; el envío en proceso queda en T-12) | — | — | — | — | |
| T-21 | Mailpit en `docker-compose.yml` solo para dev/test (si se aprueba DEC-05), con puertos en `127.0.0.1` | Soporte: entorno de pruebas de correo para CA-04, CA-08, CA-09 y CA-13 sin envíos reales | §10, §14 | `docker compose config --quiet` = 0; correo de prueba visible en Mailpit | [ ] | |
| T-35 | `BootstrapAdminService` y comando `bootstrap:admin` (DEC-08): sin endpoint, sin contraseña por ningún medio, se niega con un ADMIN ACTIVO, reemite el enlace con la misma cuenta pendiente, salida genérica sin enlace, auditado | CA-13, RN-14, RN-12 | §5, §8, §11 | Integración: los casos de CA-13 en plan §12 (creación, negativa, reemisión, concurrencia → 1 documento, stdout sin enlace) | [ ] | |
| T-36 | `POST /auth/activate` (consumir `ACTIVAR_CUENTA`, definir la contraseña, verificar el correo, ACTIVA, incrementar `version_credenciales`) | CA-13, CA-03, RN-06, RN-14 | §5, §8, §9.1 | E2E API: activar → login 200; segundo uso → 400; contraseña fuera de política → 422; token de otro propósito → 400 | [ ] | |

## Fase 4 — Frontend
| ID | Tarea | Cubre | Plan § | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|---|
| T-22 | Estructura sin identidad visual: confirmar con `/impeccable shape` solo la estructura y los estados del flujo de cuenta (brief de spec §6.4: 7 pantallas, estados, textos y foco), **sin** dirección visual. Las pantallas usan HTML semántico (`form`, `label`, `fieldset`, regiones `aria-live`) y los estilos mínimos del esqueleto. **No** se crean DESIGN.md, tokens, paleta, tipografía ni componentes con estilo propio: son de HU-UX-001 | Soporte: base de estructura y accesibilidad para RNF-05 sin adelantar HU-UX-001 | §2.1, §15 | Brief de estructura confirmado por el responsable; el diff no agrega DESIGN.md, archivos de tokens ni dependencias de estilos o componentes visuales | [ ] | |
| T-23 | Cliente API y tipos de `features/auth` (`MeResponse`, DTOs), con el token de acceso en memoria, renovación silenciosa con una sola renovación en curso (promesa compartida) y limpieza del estado tras logout o expiración | CA-11, CA-12, RNF-06 | §9.3, §11, §15 | Vitest: un 401 dispara la renovación y, si falla, limpia el estado y redirige a Login; dos 401 simultáneos → una sola llamada a `/refresh` | [ ] | |
| T-24 | Pantallas Registro y Revisa tu correo: sin campos de rol ni institución, validación en línea, política visible, pegar y autocompletar, mensaje genérico accionable | CA-01, CA-03, RN-02, RN-04, RNF-02, RNF-05 | §2.1, §11 | Vitest + Testing Library: no existe ningún input de rol; pegar en contraseña funciona; error asociado con `aria-describedby` | [ ] | |
| T-25 | Pantallas Verificar correo y Reenviar verificación: token por POST, `Referrer-Policy: no-referrer`, estados vencido/usado con opción de pedir otro | CA-04, CA-06, RNF-05 | §11, §15 | Vitest: los estados vencido, usado, 429 y red renderizan su mensaje y su acción | [ ] | |
| T-26 | Pantalla Login con error genérico, estado 429 con tiempo de espera y bloqueo del doble envío | CA-07, RN-04, RNF-05 | §2.1 | Vitest: el mismo texto para los 3 casos de fallo; botón deshabilitado mientras se envía | [ ] | |
| T-27 | Pantallas Olvidé mi contraseña y Crear nueva contraseña (modo restablecimiento y modo activación del primer administrador, que llama a `/auth/activate`) | CA-08, CA-09, CA-13, RNF-02, RNF-05 | §2.1, §8, §11 | Vitest: mensaje genérico; los estados de token inválido ofrecen pedir otro (en modo activación indican contactar a quien opera el despliegue); política visible | [ ] | |
| T-28 | `RequireAuth` y navegación privada basados en `GET /auth/me`; las opciones ocultas por rol solo son cosméticas | CA-05, CA-11, RN-10 | §8, §11 | Vitest: sin sesión → Login; cuenta no ACTIVA → sin acceso | [ ] | |

## Fase 5 — Pruebas transversales
| ID | Tarea | Cubre | Plan § | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|---|
| T-29 | E2E Playwright: registro → correo en Mailpit → verificar → PENDIENTE_APROBACION; cuenta sembrada ACTIVA → login → `me` → logout | CA-01, CA-04, CA-05, CA-07, CA-12 | §12 | Playwright en verde | [ ] | |
| T-30 | E2E Playwright: olvidé → correo → reset → la sesión previa invalidada → login con la nueva contraseña; reutilizar el enlace → mensaje de usado | CA-08, CA-09, CA-10 | §12 | Playwright en verde | [ ] | |
| T-31 | Pruebas de seguridad: anti-enumeración (comparar cuerpos, estados y tiempos mínimos), matriz RBAC entre instituciones, intento de autoasignarse Admin/Coordinador por API, escaneo de secretos y hashes en respuestas, base, logs y auditoría, y ausencia del token crudo en Redis y MongoDB | CA-02, CA-11, CA-12, CA-13, RN-02, RN-04, RN-05, RN-06, RN-10, RN-12, RN-14, RN-15 | §12, §11 | Supertest + escaneo en verde; 0 coincidencias de secretos, hashes o tokens crudos | [ ] | |
| T-32 | Accesibilidad: `axe` sin violaciones serias en las 7 pantallas, recorrido con teclado, foco en el error, vista móvil y 200 % de zoom; pasada `/impeccable harden` y `audit` **limitada a estados, errores, textos y accesibilidad** (los hallazgos de estilo visual se derivan a HU-UX-001) | RNF-05 | §12 | Informe de axe adjunto; hallazgos de impeccable dentro del alcance resueltos y los de estilo registrados para HU-UX-001 | [ ] | |
| T-33 | Checklist de despliegue: HTTPS/HSTS y cookie `Secure` fuera de local | RNF-03, RNF-06 | §11, §12 | Revisión registrada en el PR | [ ] | |

## Fase 6 — Release
| ID | Tarea | Cubre | Plan § | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|---|
| T-34 | Documentar el proveedor de correo, las plantillas, el catálogo de roles y quién aprueba, los estados, la operación `bootstrap:admin` y las variables (sin secretos versionados); ejecutar `/sdd-release` y abrir el Pull Request hacia `develop` | Todos | §10, §11, §15 | Checklist de release completo; `sdd-validate.ps1 -Id HT-AUTH-01` sin `[FALLA]`; pruebas en verde | [ ] | |

## Matriz de cobertura
| Criterio / regla | Tareas | Pruebas | Cubierto |
|---|---|---|---|
| CA-01 | T-15, T-24, T-29 | E2E API cuerpo con rol; Playwright registro | [ ] |
| CA-02 | T-04, T-15, T-31 | Concurrencia + E11000; comparación de respuestas | [ ] |
| CA-03 | T-07, T-15, T-24, T-36 | Unit de política/hash; escaneo de texto plano | [ ] |
| CA-04 | T-08, T-12, T-16, T-21, T-25, T-29 | Reloj falso; segundo uso | [ ] |
| CA-05 | T-15, T-16, T-19, T-28, T-29 | Login por estado; verificación → PENDIENTE_APROBACION; invitación | [ ] |
| CA-06 | T-13, T-16, T-25 | Invalidar el anterior; 202 idéntico; 429 | [ ] |
| CA-07 | T-17, T-26, T-29 | 401 idéntico | [ ] |
| CA-08 | T-12, T-18, T-21, T-27, T-30 | 202 idéntico; token de 30 min; logs | [ ] |
| CA-09 | T-09, T-17, T-18, T-21, T-27, T-30 | Revocación y login con la nueva contraseña | [ ] |
| CA-10 | T-08, T-13, T-16, T-18, T-30 | Consumo concurrente; 429 | [ ] |
| CA-11 | T-19, T-23, T-28, T-31 | Matriz rol × institución | [ ] |
| CA-12 | T-09, T-10, T-17, T-23, T-29, T-31 | Logout invalida; auditoría limpia | [ ] |
| CA-13 | T-04, T-21, T-27, T-31, T-35, T-36 | Comando `bootstrap:admin`: creación, negativa, reemisión, concurrencia; `activate` | [ ] |
| RN-01 | T-01, T-02, T-06 | Transiciones | [ ] |
| RN-02 | T-02, T-15, T-24, T-31 | Cuerpo con rol descartado; sin input de rol | [ ] |
| RN-03 | T-04, T-05, T-06 | Normalización + índice único | [ ] |
| RN-04 | T-12, T-15, T-18, T-24, T-26, T-31 | Comparación de respuestas | [ ] |
| RN-05 | T-02, T-07, T-31 | `select: false`; escaneo | [ ] |
| RN-06 | T-03, T-04, T-08, T-12, T-16, T-31, T-36 | Tokens un solo uso / expiración | [ ] |
| RN-07 | T-17, T-19 | Estados no ACTIVA → 401 | [ ] |
| RN-08 | T-09, T-12, T-18 | Revocación + aviso | [ ] |
| RN-09 | T-13 | 429 por IP/cuenta | [ ] |
| RN-10 | T-05, T-19, T-28, T-31 | RBAC backend | [ ] |
| RN-11 | T-03, T-09, T-17 | Logout | [ ] |
| RN-12 | T-03, T-10, T-31, T-35 | Escaneo de auditoría | [ ] |
| RN-13 | T-11, T-12, T-14 | `LinkBuilder` | [ ] |
| RN-14 | T-04, T-31, T-35, T-36 | Sin ruta HTTP de inicialización; índice parcial `BOOTSTRAP` | [ ] |
| RN-15 | T-01, T-02, T-19, T-31 | Validador rol/institución; principal leído de la base | [ ] |
| RN-16 | T-03, T-06, T-09, T-17, T-18, T-19 | `/refresh` y JWT previos → 401 tras reset o bloqueo; reutilización | [ ] |
| RNF-01 | T-07 | `$argon2id$` | [ ] |
| RNF-02 | T-07, T-24, T-27 | Política; pegar | [ ] |
| RNF-03 | T-33 | Checklist de despliegue | [ ] |
| RNF-04 | T-08, T-11, T-14 | TTL configurables | [ ] |
| RNF-05 | T-22, T-24, T-25, T-26, T-27, T-32 | axe + teclado | [ ] |
| RNF-06 | T-17, T-23, T-33 | `Origin`/`SameSite`; cookie | [ ] |

## Registro de cambios
| Fecha | Cambio | Motivo |
|---|---|---|
| 2026-10-22 | Creación con `/sdd-spec` como HT-AUTH-01 (T-01..T-33) | — |
| 2026-10-22 | Fusionado en HT-CORE-01 como Bloque B (T-13..T-45 de HT-CORE-01) | spec §14 |
| 2026-11-02 | Separado de HT-CORE-01 con la numeración original (T-NN = T-(NN+12) de HT-CORE-01). Ninguna tarea estaba completada. T-34: release propio (antes parte de T-46 de HT-CORE-01). T-22 parte del brief de spec §6.4 y ahora pide DESIGN.md (PRODUCT.md ya existe). T-31 y T-32 agregan los casos de autoasignación de rol, móvil y zoom tomados del DoD y de §6.4. | spec §14 |
| 2026-11-02 | Revisión técnica: T-37 (preparación de rama y fuente única), T-35 (`bootstrap:admin`) y T-36 (`/auth/activate`); ~~T-20~~ obsoleta (DEC-04 → DEC-09); T-22 sin identidad visual; T-01, T-02, T-03, T-04, T-06, T-09, T-10, T-12, T-17, T-18, T-19, T-23, T-27, T-31, T-32 y T-34 ampliadas para CA-13, RN-14..RN-16, DEC-08..DEC-11 y la protección de hashes, sin cambiar su ID ni su objetivo. Matriz recalculada desde la columna «Cubre». | spec §14; plan §17 |
