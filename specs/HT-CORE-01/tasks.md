---
id: HT-CORE-01
spec: ./spec.md
plan: ./plan.md
status: in-progress      # pending | in-progress | done
updated: 2026-10-10
---

# HT-CORE-01 — Tasks

Rama: `feature/HT-CORE-01` (desde `develop`).

Reglas:
- Generado con `/sdd-tasks` a partir de `spec.md` y `plan.md` en estado `ready`.
- Cada tarea `T-NN` referencia al menos un criterio (`CA-NN`), regla (`RN-NN`) o requisito no funcional (`RNF-NN`) y la sección del plan que implementa.
- Una tarea solo se marca `[x]` cuando su verificación pasa; registrar evidencia (comando y resultado, archivos) y el commit. **La evidencia nunca incluye valores de `.env`, contraseñas ni URIs con credenciales (RN-04).**
- Si durante la implementación el plan resulta incorrecto, actualizar primero `plan.md` y luego estas tareas.

## Fase 1 — Datos (MongoDB / Mongoose)
No aplica: la historia no crea colecciones, índices ni migraciones (plan §3–§7).

## Fase 2 — Infraestructura y scripts
| ID | Tarea | Cubre | Plan § | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|---|
| T-01 | Confirmar que existe `.env`; si no existe, crearlo con `Copy-Item .env.docker.example .env` y que el desarrollador reemplace los marcadores (sin leerlo ni sobrescribirlo) | CA-03, RN-01, RN-02 | §9.1, DEC-04 | `Test-Path .env` = `True`; `git check-ignore -v .env` muestra la regla de `.gitignore` | [x] | `Test-Path .env` = True; `git check-ignore -v .env` → `.gitignore:6:*.env .env`. `.env` ya existía: no se creó ni se leyó. |
| T-02 | Agregar healthcheck `redis-cli ping` al servicio `redis` en `docker-compose.yml`, sin tocar puertos, volúmenes ni perfil `app` | CA-02, CA-05, RN-05, RNF-01 | §2.1, §13, DEC-02 | `docker compose config --quiet` = 0; `git diff docker-compose.yml` solo muestra el bloque `healthcheck` | [x] | `docker-compose.yml`: bloque `healthcheck` en `redis` (único cambio). `config --quiet` = 0; redis queda `healthy`. |
| T-03 | Crear `scripts/verify-local.ps1` con el parámetro `-Static` y las comprobaciones 1–5 (`.env` existe, ignorado, plantilla con `cambiar_*`, ningún `.env` versionado, compose válido); salida `[OK]/[FALLA] CA-NN` y código 0/1, sin imprimir valores | CA-01, CA-03, CA-04, RN-01, RN-02, RN-04 | §9.2 (1–5), DEC-01 | `scripts/verify-local.ps1 -Static` devuelve 0 con todas las líneas `[OK]` | [x] | `scripts/verify-local.ps1 -Static` → 5 líneas `[OK]` (CA-03 ×3, CA-04, CA-01), exit 0. |
| T-04 | Agregar a `verify-local.ps1` las comprobaciones 6–9 (Docker operativo, `mongo`/`redis` healthy, perfil `app` apagado, logs sin las contraseñas leídas en memoria) | CA-02, CA-05, RN-04, RN-05 | §9.2 (6–9), §11 | Con servicios arriba, `scripts/verify-local.ps1` devuelve 0; con Docker detenido, informa "Docker no operativo" y devuelve 1 | [x] | `scripts/verify-local.ps1` → 10 líneas `[OK]` (incluye mongo/redis healthy, RN-05, CA-05 logs sin contraseñas), exit 0. **No probado:** el caso "Docker no operativo" (no se detuvo Docker Desktop). |
| T-05 | Endurecer `scripts/docker-up.ps1` (validar `config --quiet` antes de `up`, detenerse si `$LASTEXITCODE` ≠ 0) y `scripts/docker-down.ps1` (detenerse ante error; nunca `-v`) | CA-02, CA-06, RN-03, RN-05 | §2.1, §2.3 | Revisión: ninguno de los dos contiene `-v`/`--volumes`; con `.env` incompleto, `docker-up.ps1` se detiene antes de arrancar | [x] | `docker-up.ps1` valida `config --quiet` y corta con `exit 1` si `up` falla (comprobado: con el puerto 6379 ocupado salió con 1). `docker-down.ps1` sin `-v`. **No probado:** `docker-up.ps1` con `.env` incompleto (no se edita `.env`); el mismo fallo de `config` queda cubierto en T-09. |

## Fase 3 — API / jobs
No aplica: sin endpoints ni colas (plan §8–§9.3).

## Fase 4 — Frontend y documentación
| ID | Tarea | Cubre | Plan § | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|---|
| T-06 | Registrar en DT-01 de `docs/dependencias-transversales.md` la estructura verificada de `apps/*` (no existen a 2026-10-10) y las convenciones de frontend pendientes (lint, formato, pruebas, variables públicas/privadas) con su DT asociada; no crear carpetas `apps/` | CA-09, RN-06 | §2.1, DEC-03 | Revisión del diff; `Test-Path apps` = `False` | [x] | DT-01 en `docs/dependencias-transversales.md`: `apps/*` inexistente + tabla de convenciones de frontend pendientes. `ls apps` → no existe. |
| T-07 | Completar `README_SETUP.md`: comprobación (`verify-local.ps1`, `ps`, `logs`), apagado seguro (`docker-down.ps1`, advertencia sobre `down -v` y `docker-reset.ps1`) y enlaces a flujo SDD, `specs/_templates/`, `.claude/skills/` y `04-git-ramas-commits-pr.md` | CA-05, CA-06, CA-07, CA-08, RN-03 | §2.1, §2.2 | Revisión: todos los enlaces abren un archivo existente | [x] | `README_SETUP.md` §2–§7: verificación, estado, logs, puerto ocupado, apagado seguro, enlaces SDD. 8/8 enlaces resuelven a archivos existentes. |
| T-08 | Actualizar `docs/onboarding/01-instalacion.md` (script de verificación en la tabla de comandos) y `02-variables-entorno.md` (Redis sin contraseña en local, solo `127.0.0.1`; la tabla coincide con la plantilla) | CA-03, CA-08, RN-07, RNF-01 | §9.1, §11 | Revisión: las variables de la tabla son exactamente las de `.env.docker.example` | [x] | `01-instalacion.md`: filas de `verify-local.ps1`, healthcheck de redis, problema de puerto ocupado. `02-variables-entorno.md`: nota de Redis sin contraseña. Variables de la tabla = plantilla (comparación automática: True). |

