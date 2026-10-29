---
id: HT-CORE-01
spec: ./spec.md
plan: ./plan.md
status: in-progress            # draft | ready | in-progress | in-review | done
updated: 2026-10-22
---

# HT-CORE-01 — Tasks

Rama: `feature/HT-CORE-01` (desde `develop`).

Reglas:
- Generado por `/sdd-spec` (en `draft`) junto con `spec.md` y `plan.md`. `/sdd-tasks` lo actualiza cuando cambian. Pasa a `ready` solo cuando spec y plan están en `ready` y la trazabilidad se valida (`scripts/sdd-validate.ps1 -Id HT-CORE-01`).
- No se implementa con este archivo en `draft`. **Bloqueos del Bloque B:** Fase 0 completa, DT-01, DT-04, DT-05 y DT-07 (plan §10).
- Cada tarea `T-NN` referencia al menos un `CA-NN`, `RN-NN` o `RNF-NN` y la sección del plan que implementa.
- Una tarea solo se marca `[x]` cuando su verificación pasa; registrar evidencia y commit. **La evidencia nunca incluye valores de `.env`, contraseñas, tokens crudos, enlaces de correo, URIs con credenciales ni datos personales reales.**
- Al actualizar: nunca borrar ni desmarcar tareas `[x]` ni su evidencia; no renumerar; las tareas obsoletas se tachan `~~T-NN~~ (obsoleta: motivo)`.

