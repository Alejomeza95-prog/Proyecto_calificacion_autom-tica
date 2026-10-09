# HU-EVAL-001 — Tasks

Spec: `specs/HU-EVAL-001/spec.md` · Estado de la spec: **draft** (no implementar hasta `approved`).

Reglas:
- Cada tarea referencia al menos un criterio de aceptación (`CA-NN`) o requisito técnico (`RT`) de la spec.
- Solo se marca `[x]` cuando su verificación pasa; registrar evidencia (comando y resultado, archivos, endpoint).
- Esta lista es preliminar: se ajustará al cerrar las OPEN QUESTIONS de la spec.

Requisitos técnicos referenciados (sección 3 de la spec):
- `RT-STREAM`: CSV/XLSX en streaming o lotes.
- `RT-RBAC`: DOCENTE/ADMIN cargan; ADMIN anula; auditoría.
- `RT-EVENT`: emitir `RespuestasAsociadas`.
- `RT-VOL`: rendimiento objetivo (sección 8).

## Fase 1 — Datos (MongoDB / Mongoose)
| ID | Tarea | Cubre | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|
| T-01 | Esquema Mongoose `carga_respuestas` (`collection:` explícito, estados, contadores, hash SHA-256, `schemaVersion`) | CA-04, CA-05 | Integración: validaciones de esquema | [ ] | |
| T-02 | Esquema Mongoose `hoja_respuesta` (estado/motivo, fila origen del archivo, estudiante opcional) | CA-01, CA-02, CA-03 | Integración: validaciones de esquema | [ ] | |
| T-03 | Esquema Mongoose `respuesta_estudiante` (examen, estudiante, forma, materia, pregunta, opción, tipo de marca) | CA-01 | Integración: validaciones de esquema | [ ] | |
| T-04 | Índices: único `respuesta_estudiante{examen, estudiante, materia, pregunta}`; único parcial `hoja_respuesta{examen, estudiante}` con estado `ASOCIADA`; único parcial de hash en `carga_respuestas` para cargas no anuladas | CA-01, CA-03, CA-04 | Integración: inserción duplicada rechazada (E11000) | [ ] | |
| T-05 | Script de migración inicial (creación de índices) idempotente y con reversión | CA-01, CA-03, CA-04 | Ejecutar dos veces sin efecto duplicado; reversión probada | [ ] | |

## Fase 2 — Dominio y servicios
| ID | Tarea | Cubre | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|
| T-06 | Almacenamiento del archivo original con hash SHA-256 (GridFS si la spec lo aprueba) | CA-04 | Integración: hash calculado y archivo recuperable | [ ] | |
| T-07 | Parser CSV/XLSX en streaming/lotes con validación de encabezados | RT-STREAM, CA-05 | Unit + prueba de memoria con archivo grande | [ ] | |
| T-08 | Normalización de marcas (A-D, blanco, multimarca; definir UNCERTAIN) | CA-01 | Unit | [ ] | |
| T-09 | `StudentMatcher`: código de estudiante y respaldo por tipo+número de documento; nunca adivina | CA-01, CA-02 | Unit | [ ] | |
| T-10 | Detección de duplicados: conserva la primera ocurrencia válida, el resto a inconsistencia `DUPLICADA` | CA-03 | Unit + integración con índice único | [ ] | |

## Fase 3 — API / jobs
| ID | Tarea | Cubre | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|
| T-11 | POST de carga (202 + job) con conflicto trazable por archivo repetido | CA-04, CA-05 | Contract/integración | [ ] | |
| T-12 | Job BullMQ con progreso, escritura por lotes (`bulkWrite`, `ordered: false`) e idempotencia ante reintentos | CA-01, CA-05 | Integración Redis + MongoDB | [ ] | |
| T-13 | GET estado/progreso y contadores finales | CA-05 | Contract | [ ] | |
| T-14 | GET inconsistencias paginadas, PATCH resolución manual, GET reporte XLSX | CA-02, CA-03 | Contract/integración | [ ] | |
| T-15 | RBAC, anulación restringida a ADMIN y auditoría | RT-RBAC | Contract (403 por rol) + integración de auditoría | [ ] | |
| T-16 | Emitir `RespuestasAsociadas` (mecanismo pendiente: outbox requiere replica set; alternativa: job BullMQ encadenado) | RT-EVENT | Integración | [ ] | |

## Fase 4 — Frontend
| ID | Tarea | Cubre | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|
| T-17 | Pantalla de carga en 3 pasos con dropzone y validaciones cliente | CA-05 | Componente | [ ] | |
| T-18 | Progreso HTTP + job y resumen de totales | CA-05 | Componente/E2E | [ ] | |
| T-19 | Tabla de UI paginada de inconsistencias y modal de resolución | CA-02, CA-03 | E2E | [ ] | |
| T-20 | Historial de cargas y anulación según permisos | RT-RBAC | E2E | [ ] | |

## Fase 5 — Pruebas transversales y release
| ID | Tarea | Cubre | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|
| T-21 | E2E: carga válida, carga con inconsistencias, archivo repetido y resolución manual | CA-01..CA-05 | Playwright | [ ] | |
| T-22 | Prueba de volumen del escenario objetivo | RT-VOL | Medición de tiempo y memoria | [ ] | |
| T-23 | Checklist `/sdd-release` | Todos | Resumen de release | [ ] | |

## Matriz de cobertura
| Criterio | Tareas | Pruebas | Cubierto |
|---|---|---|---|
| CA-01 Asociación correcta | T-02, T-03, T-04, T-08, T-09, T-12 | Unit matcher/normalización; integración índices; E2E | [ ] |
| CA-02 Sin coincidencia | T-02, T-09, T-14, T-19 | Unit matcher; contract inconsistencias; E2E | [ ] |
| CA-03 Duplicado | T-04, T-10, T-14, T-19 | Integración índice parcial; unit duplicados; E2E | [ ] |
| CA-04 Archivo repetido | T-01, T-04, T-06, T-11 | Integración índice de hash; contract 409; E2E | [ ] |
| CA-05 Progreso y resultado | T-07, T-11, T-12, T-13, T-17, T-18 | Integración job; contract estado; E2E | [ ] |
