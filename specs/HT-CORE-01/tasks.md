---
id: HT-CORE-01
spec: ./spec.md
plan: ./plan.md
status: draft            # draft | ready | in-progress | in-review | done
updated: 2026-10-22
---

# HT-CORE-01 — Tasks

Rama: `feature/HT-CORE-01` (desde `develop`).

Reglas:
- Generado por `/sdd-spec` (en `draft`) junto con `spec.md` y `plan.md`. `/sdd-tasks` lo actualiza cuando cambian. Pasa a `ready` solo cuando spec y plan están en `ready` y la trazabilidad se valida (`scripts/sdd-validate.ps1 -Id HT-CORE-01`).
- No se implementa con este archivo en `draft`.
- Cada tarea `T-NN` referencia al menos un `CA-NN`, `RN-NN` o `RNF-NN` y la sección del plan que implementa.
- Una tarea solo se marca `[x]` cuando su verificación pasa; registrar evidencia y commit. **La evidencia nunca incluye valores de `.env`, contraseñas ni URIs con credenciales (RN-04).**
- Al actualizar: nunca borrar ni desmarcar tareas `[x]` ni su evidencia; no renumerar; las tareas obsoletas se tachan `~~T-NN~~ (obsoleta: motivo)`.

## Fase 1 — Datos (MongoDB / Mongoose)
No aplica: sin colecciones, índices ni migraciones (plan §3–§7).

## Fase 2 — Infraestructura y scripts
| ID | Tarea | Cubre | Plan § | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|---|
| T-01 | Revisar `README_SETUP.md`, `docs/onboarding/02` y `03` y `.claude/skills/`; listar las discrepancias con el repositorio real en la evidencia | CA-05 | §2.1 | Lista de discrepancias registrada (o «ninguna») | [ ] | |
| T-02 | Si no existe `.env`, crearlo con `Copy-Item .env.docker.example .env` (sin sobrescribir ni leer su contenido); el desarrollador reemplaza los marcadores | CA-03, RN-01, RN-02 | §9.1 | `Test-Path .env` = True; `git check-ignore -v .env` muestra la regla de `.gitignore` | [ ] | |
| T-03 | Agregar `healthcheck` con `redis-cli ping` a `redis` en `docker-compose.yml`, sin tocar puertos, volúmenes ni el perfil `app` | CA-02, CA-04 | §2.1, §14 | `docker compose config --quiet` = 0; el diff solo muestra el bloque `healthcheck` | [ ] | |
| T-04 | Crear `scripts/verify-local.ps1` con `-Static` y las comprobaciones 1–5; salida `[OK]/[FALLA] CA-NN` y código 0/1, sin imprimir valores | CA-01, CA-03, RN-01, RN-04 | §9.2 | `verify-local.ps1 -Static` = 0 con todas las líneas `[OK]` | [ ] | |
| T-05 | Agregar a `verify-local.ps1` las comprobaciones 6–9 (Docker operativo, `healthy`, perfil `app` apagado, logs sin contraseña) | CA-02, CA-04, RN-04 | §9.2, §11 | Con servicios arriba = 0; con Docker detenido informa «Docker no operativo» y devuelve 1 | [ ] | |
| T-06 | Endurecer `docker-up.ps1` (validar `config --quiet` antes de `up`, cortar ante error) y `docker-down.ps1` (cortar ante error, nunca `-v`) | CA-02, CA-06, RN-03 | §2.3, §9.3 | `Select-String -Pattern '-v\b|--volumes'` sin coincidencias en `docker-down.ps1`; `up` sale con 1 si `config` falla | [ ] | |

## Fase 3 — API / jobs
No aplica: sin endpoints ni colas (plan §8).

