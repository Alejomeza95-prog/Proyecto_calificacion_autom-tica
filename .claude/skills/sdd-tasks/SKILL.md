---
name: sdd-tasks
description: Genera o actualiza tasks.md de una historia de usuario a partir de spec.md y plan.md listos, con tareas T-NN ordenadas por fases y vinculadas a criterios de aceptación y secciones del plan. Usar después de /sdd-plan y antes de /sdd-implement.
---

# SDD Tasks

## Lugar en el flujo
`/sdd-spec` → `/sdd-plan` → **`/sdd-tasks`** → `/sdd-implement` → pruebas → `/sdd-release` → PR único hacia `develop`.

## Precondiciones
1. Rama actual `feature/<ID>`. Si no, detenerse e indicarlo.
2. `specs/<ID>/spec.md` y `specs/<ID>/plan.md` existen con `status: ready`. Si alguno no lo está, detenerse e indicar qué falta.
3. Si `specs/<ID>/tasks.md` ya existe, actualizarlo conservando tareas completadas y su evidencia; nunca sobrescribirlo completo sin confirmación.

## Salida
`specs/<ID>/tasks.md` creado desde `specs/_templates/tasks-template.md`.

## Pasos
1. Derivar tareas del plan, en este orden de fases: datos (esquemas, índices, migraciones) → dominio y servicios → API/jobs → frontend → pruebas transversales → release.
2. Cada tarea:
   - ID `T-NN` correlativo;
   - pequeña (idealmente un commit);
   - columna **Cubre** con al menos un `CA-NN`, `RN-NN` o `RNF-NN`;
   - columna **Plan §** con la sección del plan que implementa;
   - columna **Verificación** con la prueba o evidencia concreta.
3. Incluir la tarea final de release: `/sdd-release` y PR hacia `develop`.
4. Completar la matriz de cobertura: **ningún CA puede quedar sin tarea ni prueba**. Ninguna tarea puede quedar sin CA/RN/RNF (salvo tareas técnicas de soporte, marcadas como tales).
5. Marcar `status: pending` y sugerir commit (no ejecutarlo sin pedido): `docs(<ID>): crear tareas`.

## Guardas
- No inventar alcance: si una tarea no se justifica en la spec o el plan, no se agrega; se propone el cambio en el documento correspondiente.
- No escribir código de la aplicación.

## Siguiente paso
`/sdd-implement <ID>`.