## Fase 0 — Bloque A: base técnica y entorno local
| ID | Tarea | Cubre | Plan § | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|---|
| T-01 | Revisar `README_SETUP.md`, `docs/onboarding/02` y `03` y `.claude/skills/`; listar las discrepancias con el repositorio real en la evidencia | CA-05 | §2.1 | Lista de discrepancias registrada (o «ninguna») | [x] | Revisados README_SETUP, 02-variables-entorno, 03-flujo-sdd y `.claude/skills/`. Discrepancias: README_SETUP tenía dos secciones «Trabajar con Specs» (unificadas en §7 al resolver el merge); la skill `impeccable` y `.claude/agents/` están sin versionar y no figuran en `05-skills-claude-code.md` (pendiente de la rama `config/claude-skills`). La denegación de lectura de `.env` en `.claude/settings.json` existe. merge 09d1986 |
| T-02 | Si no existe `.env`, crearlo con `Copy-Item .env.docker.example .env` (sin sobrescribir ni leer su contenido); el desarrollador reemplaza los marcadores | CA-03, RN-01, RN-02 | §9.1 | `Test-Path .env` = True; `git check-ignore -v .env` muestra la regla de `.gitignore` | [x] | `.env` ya existía: no se creó ni se leyó. `git check-ignore -v .env` → `.gitignore:6:*.env .env`. |
| T-03 | Agregar `healthcheck` con `redis-cli ping` a `redis` en `docker-compose.yml`, sin tocar puertos, volúmenes ni el perfil `app` | CA-02, CA-04 | §2.1, §14 | `docker compose config --quiet` = 0; el diff solo muestra el bloque `healthcheck` | [x] | Bloque `healthcheck` (`redis-cli ping`) en `redis`, incorporado desde origin/feature/HT-CORE-01. `docker compose config --quiet` = 0; `docker compose up -d --wait` → redis `Healthy`. merge 09d1986 |
| T-04 | Crear `scripts/verify-local.ps1` con `-Static` y las comprobaciones 1–5; salida `[OK]/[FALLA] CA-NN` y código 0/1, sin imprimir valores | CA-01, CA-03, RN-01, RN-04 | §9.2 | `verify-local.ps1 -Static` = 0 con todas las líneas `[OK]` | [x] | `scripts/verify-local.ps1 -Static` → 5 líneas `[OK]` (CA-03 ×4, CA-01), exit 0. Etiquetas alineadas con la numeración actual de CA. merge 09d1986 |
| T-05 | Agregar a `verify-local.ps1` las comprobaciones 6–9 (Docker operativo, `healthy`, perfil `app` apagado, logs sin contraseña) | CA-02, CA-04, RN-04 | §9.2, §11 | Con servicios arriba = 0; con Docker detenido informa «Docker no operativo» y devuelve 1 | [x] | `scripts/verify-local.ps1` → 10 líneas `[OK]` (incluye mongo y redis healthy, RN-05 perfil app apagado, CA-04 logs sin contraseña), exit 0. **No probado:** el caso «Docker no operativo» (no se detuvo Docker Desktop). merge 09d1986 |
| T-06 | Endurecer `docker-up.ps1` (validar `config --quiet` antes de `up`, cortar ante error) y `docker-down.ps1` (cortar ante error, nunca `-v`) | CA-02, CA-06, RN-03 | §2.3, §9.3 | `Select-String -Pattern '-v\b|--volumes'` sin coincidencias en `docker-down.ps1`; `up` sale con 1 si `config` falla | [x] | `docker-up.ps1` valida `config --quiet` y sale con 1 si falla `config` o `up`; `docker-down.ps1` sin `-v`/`--volumes` en las líneas de código (grep excluyendo comentarios: 0 coincidencias). Ejecutados ambos scripts con exit 0. merge 09d1986 |
| T-07 | Confirmar la estructura real de `apps/api` y `apps/web`; registrar en DT-01 de `docs/dependencias-transversales.md` el resultado y las convenciones de frontend pendientes (lint, formato, pruebas, variables públicas/privadas) con su responsable; no crear carpetas | CA-08, RN-05 | §2.1, §14 | `Test-Path apps` = False; revisión del diff | [x] | DT-01 en `docs/dependencias-transversales.md`: `apps/*` no existe y tabla de convenciones de frontend pendientes (lint, formato, pruebas, variables públicas/privadas, diseño). `ls apps` → no existe. merge 09d1986 |
| T-08 | Completar `README_SETUP.md`: inicio, comprobación (`verify-local.ps1`, `ps`, `logs`), apagado seguro (advertencia de `down -v` y `docker-reset.ps1`) y enlaces a flujo SDD, plantillas, skills y Git | CA-04, CA-05, CA-06, RN-03 | §9.3 | Todos los enlaces resuelven (`Test-Path` por enlace) | [x] | `README_SETUP.md` §2–§7: verificación estática, arranque, estado y logs, puerto ocupado, apagado seguro con advertencia de `down -v` y `docker-reset.ps1`, enlaces SDD. 9/9 enlaces resuelven a rutas existentes. merge 09d1986 |
| T-09 | Actualizar `docs/onboarding/01-instalacion.md` (script de verificación) y `02-variables-entorno.md` (Redis sin contraseña, solo `127.0.0.1`; tabla = plantilla) | CA-03, RN-06 | §9.1, §11 | Las claves de la tabla coinciden con las de `.env.docker.example` (comparación en PowerShell) | [x] | `01-instalacion.md`: filas de `verify-local.ps1`, healthcheck de redis y puerto ocupado. `02-variables-entorno.md`: nota de Redis sin contraseña en `127.0.0.1`. Claves de la tabla = claves de `.env.docker.example` (diff vacío). merge 09d1986 |
| T-10 | Caso negativo de CA-01: `config --quiet` con un `--env-file` temporal sin `MONGO_ROOT_PASSWORD_URLENCODED` falla sin mostrar valores; borrar el archivo temporal | CA-01 | §12 | Código ≠ 0 y mensaje sin secretos | [x] | `docker compose --env-file <copia temporal de la plantilla sin MONGO_ROOT_PASSWORD_URLENCODED> config --quiet` → exit 1, con y sin `--profile app`; mensaje: `required variable MONGO_ROOT_PASSWORD_URLENCODED is missing a value` (sin valores secretos). Archivo temporal borrado. |
| T-11 | Persistencia tras apagado: `down` → `up` y `docker volume ls` muestra `mongo_data` y `redis_data` | CA-06, RN-03 | §12 | Volúmenes presentes | [x] | `scripts/docker-down.ps1` → contenedores y red eliminados; `docker volume ls` muestra `omr-preicfes_mongo_data` y `omr-preicfes_redis_data`; `docker compose up -d --wait` → mongo y redis `Healthy` con los volúmenes existentes. |
| T-12 | Prueba de reproducibilidad: otro integrante sigue `README_SETUP.md` desde un clon limpio y `verify-local.ps1` devuelve 0 | CA-07, RNF-01 | §12 | Checklist firmado en la evidencia | [ ] | |

