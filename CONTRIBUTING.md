# Cómo contribuir

1. Lee [`docs/onboarding/README.md`](docs/onboarding/README.md) y [`CLAUDE.md`](CLAUDE.md).
   Ruta paso a paso para el equipo: [`docs/onboarding/00-primeros-pasos.md`](docs/onboarding/00-primeros-pasos.md).
2. Toma una historia asignada en [`docs/matriz-asignacion.md`](docs/matriz-asignacion.md).
3. Crea tu rama desde `develop`: `feature/<ID>` (ej. `feature/HU-EVAL-002`).
4. En tu rama, sigue el flujo SDD con Claude Code:
   - `/sdd-spec <ID> <requisitos>` genera `spec.md`, `plan.md` y `tasks.md` en `draft`.
   - Revisa los documentos y confirma `spec.md` y `plan.md` en `ready` (usa `/sdd-plan` y `/sdd-tasks` si cambian requisitos).
   - `/sdd-implement <ID>` + pruebas → `/sdd-release <ID>`.
5. Haz commits pequeños en tu rama con Conventional Commits e ID: `feat(HU-EVAL-002): ...`.
6. Cuando la historia esté terminada, abre **un único PR hacia `develop`** con la plantilla.
7. Corrige las observaciones de revisión en la misma rama. El merge se hace con revisión aprobada y pruebas en verde.

Reglas no negociables:
- `main` (estable) y `develop` (integración) no reciben push directo.
- MongoDB + Mongoose es la única persistencia. No PostgreSQL, Prisma ni MySQL.
- No implementar sin `spec.md`, `plan.md` y `tasks.md` en `ready`, confirmados por el desarrollador responsable.
- No commitear `.env`, credenciales ni datos personales.
