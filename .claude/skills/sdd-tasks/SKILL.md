---
name: sdd-tasks
description: Actualiza o regenera tasks.md de una historia de usuario a partir de spec.md y plan.md, con tareas T-NN por fases vinculadas a criterios de aceptación y secciones del plan, sin borrar tareas completadas ni su evidencia. Usar cuando cambien la spec o el plan, o para dejar tasks.md en ready antes de /sdd-implement.
argument-hint: <ID> [cambios o motivo de la actualización]
---

# SDD Tasks — actualizar o regenerar tasks.md

## Lugar en el flujo
`/sdd-spec` (crea spec + plan + tasks en `draft`) → revisión → `/sdd-plan` → **`/sdd-tasks`** → `/sdd-implement` → pruebas → `/sdd-release` → PR único hacia `develop`.

`tasks.md` normalmente ya existe porque lo genera `/sdd-spec`. Esta skill lo sincroniza con `spec.md` y `plan.md`.

## Precondiciones
1. Rama actual `feature/<ID>`. En `main` detenerse; en otra rama, advertir y no commitear fuera de `feature/<ID>`.
2. `specs/<ID>/spec.md` y `specs/<ID>/plan.md` existen (cualquier estado). Si falta alguno, detenerse e indicar `/sdd-spec <ID>` o `/sdd-plan <ID>`.
3. Si `tasks.md` no existe, crearlo desde `specs/_templates/tasks-template.md` con `status: draft`.

## Conservar la información aprobada
Si `tasks.md` ya existe:
1. **Nunca borrar ni desmarcar** tareas `[x]` ni su evidencia o commit.
2. Mantener los IDs `T-NN` existentes; las tareas nuevas toman el siguiente número libre (no renumerar).
3. Tareas pendientes que ya no se justifican: marcarlas `~~T-NN~~ (obsoleta: motivo)`; no eliminarlas sin confirmación.
4. Si una tarea completada queda afectada por un cambio de requisitos, no tocarla: crear una tarea nueva de ajuste que la referencie.
5. Registrar el cambio en «Registro de cambios».
6. Mostrar el resumen de cambios antes de escribir; nunca sobrescribir el archivo completo sin confirmación explícita.

## Reglas de las tareas
1. Fases en orden: datos (esquemas, índices, migraciones) → dominio y servicios → API/jobs → frontend → pruebas transversales → release.
2. Cada tarea:
   - ID `T-NN` correlativo;
   - pequeña (idealmente un commit);
   - **Cubre** con al menos un `CA-NN`, `RN-NN` o `RNF-NN` (las técnicas de soporte se marcan «Soporte» con justificación);
   - **Plan §** con la sección del plan que implementa;
   - **Verificación** con la prueba o evidencia concreta.
3. Tarea final de release: `/sdd-release` y PR hacia `develop`.
4. Matriz de cobertura completa: **ningún CA vigente sin tarea ni prueba**.

## Validación y estado
1. Ejecutar `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/sdd-validate.ps1 -Id <ID>` y corregir cualquier `[FALLA]`.
2. Estado:
   - `draft` mientras `spec.md` o `plan.md` no estén en `ready`;
   - `ready` cuando spec y plan están en `ready` **y** el validador pasa: proponerlo al desarrollador y marcarlo con su confirmación;
   - `in-progress`, `in-review` y `done` los fijan `/sdd-implement` y `/sdd-release`.
3. Sugerir commit (no ejecutarlo sin pedido): `docs(<ID>): actualizar tareas`.

## Guardas
- No inventar alcance: si una tarea no se justifica en la spec o el plan, no se agrega; se propone el cambio en el documento correspondiente.
- No escribir código de la aplicación ni iniciar la implementación.

## Siguiente paso
Con spec, plan y tasks en `ready`: `/sdd-implement <ID>` (lo invoca el desarrollador).