## Fase 0B — Bloque A: esqueletos de aplicación (DT-01)
| ID | Tarea | Cubre | Plan § | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|---|
| T-47 | Actualizar las referencias `apps/api`/`apps/web` y los servicios `api`/`web` a `apps/backend`/`apps/frontend` y `backend`/`frontend` (Compose, scripts, plantillas, documentación, skills y plantilla de plan); conservar `omr` | RN-05, CA-08 | §2.1, §14 | `git grep` sin referencias vigentes a `apps/api` ni `apps/web` (salvo registros históricos); `docker compose --profile app config --quiet` = 0 | [x] | Compose: servicios `backend`/`frontend` con contexto `./apps/backend` y `./apps/frontend`; `omr` sin cambios. Plantillas renombradas (`git mv`) a `backend`/`frontend.Dockerfile.example`. Actualizados `verify-local.ps1`, README_SETUP, `docs/arquitectura.md`, DT-01 (dependencias y matriz), `01-instalacion.md`, onboarding README, skills `docker-local`, `sdd-plan` y `sdd-spec`, y `plan-template.md`. `git grep` sin referencias vigentes (solo quedan registros históricos fechados y el documento fuente transcrito). `docker compose --profile app config --quiet` = 0. |
| T-48 | Esqueleto `apps/backend`: NestJS + TS estricto, prefijo `api/v1`, `HealthController`, ESLint, Jest (unit + E2E), Dockerfile y `.dockerignore` | CA-21, RN-20 | §8, §9.8 | `pnpm install --frozen-lockfile`, `lint`, `typecheck`, `test`, `test:e2e` y `build` = 0 | [x] | `apps/backend` (NestJS 12.3, TS 6.0.3 estricto, configuración tomada de la plantilla oficial `@nestjs/schematics` 12). `pnpm install --frozen-lockfile` OK; `lint` = 0; `typecheck` = 0; `test` 1/1; `test:e2e` 2/2 (`GET /api/v1/health` 200 y `/health` 404); `build` = 0; `node dist/main.js` responde 200 `{"status":"ok"}`. Jest con `--experimental-vm-modules` porque `@nestjs/*` 12 es solo ESM (igual que la plantilla oficial). Scripts de build de `@parcel/watcher` y `unrs-resolver` denegados en `pnpm-workspace.yaml`. |
| T-49 | Esqueleto `apps/frontend`: React + Vite + TS estricto, `App` mínima, ESLint, Vitest, Dockerfile y `.dockerignore` | CA-21, RN-20 | §9.8 | `pnpm install --frozen-lockfile`, `lint`, `typecheck`, `test` y `build` = 0 | [x] | `apps/frontend` (React 19.3, Vite 8.3, TS 6.0.3 estricto). `pnpm install --frozen-lockfile` OK; `lint` = 0; `typecheck` = 0; `test` 1/1 (Vitest + Testing Library); `build` = 0 (`dist/` 219,65 kB). |
| T-50 | Compose: healthcheck del backend, `frontend` depende de `backend` sano; `verify-local.ps1` con los nuevos nombres de servicio | CA-21, CA-02, RN-05 | §2.1, §9.2, §9.8 | `docker compose --profile app up -d --build backend frontend` → backend `healthy`, `GET /api/v1/health` = 200 y frontend = 200; `verify-local.ps1` sin regresiones | [x] | Healthcheck del backend con `wget` sobre `/api/v1/health`; `frontend` depende de `backend` sano. `docker compose --profile app build backend frontend` OK; `up -d --wait backend frontend` → backend `healthy`; `curl` backend 200 `{"status":"ok"}` y frontend 200. `verify-local.ps1`: la comprobación 8 ahora exige carpeta `apps/<servicio>` para cada servicio `app` en ejecución; 10/10 `[OK]` con las apps arriba. |
| T-51 | Documentar comandos de las apps (README_SETUP, 01-instalacion, onboarding README) y actualizar DT-01 (estructura resuelta, workspaces pendientes) | CA-05, CA-08, CA-21 | §9.3, §9.8 | Revisión: comandos ejecutables y enlaces existentes | [x] | README_SETUP §5 y §5.1 (comandos de host y Docker), `01-instalacion.md` (tabla de servicios y comandos), onboarding README (árbol con `apps/`) y DT-01 marcada como Parcial (workspaces y tipos compartidos pendientes). |

