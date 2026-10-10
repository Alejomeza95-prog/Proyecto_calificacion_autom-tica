# Catálogo de historias de usuario

Construido **solo** con lo que existe en el repositorio (2026-10-09): `specs/roadmap.md` y `specs/HU-EVAL-001/spec.md`. No se inventaron historias, criterios ni estimaciones. Donde falta información se indica el documento requerido (ver [`docs/requisitos/README.md`](requisitos/README.md)).

## Resumen
| ID | Módulo | Título (del roadmap) | Spec | Criterios documentados | Fuente disponible |
|---|---|---|---|---|---|
| HT-CORE-01 | Transversal | Base técnica, configuración y servicios locales | [ready](../specs/HT-CORE-01/spec.md) | CA-01..CA-09 | [`requisitos/historias/HT-CORE-01.md`](requisitos/historias/HT-CORE-01.md) |
| HU-EVAL-001 | Evaluación | Asociación automática de respuestas | [draft](../specs/HU-EVAL-001/spec.md) | CA-01..CA-05 (iniciales) | Spec borrador; backlog citado no disponible |
| HU-EVAL-002 | Evaluación | Claves de respuesta versionadas | — | Ninguno | Solo título |
| HU-EVAL-003 | Evaluación | Comparación automática con claves | — | Ninguno | Solo título |
| HU-EVAL-004 | Evaluación | Ponderación hasta 100 puntos por materia | — | Ninguno | Solo título |
| HU-EVAL-005 | Evaluación | Cálculo inmediato de resultados | — | Ninguno | Solo título |
| HU-EVAL-006 | Evaluación | Clasificación por áreas/niveles | — | Ninguno | Solo título |
| HU-EVAL-007 | Evaluación | Estadísticas y exportes | — | Ninguno | Solo título |
| HU-UX-001 | Experiencia de usuario | Diseño de interfaz y experiencia | — | Ninguno | Solo título |
| OMR-001 | Motor OMR | Plantilla, fiduciales y rectificación | — | Ninguno | Solo título |
| OMR-002 | Motor OMR | Lectura de burbujas y ambigüedad | — | Ninguno | Solo título |
| OMR-003 | Motor OMR | Identidad QR + código OMR | — | Ninguno | Solo título |

## Detalle de HU-EVAL-001 (único con contenido)
- **Objetivo:** el docente carga respuestas de un examen (CSV/XLSX) y se asocian automáticamente a estudiantes inscritos.
- **Criterios iniciales:** CA-01 asociación correcta · CA-02 sin coincidencia · CA-03 duplicado · CA-04 archivo repetido · CA-05 progreso y resultado.
- **OPEN QUESTIONS de la spec:** paths/payloads de API, parsing XLSX, límite de tamaño, retención de archivos.
- **Dependencias que menciona la propia spec:** estudiantes inscritos, exámenes, formas de examen, roles DOCENTE/ADMIN, evento `RespuestasAsociadas` hacia el "pipeline de calificación".
- **Estado:** `draft`, pendiente de revisión. No implementar.

## Vacíos detectados
1. **No existen IDs para entidades base** que HU-EVAL-001 necesita (estudiantes/inscripciones, exámenes/formas, usuarios/autenticación). No se crean IDs nuevos: el equipo debe confirmar si están en el backlog original.
2. **Pipeline de calificación:** HU-EVAL-001 menciona continuarlo; los títulos de HU-EVAL-002..005 sugieren ese pipeline, pero el orden y las dependencias reales deben venir del backlog.
3. **Relación OMR ↔ EVAL:** HU-EVAL-001 trabaja con CSV/XLSX; no está documentado cómo se conectan las lecturas OMR-001..003 con la asociación de respuestas.