## Fase 4 — Frontend y documentación
| ID | Tarea | Cubre | Plan § | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|---|
| T-07 | Confirmar la estructura real de `apps/api` y `apps/web`; registrar en DT-01 de `docs/dependencias-transversales.md` el resultado y las convenciones de frontend pendientes (lint, formato, pruebas, variables públicas/privadas) con su responsable; no crear carpetas | CA-08, RN-05 | §2.1, §14 | `Test-Path apps` = False; revisión del diff | [ ] | |
| T-08 | Completar `README_SETUP.md`: inicio, comprobación (`verify-local.ps1`, `ps`, `logs`), apagado seguro (advertencia de `down -v` y `docker-reset.ps1`) y enlaces a flujo SDD, plantillas, skills y Git | CA-04, CA-05, CA-06, RN-03 | §9.3 | Todos los enlaces resuelven (`Test-Path` por enlace) | [ ] | |
| T-09 | Actualizar `docs/onboarding/01-instalacion.md` (script de verificación) y `02-variables-entorno.md` (Redis sin contraseña, solo `127.0.0.1`; tabla = plantilla) | CA-03, RN-06 | §9.1, §11 | Las claves de la tabla coinciden con las de `.env.docker.example` (comparación en PowerShell) | [ ] | |

## Fase 5 — Pruebas transversales
| ID | Tarea | Cubre | Plan § | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|---|
| T-10 | Caso negativo de CA-01: `config --quiet` con un `--env-file` temporal sin `MONGO_ROOT_PASSWORD_URLENCODED` falla sin mostrar valores; borrar el archivo temporal | CA-01 | §12 | Código ≠ 0 y mensaje sin secretos | [ ] | |
| T-11 | Persistencia tras apagado: `down` → `up` y `docker volume ls` muestra `mongo_data` y `redis_data` | CA-06, RN-03 | §12 | Volúmenes presentes | [ ] | |
| T-12 | Prueba de reproducibilidad: otro integrante sigue `README_SETUP.md` desde un clon limpio y `verify-local.ps1` devuelve 0 | CA-07, RNF-01 | §12 | Checklist firmado en la evidencia | [ ] | |

## Fase 6 — Release
| ID | Tarea | Cubre | Plan § | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|---|
| T-13 | Resolver el conflicto con `origin/feature/HT-CORE-01`, ejecutar `/sdd-release` y abrir el Pull Request hacia `develop` | Todos | §15 | Checklist de release completo; `sdd-validate.ps1 -Id HT-CORE-01` sin `[FALLA]` | [ ] | |

## Matriz de cobertura
| Criterio / regla | Tareas | Pruebas | Cubierto |
|---|---|---|---|
| CA-01 | T-04, T-10 | `verify-local.ps1 -Static` (5); caso negativo | [ ] |
| CA-02 | T-03, T-05, T-06 | `verify-local.ps1` (6–8) | [ ] |
| CA-03 | T-02, T-04, T-09 | `verify-local.ps1` (1–4) | [ ] |
| CA-04 | T-03, T-05, T-08 | `verify-local.ps1` (7, 9) | [ ] |
| CA-05 | T-01, T-08 | Comprobación de enlaces | [ ] |
| CA-06 | T-06, T-08, T-11 | `Select-String`; `docker volume ls` | [ ] |
| CA-07 | T-12 | Reproducción en clon limpio | [ ] |
| CA-08 | T-07 | Revisión del diff; `Test-Path apps` | [ ] |
| RN-01 | T-02, T-04 | `verify-local.ps1` (2–4) | [ ] |
| RN-02 | T-02 | Revisión del procedimiento | [ ] |
| RN-03 | T-06, T-08, T-11 | `Select-String`; volúmenes | [ ] |
| RN-04 | T-04, T-05 | `verify-local.ps1` (9) | [ ] |
| RN-05 | T-07 | `git diff --stat` | [ ] |
| RN-06 | T-09 | Comparación tabla/plantilla | [ ] |
| RNF-01 | T-12 | Reproducción en clon limpio | [ ] |

## Registro de cambios
| Fecha | Cambio | Motivo |
|---|---|---|
| 2026-10-22 | Creación con `/sdd-spec` | — |
