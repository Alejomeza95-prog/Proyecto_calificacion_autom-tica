# Onboarding del equipo — Sistema OMR PreICFES

Orden de lectura recomendado:

1. [Arquitectura](../arquitectura.md): stack oficial y flujos.
2. [Instalación y Docker](01-instalacion.md): entorno local con MongoDB y Redis.
3. [Variables de entorno](02-variables-entorno.md): qué configurar sin exponer secretos.
4. [Flujo SDD](03-flujo-sdd.md): spec.md → plan.md → tasks.md → implementación → pruebas → PR único hacia `develop`.
5. [Git, ramas, commits y PR](04-git-ramas-commits-pr.md): `main` estable, `develop` integración, `feature/<ID>` por historia.
6. [Skills de Claude Code](05-skills-claude-code.md): qué skill usar en cada paso.
7. [Catálogo de historias](../catalogo-historias.md) y [matriz de asignación](../matriz-asignacion.md).
8. [Dependencias técnicas transversales](../dependencias-transversales.md): decisiones abiertas que bloquean historias.

Presentación resumida para la reunión de arranque: [`docs/presentacion-equipo.md`](../presentacion-equipo.md).

## Estructura del repositorio
```
.
├── CLAUDE.md                   # Reglas obligatorias para Claude Code
├── CONTRIBUTING.md             # Resumen de contribución
├── README_SETUP.md             # Instalación rápida
├── docker-compose.yml          # mongo + redis (base); api/omr/web (perfil app)
├── .env.docker.example         # Plantilla de variables (sin secretos)
├── .claude/
│   ├── settings.json           # Permisos compartidos de Claude Code
│   └── skills/                 # sdd-spec, sdd-plan, sdd-tasks, sdd-implement, sdd-release + transversales
├── .github/
│   └── pull_request_template.md
├── docker/templates/           # Dockerfiles de ejemplo para apps/*
├── docs/
│   ├── onboarding/             # Esta guía
│   ├── requisitos/             # Documentos fuente (pendientes de incorporar)
│   ├── arquitectura.md
│   ├── catalogo-historias.md
│   ├── matriz-asignacion.md
│   ├── dependencias-transversales.md
│   ├── presentacion-equipo.md
│   └── SOURCE_OF_TRUTH.md
├── scripts/                    # docker-up / docker-down / docker-reset (PowerShell)
└── specs/
    ├── 000-architecture/       # Arquitectura canónica (approved)
    ├── _templates/             # spec-template.md, plan-template.md, tasks-template.md
    ├── roadmap.md
    └── HU-EVAL-001/            # Borrador (draft): spec.md + tasks.md preliminar, falta plan.md
```
`apps/api`, `apps/web` y `apps/omr` aún no existen; su creación es una decisión transversal pendiente.
