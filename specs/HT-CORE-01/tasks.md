---
id: HT-CORE-01
spec: ./spec.md
plan: ./plan.md
status: in-progress            # draft | ready | in-progress | in-review | done
updated: 2026-11-02
---

# HT-CORE-01 — Tasks

Rama: `feature/HT-CORE-01` (desde `develop`).

Reglas:
- Generado por `/sdd-spec` (en `draft`) junto con `spec.md` y `plan.md`. `/sdd-tasks` lo actualiza cuando cambian. Pasa a `ready` solo cuando spec y plan están en `ready` y la trazabilidad se valida (`scripts/sdd-validate.ps1 -Id HT-CORE-01`).
- No se implementa con este archivo en `draft`. El Bloque B y sus bloqueos pasaron a HT-AUTH-01.
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

## Fases 1–5 — Bloque B (trasladadas a HT-AUTH-01)
~~T-13..T-45~~ (obsoletas: trasladadas el 2026-11-02 a [`specs/HT-AUTH-01/tasks.md`](../HT-AUTH-01/tasks.md) como T-01..T-33; ninguna estaba iniciada).

## Fase 6 — Release
| ID | Tarea | Cubre | Plan § | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|---|
| T-46 | Confirmar la conciliación con `origin/feature/HT-CORE-01` (merge 09d1986); ejecutar `/sdd-release` y abrir el Pull Request hacia `develop` (la documentación de correo, roles y estados pasó a HT-AUTH-01, T-34) | Todos | §10, §11, §15 | Checklist de release completo; `sdd-validate.ps1 -Id HT-CORE-01` sin `[FALLA]`; pruebas en verde | [ ] | |

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
| CA-21 | T-48, T-49, T-50, T-51 | pnpm lint/typecheck/test/build; E2E health; Compose perfil app | [x] |
| RN-01 | T-02, T-04 | `verify-local.ps1` (2–4) | [x] |
| RN-02 | T-02 | Revisión del procedimiento | [x] |
| RN-03 | T-06, T-08, T-11 | `Select-String`; volúmenes | [x] |
| RN-04 | T-04, T-05 | `verify-local.ps1` (9) | [x] |
| RN-05 | T-07, T-47 | `git diff --stat`; `git grep` de rutas | [x] |
| RN-06 | T-09 | Comparación tabla/plantilla | [x] |
| RN-20 | T-48, T-49 | Revisión del diff | [x] |
| RNF-01 | T-12 | Reproducción en clon limpio | [ ] |
| ~~CA-09..CA-20, RN-07..RN-19, RNF-02..RNF-07~~ | (trasladados a HT-AUTH-01) | — | — |

## Registro de cambios
| Fecha | Cambio | Motivo |
|---|---|---|
| 2026-10-22 | Creación con `/sdd-spec` (Bloque A) | — |
| 2026-10-22 | Fusión de HT-AUTH-01 como Bloque B: T-13..T-45 (antes T-01..T-33) y release unificado T-46 (sustituye a la antigua T-13 del Bloque A) | spec §14 |
| 2026-10-22 | Aprobado por el responsable; inicio de implementación por la Fase 0. Bloque B en espera de DT-01, DT-04, DT-05 y DT-07. | Confirmación en sesión |
| 2026-10-22 | Fase 0: T-01..T-11 completadas con evidencia, reutilizando la implementación de origin/feature/HT-CORE-01 (merge 09d1986). T-12 pendiente: requiere a otro integrante. | /sdd-implement |
| 2026-10-28 | Fase 0B (T-47..T-51): esqueletos `apps/backend` y `apps/frontend` y renombrado de referencias. CA-08 y RN-05 se reabren en la matriz porque cambió su formulación. | spec §14 |
| 2026-10-28 | Fase 0B completada (T-47..T-51) con evidencia; CA-08, CA-21, RN-05 y RN-20 cubiertos. | /sdd-implement |
| 2026-11-02 | Separación del Bloque B como HT-AUTH-01: T-13..T-45 tachadas (ahora T-01..T-33 de HT-AUTH-01), T-46 limitada al release del Bloque A y filas del Bloque B retiradas de la matriz. | spec §14 |