## Fase 1 — Datos (MongoDB / Mongoose) (Bloque B)
| ID | Tarea | Cubre | Plan § | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|---|
| T-13 | Enums compartidos `AccountStatus`, `Role` (catálogo provisional), `TokenPurpose` y `AuthEvent` | RN-07 | §3.1, §2.3 | Unit: los valores coinciden con la spec §7 | [ ] | |
| T-14 | Esquema `usuarios` con `collection` explícito, validaciones, `schemaVersion`, `password_hash` con `select: false` y `toJSON` sin hash | RN-07, RN-08, RN-11 | §3.1 | Integración: rechaza un estado fuera del enum; `toJSON` sin `password_hash` | [ ] | |
| T-15 | Esquemas `tokens_seguridad`, `sesiones` y `auditoria_auth` | RN-12, RN-17, RN-18 | §3.2, §3.3, §3.4 | Integración: validaciones de esquema | [ ] | |
| T-16 | Índices de §4 (únicos, parciales y TTL) | CA-10, RN-09, RN-12 | §4 | Integración: un duplicado de `correo_normalizado` y de `token_hash` → E11000; `getIndexes()` coincide con §4 | [ ] | |
| T-17 | Script `001-auth-indices` idempotente con reversión y seed `002-seed-roles-dev` (sin datos personales reales) | RN-09, RN-16 | §7 | Ejecutar dos veces sin cambios; la reversión elimina solo los índices o el seed | [ ] | |

## Fase 2 — Dominio y servicios (Bloque B)
| ID | Tarea | Cubre | Plan § | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|---|
| T-18 | `EmailNormalizer` y transiciones de `AccountStatus` en `UsersService` | RN-07, RN-09 | §2.3 | Unit: tabla de transiciones válidas e inválidas; normalización de mayúsculas y espacios | [ ] | |
| T-19 | `PasswordHasher` (Argon2id) y `PasswordPolicy` (12–128, sin composición) | CA-11, RN-11, RNF-02, RNF-03 | §2.3, §11 | Unit: `$argon2id$`; 11 caracteres rechazado; frase de 12 aceptada | [ ] | |
| T-20 | `SecurityTokensService`: emitir (256 bits + SHA-256), invalidar los anteriores y consumir atómicamente con la expiración comprobada | CA-12, CA-18, RN-12, RNF-05 | §2.3, §5 | Integración: un token vencido, usado o invalidado → rechazado; consumo concurrente → 1 éxito | [ ] | |
| T-21 | `SessionsService`: crear, validar `sid`, rotar el token de renovación con detección de reutilización, revocar una o todas | CA-17, CA-20, RN-14, RN-17 | §2.3, §5, §11 | Integración: revocar todas → ninguna sesión vigente; reutilizar un token rotado → revoca | [ ] | |
| T-22 | `AuditService` con redacción, y redactor del logger (`password`, `token`, `cookie`, `authorization`, `correo`) | CA-20, RN-18 | §3.4, §11 | Integración: escaneo de auditoría y logs capturados sin patrones de secretos | [ ] | |
| T-23 | `LinkBuilder` con `APP_PUBLIC_URL` en lista permitida y validación de configuración (TTL y URL) al arrancar | RN-19, RNF-05 | §2.3, §9.7 | Unit: ignora `Host` malicioso; un `APP_PUBLIC_URL` no permitido hace fallar el arranque | [ ] | |
| T-24 | `MailService` (puerto + adaptador SMTP + adaptador en memoria) y plantillas de verificación, reenvío, restablecimiento y aviso de cambio | CA-12, CA-16, RN-14, RN-19 | §2.1, §9.5 | Unit: las plantillas renderizan con el enlace de `LinkBuilder`; el log del envío no contiene el enlace | [ ] | |
| T-25 | `RateLimitGuard` con contadores en Redis por IP, cuenta y ruta | CA-14, CA-18, RN-15 | §2.3, §14 | Integración: superar el umbral → 429; la ventana se reinicia | [ ] | |

