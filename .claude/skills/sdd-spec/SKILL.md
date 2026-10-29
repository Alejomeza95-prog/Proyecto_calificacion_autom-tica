---
name: sdd-spec
description: Genera en una sola ejecución la carpeta specs/<ID>/ con spec.md (qué y por qué), plan.md (cómo) y tasks.md (pasos) de una historia de usuario, todos en draft y con trazabilidad validada. Usar cuando se pida especificar, documentar o iniciar una HU, convertir requisitos en spec o aclarar criterios de aceptación. No implementa.
argument-hint: <ID> [requisitos y criterios de aceptación, o ruta del documento fuente en docs/requisitos/]
---

# SDD Spec — genera spec.md + plan.md + tasks.md

## Lugar en el flujo
```
develop ──► feature/<ID> ──► /sdd-spec ──────────────────────► revisión ──► /sdd-implement ──► pruebas ──► /sdd-release ──► PR único hacia develop
                             spec.md + plan.md + tasks.md      del dev:     (solo con spec y
                             (los tres en draft)               ready        plan en ready)
                             /sdd-plan y /sdd-tasks: actualizar o regenerar cuando cambien los requisitos
```
Esta skill **solo documenta**. Nunca escribe código de la aplicación ni inicia `/sdd-implement`.

## Entrada
`/sdd-spec <ID> [requisitos]`, donde los requisitos pueden ser:
- texto aportado por el desarrollador (objetivo, reglas, criterios de aceptación), o
- la ruta de un documento en `docs/requisitos/`.

## Paso 0 — Precondiciones
1. Leer `CLAUDE.md`, `specs/000-architecture/architecture.md`, `docs/SOURCE_OF_TRUTH.md`, `docs/dependencias-transversales.md` y las skills `project-architecture` y `mongodb-mongoose`.
2. Rama actual (`git branch --show-current`):
   - `feature/<ID>`: continuar.
   - `main`: detenerse. No se documenta en la rama estable.
   - `develop` u otra: advertir y ofrecer crear `feature/<ID>` desde `develop` actualizado (`git switch develop`, `git pull`, `git switch -c feature/<ID>`), **solo con confirmación**. Si el desarrollador prefiere generar primero, continuar sin commitear y recordarle que `git switch -c feature/<ID>` lleva los archivos sin confirmar a la nueva rama; ningún commit se hace fuera de `feature/<ID>`.
3. Si `specs/<ID>/` ya existe con alguno de los tres archivos: **no sobrescribir**. Aplicar la sección «Actualizar una historia existente».

## Paso 1 — Verificar información esencial (no inventar)
Antes de crear archivos, comprobar que existe, en los requisitos aportados o en `docs/requisitos/`:

| Dato esencial | Si falta |
|---|---|
| ID de la historia (`HU-...`, `OMR-...`, `HT-...`) | Pedirlo |
| Objetivo: rol, capacidad y valor | Pedirlo |
| Requisitos o reglas de negocio, aunque sean breves | Pedirlos |
| Al menos un criterio de aceptación verificable, o información suficiente para redactarlo sin suponer comportamiento | Pedirlo |
| Responsable (`owner`) | Pedirlo, o usar `git config user.name` y avisarlo |

- Si falta un dato esencial: **detenerse sin crear archivos**, listar exactamente qué falta con una pregunta concreta por dato, y esperar la respuesta.
- Los vacíos no esenciales (límites, paths, volúmenes, retención, decisiones técnicas) no bloquean: se registran como `OPEN QUESTIONS` en spec §12 o plan §15.
- Requisitos aportados en el chat: citarlos como fuente en spec §2 y registrarlos en spec §14 («Requisitos aportados por <owner>, <fecha>»), conforme a la regla de `CLAUDE.md` de respaldar todo requisito en `docs/requisitos/` o en una decisión registrada. Sugerir guardarlos después en `docs/requisitos/historias/<ID>.md`.
- Nunca inventar criterios, reglas, estimaciones ni volúmenes. Lo que no tenga fuente queda como OPEN QUESTION.

## Paso 2 — Generar los tres archivos en esta misma ejecución
Crear `specs/<ID>/` y, a partir de las plantillas oficiales, **sin eliminar secciones** (las que no apliquen se marcan «No aplica» con el motivo):

### 2.1 `spec.md` — desde `specs/_templates/spec-template.md`
- Front matter: `id`, `title`, `owner`, `branch: feature/<ID>`, `status: draft`, `updated: <fecha de hoy>`.
- Objetivo, contexto y fuentes, alcance, fuera de alcance, supuestos, dependencias funcionales.
- Reglas `RN-NN`, flujo, estados, roles, datos de negocio (marcando los personales).
- Criterios `CA-NN` en Dado/Cuando/Entonces, cada uno verificable, **fieles a los aportados por el desarrollador**.
- `RNF-NN` solo con respaldo. OPEN QUESTIONS sin respuesta inventada.
- Lenguaje de negocio; nada de esquemas, índices ni endpoints.

