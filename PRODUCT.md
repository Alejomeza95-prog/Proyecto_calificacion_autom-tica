# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Docente** de una academia/preuniversitario PreICFES: aplica simulacros, sube las hojas de respuesta (escaneadas por lote o fotografiadas con el celular) o archivos CSV/XLSX, resuelve inconsistencias y revisa resultados.
- **Administrador (ADMIN)** de la academia: gestiona exámenes, formas y claves de respuesta, y es el único que puede anular una carga.
- Los estudiantes **no** usan el sistema; son sujetos de la calificación, no usuarios. (Confirmado en init, 2026-10-10.)

## Product Purpose

Calificar automáticamente evaluaciones tipo PreICFES: leer por OMR las hojas de respuesta, asociarlas con el estudiante inscrito, compararlas con la clave versionada del examen, calcular puntajes de 0 a 100 por área y producir estadísticas y exportes. El éxito es eliminar la digitación manual sin perder trazabilidad: ninguna calificación se emite sobre una lectura o identidad dudosa.

## Positioning

La lectura nunca adivina. Cada marca se clasifica en A/B/C/D, BLANK, MULTIPLE o UNCERTAIN, y toda lectura dudosa o identidad conflictiva se envía a revisión manual en lugar de calificarse. La confiabilidad y la trazabilidad (quién cargó qué, cuándo, con qué resultado) son el producto, no un extra.

## Operating Context

- Captura mixta: escáner/multifuncional por lote en la oficina de la academia y fotos con celular como respaldo. Tanto escritorio como móvil importan.
- Flujo principal: el docente elige examen y archivo → el sistema responde con un trabajo asíncrono y su progreso → al terminar muestra total, asociadas, pendientes y rechazadas → el docente resuelve inconsistencias (sin coincidencia, duplicada, forma inválida) → resultados por área.
- Volumen objetivo heredado del backlog (aún no SLA): 10.000 estudiantes × 5 materias en menos de 2 minutos por worker.

## Capabilities and Constraints

- Áreas: Matemáticas, Ciencias Naturales, Competencias Ciudadanas, Lectura Crítica e Inglés. Puntajes por área de 0 a 100.
- Estados de lectura: A, B, C, D, BLANK, MULTIPLE, UNCERTAIN.
- Estados de hoja (HU-EVAL-001, borrador): `ASOCIADA`, `PENDIENTE_VALIDACION` (motivo p. ej. `SIN_COINCIDENCIA`), `DUPLICADA`; archivo repetido detectado por SHA-256.
- Roles: DOCENTE y ADMIN; anulación de cargas solo ADMIN. Auditoría de usuario, fecha, archivo y totales.
- Identidad del estudiante: código de estudiante, respaldo por tipo + número de documento; QR + código OMR en la hoja (OMR-003).
- Stack aprobado: React + Vite + TypeScript en el frontend (ver `specs/000-architecture/architecture.md`).
- La interfaz es una historia propia, HU-UX-001, aún sin spec; todo trabajo de UI debe pasar por el flujo SDD.
- **Abiertos:** paths de API, límite de tamaño de archivo, retención de originales, almacenamiento en GridFS (DT-03), autenticación (DT-04). No hay documentos fuente en `docs/requisitos/`.

## Brand Commitments

Sin marca aún. Nombre provisional "Sistema OMR PreICFES"; no hay logo, colores ni nombre de producto comprometidos. Idioma de la interfaz: español (Colombia), coherente con la terminología ICFES.

## Evidence on Hand

- `specs/HU-EVAL-001/spec.md` (borrador), `specs/roadmap.md`, `docs/catalogo-historias.md`.
- No hay hojas de respuesta de ejemplo, plantilla OMR, capturas, datos de prueba ni testimonios. No inventar instituciones, estudiantes, cifras de precisión ni clientes.
- Datos personales reales de estudiantes no deben versionarse ni aparecer en mockups.

## Product Principles

1. **Ante la duda, revisión humana.** La interfaz hace visible y rápido resolver lo ambiguo; nunca lo oculta tras un puntaje.
2. **Trazabilidad por defecto.** Cada carga, hoja y corrección muestra su origen, estado y responsable.
3. **Progreso honesto.** Los trabajos asíncronos muestran avance y resultado real (asociadas, pendientes, rechazadas), no spinners vacíos.
4. **Trabajo por lote.** El docente procesa cientos de hojas por sesión; la eficiencia en volumen pesa más que la primera impresión.
5. **Funciona donde se captura.** Escritorio para el lote, móvil para la foto de respaldo.

## Accessibility & Inclusion

Sin requisito normativo establecido. Los estados de lectura y de hoja no deben depender solo del color, dado que distinguir BLANK/MULTIPLE/UNCERTAIN es crítico para la corrección.
