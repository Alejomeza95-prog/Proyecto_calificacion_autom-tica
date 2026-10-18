---
name: sdd-implement
description: Implementa una historia de usuario tarea por tarea según su spec.md, plan.md y tasks.md, en la rama feature/HU-XXXX, con pruebas y evidencia trazable. Solo la invoca el desarrollador con /sdd-implement, después de confirmar spec.md y plan.md en ready.
argument-hint: <ID>
disable-model-invocation: true
---

# SDD Implement

## Lugar en el flujo
`/sdd-spec` (spec + plan + tasks en `draft`) → revisión del desarrollador (`ready`) → `/sdd-plan`/`/sdd-tasks` si cambian requisitos → **`/sdd-implement`** → pruebas → `/sdd-release` → PR único hacia `develop`.

## Precondiciones
1. Rama actual `feature/<ID>`. Nunca implementar en `develop` ni en `main`.
2. `spec.md` y `plan.md` con `status: ready`, y `tasks.md` con `status: ready` (o `in-progress` si se continúa). Si falta alguno o sigue en `draft`, **detenerse**: indicar qué revisar y qué skill ejecutar (`/sdd-spec`, `/sdd-plan`, `/sdd-tasks`). Nunca cambiar estados a `ready` desde esta skill.
3. Ejecutar `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/sdd-validate.ps1 -Id <ID>`; si hay `[FALLA]`, detenerse.
4. **Pedir confirmación explícita** al desarrollador, antes de la primera tarea, de que revisó `spec.md` y `plan.md`, que están en `ready` y que reflejan lo que se va a construir. Sin esa confirmación en la sesión, no implementar.
5. Las dependencias técnicas (DT-NN) que el plan marque como bloqueantes deben estar resueltas; si no, detenerse e informarlo.
6. Al iniciar, actualizar `status: in-progress` en `spec.md` y `tasks.md`.

## Ciclo por tarea
1. Tomar la siguiente tarea `T-NN` pendiente, respetando el orden de fases.
2. Implementar el cambio mínimo según la sección del plan indicada.
3. Escribir o actualizar las pruebas que verifican sus `CA-NN`/`RN-NN`.
4. Ejecutar pruebas, lint y typecheck relevantes.
5. Marcar `[x]` en `tasks.md` con evidencia: archivos, comando y resultado.
6. Proponer el commit en la rama de trabajo con Conventional Commits, por ejemplo `feat(<ID>): agregar esquema clave_respuesta (T-01)`. Ejecutarlo solo si el desarrollador lo pide; nunca `git push` ni PR desde esta skill.

## Si el plan no encaja
No improvisar. Detenerse, proponer el ajuste en `plan.md` (y en `spec.md` si cambia el comportamiento), actualizar `tasks.md` y continuar con la confirmación del desarrollador.

## Persistencia (MongoDB + Mongoose)
- Seguir la skill `mongodb-mongoose` y las secciones §3–§7 del plan.
- Cambios de esquema o índices siempre con script de migración idempotente y reversible.
- Sin transacciones si el plan no documenta replica set disponible.
- GridFS solo si el plan lo establece y DT-03 está aprobada.

## Prohibiciones
- No cambiar contratos públicos fuera de lo definido en el plan.
- No modificar datos ni índices directamente en la base de datos.
- No introducir PostgreSQL, Prisma, MySQL ni otra base de datos.
- No ocultar fallos con `try/catch` vacíos, `any`, casts inseguros o desactivando pruebas.
- No leer ni imprimir `.env`.

## Siguiente paso
Cuando todas las tareas de implementación y pruebas estén completas: `/sdd-release <ID>`.