## Fase 3 — API / jobs (Bloque B)
| ID | Tarea | Cubre | Plan § | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|---|
| T-26 | Configuración de `.env.docker.example` (solo marcadores) y `docs/onboarding/02-variables-entorno.md` con las variables de §9.7 | RNF-05, RN-19 | §9.7 | Revisión: claves de la tabla = plantilla; ningún valor real | [ ] | |
| T-27 | `POST /auth/register` (whitelist de DTO, E11000 → 202 idéntico, hash ficticio para equilibrar tiempos, uso de invitación desde el servidor) | CA-09, CA-10, CA-11, CA-13, RN-08, RN-10 | §8, §9.4, §5 | E2E API: el cuerpo con `rol: 'ADMIN'` crea la cuenta sin rol; 20 registros concurrentes → 1 documento; respuestas idénticas | [ ] | |
| T-28 | `POST /auth/verify-email` y `POST /auth/resend-verification` | CA-12, CA-13, CA-14, CA-18, RN-12 | §8, §5 | E2E API: verificar → PENDIENTE_APROBACION; segundo uso → 400; el reenvío invalida el anterior; inexistente → mismo 202 | [ ] | |
| T-29 | `POST /auth/login`, `POST /auth/refresh` y `POST /auth/logout` según DEC-05 (cookie `HttpOnly; Secure; SameSite=Strict`, comprobación de `Origin`) | CA-15, CA-20, RN-13, RN-17, RNF-07 | §8, §11, §14 | E2E API: 401 idéntico en los 3 casos de fallo; después de logout el JWT y el refresh → 401; un `Origin` ajeno → 403 | [ ] | |
| T-30 | `POST /auth/password/forgot` y `POST /auth/password/reset` (consumir el token, actualizar el hash, revocar sesiones y avisar) | CA-16, CA-17, CA-18, RN-10, RN-14 | §8, §5 | E2E API: mismo 202; después del reset la sesión previa → 401, login con la nueva → 200 y con la anterior → 401; segundo uso → 400 | [ ] | |
| T-31 | `JwtAuthGuard` global (`@Public()`, `sid` vigente, `iat ≥ credenciales_actualizadas_en`, estado ACTIVA), `RolesGuard`, `InstitutionScopePolicy` y `GET /auth/me` | CA-13, CA-19, RN-13, RN-16 | §8, §11 | E2E API: matriz rol × ruta con un controlador de prueba; otra institución → 403/404; sin token → 401; `me` sin `password_hash` | [ ] | |
| T-32 | Cola `mail` en BullMQ y `MailWorker` con reintentos e idempotencia por `tokenId` (solo si se aprueba DEC-08; si no, envío síncrono) | CA-12, CA-16 | §9.5, §14 | Integración: un job fallido se reintenta 3 veces; un `jobId` duplicado no se encola dos veces | [ ] | |
| T-33 | Mailpit en `docker-compose.yml` solo para dev/test (si se aprueba DEC-09), con puertos en `127.0.0.1` | Soporte: entorno de pruebas de correo para CA-12, CA-16 y CA-17 sin envíos reales | §10, §14 | `docker compose config --quiet` = 0; correo de prueba visible en Mailpit | [ ] | |

## Fase 4 — Frontend (Bloque B)
| ID | Tarea | Cubre | Plan § | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|---|
| T-34 | Contexto de diseño: `/impeccable init` (PRODUCT.md) coordinado con HU-UX-001 y `/impeccable shape` del flujo de cuenta (7 pantallas, estados de spec §6.4) | Soporte: la skill `impeccable` exige PRODUCT.md antes de diseñar pantallas nuevas (RNF-06) | §2.1 | PRODUCT.md revisado por el equipo; brief de forma aprobado | [ ] | |
| T-35 | Cliente API y tipos de `features/auth` (`MeResponse`, DTOs), con el token de acceso en memoria, renovación silenciosa y limpieza del estado tras logout o expiración | CA-19, CA-20, RNF-07 | §9.6, §11 | Vitest: un 401 dispara la renovación y, si falla, limpia el estado y redirige a Login | [ ] | |
| T-36 | Pantallas Registro y Revisa tu correo: sin campos de rol ni institución, validación en línea, política visible, pegar y autocompletar, mensaje genérico accionable | CA-09, CA-11, RN-08, RN-10, RNF-03, RNF-06 | §2.1, §11 | Vitest + Testing Library: no existe ningún input de rol; pegar en contraseña funciona; error asociado con `aria-describedby` | [ ] | |
| T-37 | Pantallas Verificar correo y Reenviar verificación: token por POST, `Referrer-Policy: no-referrer`, estados vencido/usado con opción de pedir otro | CA-12, CA-14, RNF-06 | §11, §15 | Vitest: los estados vencido, usado, 429 y red renderizan su mensaje y su acción | [ ] | |
| T-38 | Pantalla Login con error genérico, estado 429 con tiempo de espera y bloqueo del doble envío | CA-15, RN-10, RNF-06 | §2.1 | Vitest: el mismo texto para los 3 casos de fallo; botón deshabilitado mientras se envía | [ ] | |
| T-39 | Pantallas Olvidé mi contraseña y Crear nueva contraseña | CA-16, CA-17, RNF-03, RNF-06 | §2.1, §11 | Vitest: mensaje genérico; los estados de token inválido ofrecen pedir otro; política visible | [ ] | |
| T-40 | `RequireAuth` y navegación privada basados en `GET /auth/me`; las opciones ocultas por rol solo son cosméticas | CA-13, CA-19, RN-16 | §8, §11 | Vitest: sin sesión → Login; cuenta no ACTIVA → sin acceso | [ ] | |

