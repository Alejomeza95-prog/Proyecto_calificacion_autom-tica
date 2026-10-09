# Cómo contribuir

1. Lee [`docs/onboarding/README.md`](docs/onboarding/README.md) y [`CLAUDE.md`](CLAUDE.md).
2. Toma una historia asignada en [`docs/matriz-asignacion.md`](docs/matriz-asignacion.md).
3. Crea tu rama desde `develop`: `feature/<ID>` (ej. `feature/HU-EVAL-002`).
4. En tu rama, sigue el flujo SDD con Claude Code:
   `/sdd-spec` → `/sdd-plan` → `/sdd-tasks` → `/sdd-implement` + pruebas → `/sdd-release`.
5. Haz commits pequeños en tu rama con Conventional Commits e ID: `feat(HU-EVAL-002): ...`.
6. Cuando la historia esté terminada, abre **un único PR hacia `develop`** con la plantilla.
7. Corrige las observaciones de revisión en la misma rama. El merge se hace con revisión aprobada y pruebas en verde.

Reglas no negociables:
- `main` (estable) y `develop` (integración) no reciben push directo.
- MongoDB + Mongoose es la única persistencia. No PostgreSQL, Prisma ni MySQL.
- No implementar sin `spec.md` y `plan.md` listos y `tasks.md` generado.
- No commitear `.env`, credenciales ni datos personales.