## Fase 5 — Verificación transversal
| ID | Tarea | Cubre | Plan § | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|---|
| T-09 | Ejecutar `scripts/verify-local.ps1 -Static` y el caso negativo de CA-01 (sin `MONGO_ROOT_PASSWORD_URLENCODED`, `docker compose config --quiet` falla), restaurando luego el `.env` | CA-01, CA-03, CA-04, RN-01 | §12 | Salida del script (solo líneas `[OK]/[FALLA]`) y código de salida | [x] | `-Static` exit 0. Negativo: `docker compose --env-file <plantilla sin MONGO_ROOT_PASSWORD_URLENCODED> config --quiet` → exit 1, "required variable MONGO_ROOT_PASSWORD_URLENCODED is missing a value". Plantilla completa → exit 0. `.env` no se tocó. |
| T-10 | Arrancar con `scripts/docker-up.ps1` y ejecutar `scripts/verify-local.ps1` completo | CA-02, CA-05, RN-04, RN-05 | §12 | Salida de `docker compose ps` (sin variables) y del script con código 0 | [x] | Con `REDIS_PORT=6380` en la sesión (6379 ocupado por otro proyecto local): `docker-up.ps1` exit 0; `docker compose ps`: mongo `127.0.0.1:27017` healthy, redis `127.0.0.1:6380` healthy; `verify-local.ps1` exit 0. |
| T-11 | Evidencia de persistencia: `redis-cli SET ht-core-01:persistencia <marca>` → `docker-down.ps1` → `docker-up.ps1` → `GET` devuelve la marca → `DEL`; `docker volume ls` antes y después | CA-06, RN-03 | §12, DEC-05 | Salidas de `GET` y `docker volume ls` registradas | [x] | SET `ht-core-01:persistencia` → `docker-down.ps1` (contenedores y red eliminados) → volúmenes `omr-preicfes_mongo_data` y `omr-preicfes_redis_data` presentes antes y después → `docker-up.ps1` → GET devolvió la misma marca → DEL = 1. |
| T-12 | Reproducibilidad: otro integrante sigue solo `README_SETUP.md` en su máquina y adjunta la salida de `verify-local.ps1` | CA-08 | §12 | Comentario o adjunto en el PR | [ ] | |

## Fase 6 — Release
| ID | Tarea | Cubre | Plan § | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|---|
| T-13 | `/sdd-release HT-CORE-01` y Pull Request hacia `develop` | Todos | — | Checklist de release completo | [ ] | |

## Notas de implementación
- 2026-10-10: el puerto 6379 estaba ocupado por otro proyecto local; se verificó con `REDIS_PORT=6380` solo en la sesión y se documentó la solución en `README_SETUP.md` §4 y `01-instalacion.md`. Sin cambios en plan ni spec.
- CA-08 y RNF-02 quedan abiertos hasta T-12 (otro integrante) y T-13 (release).

## Matriz de cobertura
| Criterio / regla | Tareas | Pruebas / evidencia | Cubierto |
|---|---|---|---|
| CA-01 | T-03, T-09 | `verify-local.ps1 -Static` (comprobación 5) + caso negativo | [x] |
| CA-02 | T-02, T-04, T-05, T-10 | `verify-local.ps1` (comprobaciones 7–8) | [x] |
| CA-03 | T-01, T-03, T-08, T-09 | `verify-local.ps1 -Static` (comprobaciones 1, 3, 4) | [x] |
| CA-04 | T-01, T-03, T-09 | Comprobación 2 + `git check-ignore -v .env` | [x] |
| CA-05 | T-02, T-04, T-07, T-10 | `verify-local.ps1` (comprobaciones 7, 9) | [x] |
| CA-06 | T-05, T-07, T-11 | Evidencia manual de persistencia | [x] |
| CA-07 | T-07 | Revisión de enlaces en el PR | [x] |
| CA-08 | T-07, T-08, T-12 | Ejecución por otro integrante | [ ] |
| CA-09 | T-06 | Revisión del diff de DT-01; `apps/` no creado | [x] |
| RN-01 | T-01, T-03, T-09 | Comprobaciones 2–4 | [x] |
| RN-02 | T-01, T-03 | Comprobación 1; el script no crea ni sobrescribe `.env` | [x] |
| RN-03 | T-05, T-07, T-11 | Revisión de scripts y guía; persistencia comprobada | [x] |
| RN-04 | T-03, T-04, T-10 | Comprobación 9; la salida del script no contiene valores | [x] |
| RN-05 | T-02, T-04, T-05, T-10 | Comprobación 8 | [x] |
| RN-06 | T-06 | `apps/` no creado | [x] |
| RN-07 | T-08 | Tabla de variables = plantilla | [x] |
| RNF-01 | T-02, T-08 | `git diff docker-compose.yml` sin cambios de puertos | [x] |
| RNF-02 | T-01, T-03, T-13 | Comprobaciones 2–4 y checklist de release | [ ] |