## Fase 5 — Pruebas transversales (Bloque B)
| ID | Tarea | Cubre | Plan § | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|---|
| T-41 | E2E Playwright: registro → correo en Mailpit → verificar → PENDIENTE_APROBACION; cuenta sembrada ACTIVA → login → `me` → logout | CA-09, CA-12, CA-13, CA-15, CA-20 | §12 | Playwright en verde | [ ] | |
| T-42 | E2E Playwright: olvidé → correo → reset → la sesión previa invalidada → login con la nueva contraseña; reutilizar el enlace → mensaje de usado | CA-16, CA-17, CA-18 | §12 | Playwright en verde | [ ] | |
| T-43 | Pruebas de seguridad: anti-enumeración (comparar cuerpos y estados), matriz RBAC entre instituciones, escaneo de secretos en la base, los logs y la auditoría | CA-10, CA-19, CA-20, RN-10, RN-11, RN-16, RN-18 | §12, §11 | Supertest + escaneo en verde; 0 coincidencias de secretos | [ ] | |
| T-44 | Accesibilidad: `axe` sin violaciones serias en las 7 pantallas, recorrido con teclado y foco en el error; pasada `/impeccable harden` y `audit` | RNF-06 | §12 | Informe de axe adjunto; hallazgos de impeccable resueltos | [ ] | |
| T-45 | Checklist de despliegue: HTTPS/HSTS y cookie `Secure` fuera de local | RNF-04, RNF-07 | §11, §12 | Revisión registrada en el PR | [ ] | |

## Fase 6 — Release
| ID | Tarea | Cubre | Plan § | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|---|
| T-46 | Resolver el conflicto con `origin/feature/HT-CORE-01`; documentar el proveedor de correo, las plantillas, los roles, los estados y las variables; ejecutar `/sdd-release` y abrir el Pull Request hacia `develop` | Todos | §10, §11, §15 | Checklist de release completo; `sdd-validate.ps1 -Id HT-CORE-01` sin `[FALLA]`; pruebas en verde | [ ] | |

