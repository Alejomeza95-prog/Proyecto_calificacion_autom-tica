# 5. Skills de Claude Code

Las skills del proyecto están en `.claude/skills/` y se versionan con el repositorio. Las skills globales de cada usuario (`~/.agents/skills`, `~/.claude/skills`) son opcionales y no forman parte del proyecto.

## Skills del flujo SDD (en orden)
| # | Skill | Invocación | Requiere | Produce |
|---|---|---|---|---|
| 1 | `sdd-spec` | `/sdd-spec <ID>` | Rama `feature/<ID>` y documentos en `docs/requisitos/` | `spec.md` (qué y por qué) → `ready` |
| 2 | `sdd-plan` | `/sdd-plan <ID>` | `spec.md` en `ready` | `plan.md` (cómo: arquitectura, MongoDB, índices, endpoints, contratos, seguridad, pruebas, decisiones) → `ready` |
| 3 | `sdd-tasks` | `/sdd-tasks <ID>` | `spec.md` y `plan.md` en `ready` | `tasks.md` con T-NN → CA/RN → plan § → prueba |
| 4 | `sdd-implement` | `/sdd-implement <ID>` | Los tres archivos | Código y pruebas, tarea por tarea, con evidencia |
| 5 | `sdd-release` | `/sdd-release <ID>` | Tareas completas | Checklist DoD, resumen y borrador de PR hacia `develop` |

Cada skill verifica sus requisitos y se detiene si falta algo, indicando qué skill ejecutar. Ninguna hace `git push` ni crea PR.

## Skills transversales
| Skill | Cuándo se usa |
|---|---|
| `project-architecture` | Al elegir tecnologías, diseñar módulos o resolver documentos contradictorios |
| `mongodb-mongoose` | Colecciones, esquemas, índices, validaciones, transacciones (replica set), GridFS, migraciones |
| `testing-quality` | Estrategia y ejecución de pruebas |
| `docker-local` | Docker Compose, variables, healthchecks |
| `typescript-strict-mode` | Código TypeScript de NestJS y React |
| `clean-code-solid` | Diseño de servicios, módulos y adaptadores |
| `omr-engine` | Motor OMR: fiduciales, ROIs, burbujas, QR, ambigüedad |

## Configuración compartida
`.claude/settings.json` define permisos comunes:
- Deniega leer o editar `.env` y archivos de credenciales.
- Deniega `git push`, `git reset --hard`, `git clean`, `docker compose down -v`, borrado de volúmenes/contenedores, `docker-reset.ps1` y `rm -rf`.
- Pide confirmación para `git commit`, `git switch/checkout`, merge/rebase y para iniciar o detener contenedores.
- Permite comandos de solo lectura (`git status`, `git diff`, `git log`, `git branch`, `docker compose config/ps/logs`).

Limitación conocida: las reglas cubren la herramienta Bash de Claude Code; en Windows, verificar el comportamiento con la herramienta PowerShell.

Preferencias personales: `.claude/settings.local.json` (ignorado por Git).

## Ejemplo de sesión para una historia
```
git switch -c feature/HU-EVAL-002   (desde develop actualizado)
/sdd-spec HU-EVAL-002        → revisar spec.md, confirmar ready, commit
/sdd-plan HU-EVAL-002        → revisar plan.md, confirmar ready, commit
/sdd-tasks HU-EVAL-002       → revisar tasks.md, commit
/sdd-implement HU-EVAL-002   → repetir por tarea: código + pruebas + commit
/sdd-release HU-EVAL-002     → checklist y borrador de PR
git push -u origin feature/HU-EVAL-002 → abrir PR hacia develop
```
