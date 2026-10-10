# Documentos fuente de requisitos

Carpeta para incorporar los documentos que respaldan historias de usuario, criterios de aceptación y estimaciones. **Ninguna spec debe crear historias, criterios ni estimaciones que no estén respaldados por un documento de esta carpeta o por una decisión registrada del equipo.**

## Estado (2026-10-09)
Verificado el repositorio y su carpeta contenedora: **no hay documentos fuente disponibles**.

| Documento esperado | Carpeta sugerida | Estado | Necesario para |
|---|---|---|---|
| Documento de requisitos del sistema de evaluación OMR | `requisitos-sistema/` | Falta | Todas las specs |
| Historias de usuario (con criterios de aceptación) | `historias/` | Falta | Specs HU-EVAL-002..007, HU-UX-001, OMR-001..003 |
| Backlog priorizado (prioridad, estimaciones, dependencias) | `backlog/` | Falta | Matriz de asignación; rendimiento citado en HU-EVAL-001 §8 |
| Arquitectura técnica del sistema OMR | `arquitectura-tecnica/` | Falta | Contrastar con `specs/000-architecture` |
| "Especificación MongoDB de HU-EVAL-001" | `historias/` | Falta | Reglas de persistencia de HU-EVAL-001 (citada en `SOURCE_OF_TRUTH.md`) |
| HT-CORE-01 — Base técnica, configuración y servicios locales | `historias/HT-CORE-01.md` | Incorporado (2026-10-10, texto del responsable) | `specs/HT-CORE-01` |

## Cómo incorporarlos
1. Rama `docs/requisitos-<tema>`.
2. Guardar el original (PDF/DOCX/XLSX) y, si es posible, una versión Markdown para que Claude Code la lea con facilidad.
3. **Eliminar datos personales reales** (estudiantes, documentos de identidad, correos) y secretos antes de versionar.
4. Si un documento contiene referencias a PostgreSQL/Prisma, agregar una nota indicando que la persistencia vigente es MongoDB + Mongoose (precedencia en `docs/SOURCE_OF_TRUTH.md`).
5. Actualizar `docs/catalogo-historias.md` y `docs/matriz-asignacion.md` con los datos respaldados.
