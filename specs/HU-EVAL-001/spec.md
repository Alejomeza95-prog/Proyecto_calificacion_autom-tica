---
id: HU-EVAL-001
status: draft
owner: team
updated: 2026-10-09
---

# HU-EVAL-001 — Asociación automática de respuestas con estudiante

## 1. Objetivo
Como Docente, quiero cargar respuestas de un examen y asociarlas automáticamente con cada estudiante inscrito, para evitar digitación manual y mantener trazabilidad de inconsistencias.

## 2. Alcance inicial
- Carga CSV/XLSX.
- Asociación por código de estudiante y, como respaldo, tipo+número de documento normalizado.
- Registro de hojas asociadas, pendientes y descartadas.
- Persistencia de respuestas A-D, blanco y multimarca.
- Reporte de inconsistencias y resolución manual.
- Job asíncrono con progreso.

## 3. Reglas críticas
- Una sola hoja `ASOCIADA` por estudiante y examen.
- Una sola respuesta por examen + estudiante + materia + número de pregunta.
- Duplicados conservan la primera ocurrencia válida y el resto va a inconsistencia.
- Formas de examen inexistentes son inválidas.
- Archivo repetido se detecta por SHA-256.
- CSV/XLSX se procesa en streaming o lotes para no cargar todo a memoria.
- El backend nunca adivina una identidad sin coincidencia.

## 4. Flujo
1. Docente selecciona examen y archivo.
2. API valida tipo/tamaño y guarda el archivo original (propuesta: GridFS, pendiente de aprobación en esta spec).
3. API crea `carga_respuestas` y responde 202 con job.
4. Worker parsea, valida encabezados, normaliza marcas y asocia estudiantes.
5. Worker persiste por lotes y actualiza progreso.
6. Al terminar, actualiza contadores y genera reporte de inconsistencias.
7. Se emite el evento `RespuestasAsociadas` para continuar el pipeline de calificación.

## 5. Datos mínimos
- `carga_respuestas`: metadata del archivo, hash, estado, contadores, usuario y tiempos.
- `hoja_respuesta`: carga, examen, estudiante opcional, forma, fila origen, estado/motivo y datos crudos necesarios para resolver.
- `respuesta_estudiante`: examen, estudiante, forma, materia, pregunta, opción y tipo de marca.

Constraints e índices deben seguir `mongodb-mongoose` y la arquitectura canónica.

## 6. API mínima
- POST de carga de respuestas para un examen.
- GET job/estado y progreso.
- GET inconsistencias paginadas.
- PATCH de resolución manual.
- GET reporte de inconsistencias.
- Anulación de carga restringida a ADMIN.

Los paths exactos deben fijarse antes de pasar esta spec a `approved`.

## 7. Criterios de aceptación iniciales
### CA-01 — Asociación correcta
**Dado** un estudiante inscrito con código válido  
**Cuando** una fila del archivo contiene ese código  
**Entonces** la hoja queda asociada al estudiante y sus respuestas se persisten una sola vez.

### CA-02 — Sin coincidencia
**Dado** un identificador que no corresponde a un inscrito  
**Cuando** se procesa la fila  
**Entonces** queda `PENDIENTE_VALIDACION` con motivo `SIN_COINCIDENCIA` y no se inventa una asociación.

### CA-03 — Duplicado
**Dado** un estudiante ya asociado en el mismo examen  
**Cuando** aparece otra hoja para el mismo estudiante  
**Entonces** la nueva fila queda como inconsistencia `DUPLICADA` sin sobrescribir la válida.

### CA-04 — Archivo repetido
**Dado** un archivo con el mismo SHA-256 de una carga activa/no anulada  
**Cuando** el usuario intenta subirlo otra vez  
**Entonces** el sistema evita duplicarlo y devuelve una respuesta de conflicto trazable.

### CA-05 — Progreso y resultado
**Dado** un archivo aceptado  
**Cuando** el job se ejecuta  
**Entonces** el usuario puede consultar progreso y al finalizar obtiene total, asociadas, pendientes y rechazadas.

## 8. Rendimiento objetivo
Prueba de volumen objetivo heredada del backlog: 10.000 estudiantes x 5 materias en menos de 2 minutos con menos de 512 MB por worker. Debe validarse y ajustarse en entorno de prueba real antes de marcarlo como SLA.

## 9. Seguridad
- DOCENTE y ADMIN pueden cargar.
- ADMIN puede anular.
- Auditoría de usuario, fecha, archivo y totales.

## 10. OPEN QUESTIONS antes de aprobar
- Paths y payloads exactos de API.
- Estrategia final de parsing XLSX en el backend Node vs servicio dedicado.
- Límite definitivo de tamaño de archivo.
- Retención exacta de archivos originales.
