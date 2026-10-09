---
name: sdd-release
description: Verifica que una historia de usuario terminada en su rama feature/HU-XXXX cumple la Definition of Done y prepara el Pull Request único hacia develop. Usar al finalizar una HU, antes de abrir el PR o al corregir observaciones de revisión.
---

# SDD Release

## Lugar en el flujo
`/sdd-spec` → `/sdd-plan` → `/sdd-tasks` → `/sdd-implement` → pruebas → **`/sdd-release`** → PR único hacia `develop` → revisión → merge.

## Precondiciones
1. Rama actual `feature/<ID>`, actualizada con `develop` (sugerir `git fetch` y `git merge origin/develop` o rebase, según acuerdo del equipo; no ejecutarlo sin pedido).
2. `spec.md`, `plan.md` y `tasks.md` existen; todas las tareas excepto la de release están `[x]`.

## Checklist de Definition of Done
### Documentación SDD
1. `spec.md` y `plan.md` reflejan lo implementado (si cambió algo durante la implementación, está actualizado).
2. Matriz de cobertura de `tasks.md` completa: cada CA tiene tarea y prueba.

### Coherencia con el plan
3. Colecciones, esquemas, índices, endpoints y contratos implementados coinciden con `plan.md`.
4. Scripts de migración idempotentes y reversibles; `schemaVersion` actualizado cuando aplica.
5. Sin transacciones si no hay replica set; GridFS solo si está aprobado.

### Pruebas y calidad
6. Unit, integración contra MongoDB real y E2E (según el plan) pasan.
7. Lint, typecheck y build en verde.
8. Índices únicos/parciales probados con duplicados.

### Seguridad
9. Sin `.env`, credenciales, datos personales ni archivos temporales en el diff.
10. Logs con `correlationId` y sin PII.
11. Sin PostgreSQL, Prisma ni otra base de datos.

No declarar la historia terminada si alguna prueba falla.

## Salida
1. Resumen de release: qué cambió, pruebas ejecutadas (comandos y resultados), scripts de migración, índices creados, riesgos y rollback.
2. **Borrador del Pull Request** hacia `develop` con `.github/pull_request_template.md` completado. Título: `feat(<ID>): <título de la historia>`.
3. Actualizar `status: in-review` en `spec.md` y `tasks.md`.
4. Indicar al desarrollador los comandos para publicar la rama y abrir el PR. **No ejecutar `git push` ni crear el PR**: lo hace el desarrollador.

## Observaciones de revisión
Si el PR recibe observaciones: corregir en la misma rama `feature/<ID>`, actualizar spec/plan/tasks si corresponde, volver a ejecutar este checklist y proponer commits `fix(<ID>): ...`.

## Después del merge
Cuando el PR se integre a `develop`, actualizar `status: done` en `spec.md`, `tasks.md`, `specs/roadmap.md` y `docs/matriz-asignacion.md` (en un PR de seguimiento o en el mismo PR antes del merge, según acuerde el equipo).