### 2.2 `plan.md` — desde `specs/_templates/plan-template.md`
Propuesta de diseño técnico coherente con la arquitectura aprobada:
- Front matter con `status: draft`.
- Componentes (`apps/backend`, `apps/frontend`, `apps/omr`, workers) y módulos indicando qué `RN-NN` implementa cada uno.
- Colecciones y esquemas Mongoose con `collection:` explícito, validaciones, referencias `ObjectId`, `schemaVersion` y PII.
- Índices justificados por una consulta, `RN` o `CA`.
- Consistencia: transacciones solo con replica set (DT-02); si no está resuelta, índices únicos, operaciones atómicas o `bulkWrite` idempotente.
- GridFS solo como propuesta pendiente (DT-03). Migraciones idempotentes y reversibles.
- Endpoints, contratos (DTOs, jobs BullMQ), dependencias (historias y `DT-NN`), seguridad y auditoría.
- **§12 Estrategia de pruebas: cada `CA-NN` y `RN-NN` con nivel, caso y herramienta.**
- Decisiones `DEC-NN` marcadas como «propuesta» y OPEN QUESTIONS técnicas, señalando las DT que bloquean.
- Prohibido PostgreSQL, Prisma, MySQL u otra base de datos, y cualquier tecnología fuera de la arquitectura sin registrarla como decisión y avisar.

### 2.3 `tasks.md` — desde `specs/_templates/tasks-template.md`
- Front matter con `status: draft`.
- Tareas `T-NN` correlativas, pequeñas (idealmente un commit), por fases: datos → dominio → API/jobs → frontend → pruebas transversales → release.
- Cada tarea con **Cubre** (`CA-NN`/`RN-NN`/`RNF-NN`, o «Soporte» justificado), **Plan §** y **Verificación** concreta.
- Tarea final: `/sdd-release` y PR hacia `develop`.
- Matriz de cobertura completa.

## Paso 3 — Validar la trazabilidad
Comprobar, y corregir antes de terminar:
1. Cada `CA-NN` de la spec tiene diseño y caso de prueba en plan §12 y al menos una tarea en `tasks.md`.
2. Cada `RN-NN` aparece en plan §2.3 (o en §12) y en al menos una tarea.
3. Cada tarea cita un `CA`/`RN`/`RNF` existente (o es «Soporte») y una sección existente del plan.
4. Ningún ID referenciado en plan o tareas falta en la spec.
5. Los tres documentos están en `draft`.

Ejecutar además el validador del repositorio:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/sdd-validate.ps1 -Id <ID>
```
Si informa `[FALLA]`, corregir los documentos y repetir. Incluir el resultado en la respuesta.

## Paso 4 — Entregar y detenerse
Responder con:
1. Rutas creadas: `specs/<ID>/spec.md`, `plan.md`, `tasks.md`.
2. Resumen: número de `RN`, `CA`, `RNF`, tareas y decisiones propuestas.
3. Matriz `CA → tareas → prueba` y resultado del validador.
4. OPEN QUESTIONS de negocio y técnicas que impiden marcar `ready`.
5. Próximos pasos para el desarrollador:
   - revisar `spec.md` y su checklist §13; resolver OPEN QUESTIONS; confirmar `ready`;
   - revisar `plan.md` y su checklist §16; confirmar `ready`;
   - si cambian requisitos: `/sdd-plan <ID>` y `/sdd-tasks <ID>` para actualizar;
   - con spec y plan en `ready`: `/sdd-tasks <ID>` para dejar `tasks.md` en `ready` y luego `/sdd-implement <ID>`.
6. Commit sugerido (no ejecutarlo sin pedido): `docs(<ID>): crear spec, plan y tareas`.

**No cambiar ningún estado a `ready` por iniciativa propia.** Solo se marca `ready` cuando el desarrollador lo confirma de forma explícita tras revisar el checklist correspondiente.

## Actualizar una historia existente
Si `specs/<ID>/` ya existe:
- `spec.md`: actualizar conservando el contenido; mantener los IDs `RN`/`CA` existentes (no renumerar); marcar los eliminados como `~~CA-NN~~ (retirado: motivo)`; registrar el cambio en §14. Si estaba en `ready` o posterior y el cambio altera comportamiento, volver a `draft` con aviso al desarrollador.
- Falta `plan.md` o `tasks.md`: generarlos desde la spec actual siguiendo los pasos 2.2 y 2.3.
- Ya existen: no regenerarlos aquí; indicar `/sdd-plan <ID>` y `/sdd-tasks <ID>` para sincronizarlos con los cambios.
- Nunca sobrescribir un archivo completo sin mostrar qué cambia y obtener confirmación.

## Vocabulario
Lenguaje de negocio en la spec. En términos técnicos, preferir los de MongoDB: colección, documento, referencia. No usar tabla, foreign key, JOIN ni migración Prisma.

## Criterio de buena salida
Otra persona del equipo puede revisar spec, plan y tareas, y escribir las pruebas, sin preguntar qué significa el requisito central ni de dónde salió cada tarea.