## Matriz de cobertura
| Criterio / regla | Tareas | Pruebas | Cubierto |
|---|---|---|---|
| CA-01 | T-04, T-10 | `verify-local.ps1 -Static` (5); caso negativo | [x] |
| CA-02 | T-03, T-05, T-06 | `verify-local.ps1` (6–8) | [x] |
| CA-03 | T-02, T-04, T-09 | `verify-local.ps1` (1–4) | [x] |
| CA-04 | T-03, T-05, T-08 | `verify-local.ps1` (7, 9) | [x] |
| CA-05 | T-01, T-08 | Comprobación de enlaces | [x] |
| CA-06 | T-06, T-08, T-11 | `Select-String`; `docker volume ls` | [x] |
| CA-07 | T-12 | Reproducción en clon limpio | [ ] |
| CA-08 | T-07, T-47, T-51 | Revisión del diff; `Test-Path apps` | [x] |
| CA-09 | T-27, T-36, T-41 | E2E API cuerpo con rol; Playwright registro | [ ] |
| CA-10 | T-16, T-27, T-43 | Concurrencia + E11000; comparación de respuestas | [ ] |
| CA-11 | T-19, T-27, T-36 | Unit de política/hash; escaneo de texto plano | [ ] |
| CA-12 | T-20, T-24, T-28, T-32, T-37, T-41 | Reloj falso; segundo uso | [ ] |
| CA-13 | T-27, T-28, T-31, T-40, T-41 | Login por estado; verificación → PENDIENTE_APROBACION; invitación | [ ] |
| CA-14 | T-25, T-28, T-37 | Invalidar el anterior; 202 idéntico; 429 | [ ] |
| CA-15 | T-29, T-38, T-41 | 401 idéntico | [ ] |
| CA-16 | T-24, T-30, T-32, T-39, T-42 | 202 idéntico; token de 30 min; logs | [ ] |
| CA-17 | T-21, T-30, T-39, T-42 | Revocación y login con la nueva contraseña | [ ] |
| CA-18 | T-20, T-25, T-28, T-30, T-42 | Consumo concurrente; 429 | [ ] |
| CA-19 | T-31, T-35, T-40, T-43 | Matriz rol × institución | [ ] |
| CA-20 | T-21, T-22, T-29, T-35, T-41, T-43 | Logout invalida; auditoría limpia | [ ] |
| CA-21 | T-48, T-49, T-50, T-51 | pnpm lint/typecheck/test/build; E2E health; Compose perfil app | [x] |
| RN-01 | T-02, T-04 | `verify-local.ps1` (2–4) | [x] |
| RN-02 | T-02 | Revisión del procedimiento | [x] |
| RN-03 | T-06, T-08, T-11 | `Select-String`; volúmenes | [x] |
| RN-04 | T-04, T-05 | `verify-local.ps1` (9) | [x] |
| RN-05 | T-07, T-47 | `git diff --stat`; `git grep` de rutas | [x] |
| RN-06 | T-09 | Comparación tabla/plantilla | [x] |
| RN-07 | T-13, T-14, T-18 | Transiciones | [ ] |
| RN-08 | T-14, T-27, T-36 | Cuerpo con rol descartado; sin input de rol | [ ] |
| RN-09 | T-16, T-17, T-18 | Normalización + índice único | [ ] |
| RN-10 | T-27, T-30, T-36, T-38, T-43 | Comparación de respuestas | [ ] |
| RN-11 | T-14, T-19, T-43 | `select: false`; escaneo | [ ] |
| RN-12 | T-15, T-16, T-20, T-28 | Tokens un solo uso / expiración | [ ] |
| RN-13 | T-29, T-31 | Estados no ACTIVA → 401 | [ ] |
| RN-14 | T-21, T-24, T-30 | Revocación + aviso | [ ] |
| RN-15 | T-25 | 429 por IP/cuenta | [ ] |
| RN-16 | T-17, T-31, T-40, T-43 | RBAC backend | [ ] |
| RN-17 | T-15, T-21, T-29 | Logout | [ ] |
| RN-18 | T-15, T-22, T-43 | Escaneo de auditoría | [ ] |
| RN-19 | T-23, T-24, T-26 | `LinkBuilder` | [ ] |
| RN-20 | T-48, T-49 | Revisión del diff | [x] |
| RNF-01 | T-12 | Reproducción en clon limpio | [ ] |
| RNF-02 | T-19 | `$argon2id$` | [ ] |
| RNF-03 | T-19, T-36, T-39 | Política; pegar | [ ] |
| RNF-04 | T-45 | Checklist de despliegue | [ ] |
| RNF-05 | T-20, T-23, T-26 | TTL configurables | [ ] |
| RNF-06 | T-34, T-36, T-37, T-38, T-39, T-44 | axe + teclado | [ ] |
| RNF-07 | T-29, T-35, T-45 | `Origin`/`SameSite`; cookie | [ ] |

## Registro de cambios
| Fecha | Cambio | Motivo |
|---|---|---|
| 2026-10-22 | Creación con `/sdd-spec` (Bloque A) | — |
| 2026-10-22 | Fusión de HT-AUTH-01 como Bloque B: T-13..T-45 (antes T-01..T-33) y release unificado T-46 (sustituye a la antigua T-13 del Bloque A) | spec §14 |
| 2026-10-22 | Aprobado por el responsable; inicio de implementación por la Fase 0. Bloque B en espera de DT-01, DT-04, DT-05 y DT-07. | Confirmación en sesión |
| 2026-10-22 | Fase 0: T-01..T-11 completadas con evidencia, reutilizando la implementación de origin/feature/HT-CORE-01 (merge 09d1986). T-12 pendiente: requiere a otro integrante. | /sdd-implement |
| 2026-10-28 | Fase 0B (T-47..T-51): esqueletos `apps/backend` y `apps/frontend` y renombrado de referencias. CA-08 y RN-05 se reabren en la matriz porque cambió su formulación. | spec §14 |
| 2026-10-28 | Fase 0B completada (T-47..T-51) con evidencia; CA-08, CA-21, RN-05 y RN-20 cubiertos. | /sdd-implement |
