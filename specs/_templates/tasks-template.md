---
id: HU-XXXX-000
spec: ./spec.md
plan: ./plan.md
status: draft            # draft | ready | in-progress | in-review | done
updated: YYYY-MM-DD
---

# <ID> — Tasks

Rama: `feature/<ID>` (desde `develop`).

Reglas:
- Generado por `/sdd-spec` (en `draft`) junto con `spec.md` y `plan.md`; `/sdd-tasks` lo actualiza cuando cambian. Pasa a `ready` solo cuando spec y plan están en `ready` y la trazabilidad se valida (`scripts/sdd-validate.ps1 -Id <ID>`).
- No se implementa con este archivo en `draft`.
- Cada tarea `T-NN` referencia al menos un criterio (`CA-NN`), regla (`RN-NN`) o requisito no funcional (`RNF-NN`) y la sección del plan que implementa.
- Una tarea solo se marca `[x]` cuando su verificación pasa; registrar evidencia (comando y resultado, archivos, endpoint) y el commit.
- Si durante la implementación el plan resulta incorrecto, actualizar primero `plan.md` y luego estas tareas.
- Al actualizar: nunca borrar ni desmarcar tareas `[x]` ni su evidencia; no renumerar; las tareas obsoletas se tachan `~~T-NN~~ (obsoleta: motivo)`.
- Columna **Cubre**: `CA-NN`, `RN-NN`, `RNF-NN` o `Soporte` (con justificación en la tarea).

## Fase 1 — Datos (MongoDB / Mongoose)
| ID | Tarea | Cubre | Plan § | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|---|
| T-01 | Esquema `<coleccion>` con `collection:` explícito, validaciones y `schemaVersion` | CA-.. | §3 | Integración: validaciones de esquema | [ ] | |
| T-02 | Índices de `<coleccion>` | CA-.., RN-.. | §4 | Integración: duplicado rechazado (E11000) | [ ] | |
| T-03 | Script de migración `<NNN-descripcion>` con reversión | RN-.. | §7 | Ejecutar dos veces sin efecto duplicado; reversión probada | [ ] | |

## Fase 2 — Dominio y servicios
| ID | Tarea | Cubre | Plan § | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|---|
| T-.. | | | §2.3 | Unit | [ ] | |

## Fase 3 — API / jobs
| ID | Tarea | Cubre | Plan § | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|---|
| T-.. | | | §8, §9 | Contract / integración | [ ] | |

## Fase 4 — Frontend
| ID | Tarea | Cubre | Plan § | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|---|
| T-.. | | | §2.1 | Componente / E2E | [ ] | |

## Fase 5 — Pruebas transversales
| ID | Tarea | Cubre | Plan § | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|---|
| T-.. | E2E de flujos críticos | CA-.. | §12 | Playwright | [ ] | |

## Fase 6 — Release
| ID | Tarea | Cubre | Plan § | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|---|
| T-.. | `/sdd-release` y Pull Request hacia `develop` | Todos | — | Checklist de release completo | [ ] | |

## Matriz de cobertura
| Criterio / regla | Tareas | Pruebas | Cubierto |
|---|---|---|---|
| CA-01 | T-.. | ... | [ ] |

## Registro de cambios
| Fecha | Cambio | Motivo |
|---|---|---|
| YYYY-MM-DD | Creación con `/sdd-spec` | — |
