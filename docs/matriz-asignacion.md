# Matriz de asignación de historias de usuario

Fecha: 2026-10-09 · Fuente: `specs/roadmap.md` y `specs/HU-EVAL-001/spec.md`.

**Reglas de llenado**
- Prioridad y complejidad: solo con respaldo del backlog (`docs/requisitos/`) o decisión del equipo en reunión de planificación (registrar fecha). Hoy no hay respaldo → `Sin definir`.
- Dependencias funcionales: solo las documentadas. Las dependencias técnicas `DT-NN` son una **propuesta inicial** derivada de la arquitectura aprobada y del título de la historia; validarlas al escribir cada spec. Ver [dependencias-transversales.md](dependencias-transversales.md).
- Responsable: `Sin asignar` hasta la reunión de reparto. Una persona puede tomar la spec y otra la implementación.
- Estado: `pending spec` → `draft` (spec en elaboración en `feature/<ID>`) → `ready` (spec y plan listos) → `in-progress` → `in-review` (PR abierto hacia `develop`) → `done` (integrada en `develop`).

| ID | Módulo | Título | Prioridad | Dependencias | Complejidad estimada | Responsable | Estado | Spec |
|---|---|---|---|---|---|---|---|---|
| HU-EVAL-001 | Evaluación | Asociación automática de respuestas | Sin definir | Funcionales (según spec): estudiantes inscritos, exámenes, formas, roles DOCENTE/ADMIN · Técnicas: DT-01, DT-02, DT-03, DT-04, DT-05, DT-06, DT-07 | Sin definir | Sin asignar | draft (pendiente de revisión) | [spec](../specs/HU-EVAL-001/spec.md) |
| HU-EVAL-002 | Evaluación | Claves de respuesta versionadas | Sin definir | Funcionales: requiere documento fuente · Técnicas: DT-01, DT-04, DT-05, DT-07 | Sin definir | Sin asignar | pending spec | — |
| HU-EVAL-003 | Evaluación | Comparación automática con claves | Sin definir | Funcionales: requiere documento fuente · Técnicas: DT-01, DT-05, DT-07 | Sin definir | Sin asignar | pending spec | — |
| HU-EVAL-004 | Evaluación | Ponderación hasta 100 puntos por materia | Sin definir | Funcionales: requiere documento fuente · Técnicas: DT-01, DT-05, DT-07 | Sin definir | Sin asignar | pending spec | — |
| HU-EVAL-005 | Evaluación | Cálculo inmediato de resultados | Sin definir | Funcionales: requiere documento fuente · Técnicas: DT-01, DT-05, DT-07 | Sin definir | Sin asignar | pending spec | — |
| HU-EVAL-006 | Evaluación | Clasificación por áreas/niveles | Sin definir | Funcionales: requiere documento fuente · Técnicas: DT-01, DT-05, DT-07 | Sin definir | Sin asignar | pending spec | — |
| HU-EVAL-007 | Evaluación | Estadísticas y exportes | Sin definir | Funcionales: requiere documento fuente · Técnicas: DT-01, DT-04, DT-05, DT-07 | Sin definir | Sin asignar | pending spec | — |
| HU-UX-001 | Experiencia de usuario | Diseño de interfaz y experiencia | Sin definir | Funcionales: requiere documento fuente · Técnicas: DT-01 (web) | Sin definir | Sin asignar | pending spec | — |
| OMR-001 | Motor OMR | Plantilla, fiduciales y rectificación | Sin definir | Funcionales: requiere documento fuente · Técnicas: DT-01 (omr), DT-03, DT-07 | Sin definir | Sin asignar | pending spec | — |
| OMR-002 | Motor OMR | Lectura de burbujas y ambigüedad | Sin definir | Funcionales: requiere documento fuente · Técnicas: DT-01 (omr), DT-03, DT-06, DT-07 | Sin definir | Sin asignar | pending spec | — |
| OMR-003 | Motor OMR | Identidad QR + código OMR | Sin definir | Funcionales: requiere documento fuente · Técnicas: DT-01 (omr), DT-03, DT-04, DT-07 | Sin definir | Sin asignar | pending spec | — |

## Asignación técnica transversal
| ID | Decisión | Responsable | Estado |
|---|---|---|---|
| DT-01 | Creación de `apps/api`, `apps/web`, `apps/omr` | Sin asignar | Pendiente |
| DT-02 | Replica set de MongoDB | Sin asignar | Pendiente |
| DT-03 | GridFS para archivos | Sin asignar | Propuesta |
| DT-04 | Autenticación y RBAC | Sin asignar | Pendiente |
| DT-05 | Estrategia de pruebas e integración MongoDB | Sin asignar | Pendiente |
| DT-06 | Colas Redis + BullMQ (convenciones) | Sin asignar | Pendiente |
| DT-07 | Herramienta de migraciones MongoDB | Sin asignar | Pendiente |
| DT-08 | CI (lint, typecheck, pruebas) y protección de `main` y `develop` | Sin asignar | Pendiente |
| DT-09 | Entidades base (estudiantes, exámenes, formas, usuarios) | Sin asignar | Pendiente de documento fuente |
