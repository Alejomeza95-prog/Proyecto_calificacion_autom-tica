# 5. Skills de Claude Code

Las skills del proyecto están en `.claude/skills/` y se versionan con el repositorio: **cualquier desarrollador que clone el repo y abra Claude Code en su raíz las tiene disponibles**, sin instalar nada más. Las skills globales de cada usuario (`~/.agents/skills`, `~/.claude/skills`) son opcionales y no forman parte del proyecto; si una global tiene el mismo nombre que una del proyecto, revisar cuál se está usando.

### Comprobar que están disponibles
1. Abrir una terminal en la raíz del repositorio y ejecutar `claude`.
2. Escribir `/` y comprobar que aparecen `/sdd-spec`, `/sdd-plan`, `/sdd-tasks`, `/sdd-implement` y `/sdd-release`.
3. Si no aparecen: confirmar que estás en la raíz (donde están `CLAUDE.md` y `.claude/`), que actualizaste la rama (`git pull`) y reiniciar Claude Code.

## Skills del flujo SDD (en orden)
| # | Skill | Invocación | Requiere | Produce |
|---|---|---|---|---|
| 1 | `sdd-spec` | `/sdd-spec <ID> <requisitos>` | ID, objetivo, requisitos y al menos un CA (los pide si faltan) | **`spec.md` + `plan.md` + `tasks.md`** en `draft`, con trazabilidad validada |
| 2 | `sdd-plan` | `/sdd-plan <ID> [cambios]` | `spec.md` | `plan.md` actualizado sin borrar decisiones ni contenido aprobado |
| 3 | `sdd-tasks` | `/sdd-tasks <ID> [cambios]` | `spec.md` y `plan.md` | `tasks.md` sincronizado; `ready` cuando spec y plan lo están |
| 4 | `sdd-implement` | `/sdd-implement <ID>` (**solo manual**) | spec, plan y tasks en `ready` + confirmación explícita | Código y pruebas, tarea por tarea, con evidencia |
| 5 | `sdd-release` | `/sdd-release <ID>` | Tareas completas | Checklist DoD, resumen y borrador de PR hacia `develop` |

Cada skill verifica sus requisitos y se detiene si falta algo, indicando qué ejecutar. `sdd-implement` tiene `disable-model-invocation: true`: Claude no puede iniciarla por su cuenta, solo el desarrollador escribiendo `/sdd-implement`. Ninguna skill hace `git push` ni crea PR.

Validador de trazabilidad usado por las skills: `scripts/sdd-validate.ps1 -Id <ID>` (ver [03-flujo-sdd.md](03-flujo-sdd.md#trazabilidad)).

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
- Deniega borrar ramas a la fuerza (`git branch -D`, `--delete --force`) y descartar cambios en bloque (`git checkout -- .`, `git restore .`).
- Pide confirmación para `git fetch`, `git pull`, `git branch -d`, `git restore`, `git stash` y `git tag`.
- Permite comandos de solo lectura (`git status`, `git diff`, `git log`, `git branch`, `git show`, `git ls-files`, `docker compose config/ps/logs`) y el validador `scripts/sdd-validate.ps1`.

Limitación conocida: las reglas cubren la herramienta Bash de Claude Code; en Windows, verificar el comportamiento con la herramienta PowerShell.

Preferencias personales: `.claude/settings.local.json` (ignorado por Git).

## Ejemplo de sesión para una historia
```
git switch develop && git pull origin develop
git switch -c feature/HU-EVAL-002
/sdd-spec HU-EVAL-002 <requisitos y criterios>  → spec.md + plan.md + tasks.md en draft
   revisar spec.md y plan.md, resolver OPEN QUESTIONS, confirmar ready
   (si cambian requisitos: /sdd-plan HU-EVAL-002 y /sdd-tasks HU-EVAL-002)
/sdd-tasks HU-EVAL-002                           → tasks.md en ready
git add specs/HU-EVAL-002 && git commit -m "docs(HU-EVAL-002): crear spec, plan y tareas"
/sdd-implement HU-EVAL-002                       → repetir por tarea: código + pruebas + commit
/sdd-release HU-EVAL-002                         → checklist y borrador de PR
git push -u origin feature/HU-EVAL-002           → abrir PR hacia develop
```
