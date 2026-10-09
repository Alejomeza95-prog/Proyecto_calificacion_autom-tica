# 4. Git: ramas, commits y Pull Requests

## Modelo de ramas
| Rama | Propósito | Quién escribe |
|---|---|---|
| `main` | Rama **estable**. Solo recibe integraciones desde `develop` cuando el equipo decide publicar. | Nadie directamente (solo PR) |
| `develop` | Rama de **integración**. Recibe las historias terminadas. | Nadie directamente (solo PR) |
| `feature/<ID>` | Una rama por historia de usuario, creada desde `develop`. Contiene spec, plan, tareas, código y pruebas. | El desarrollador responsable |

Ejemplos: `feature/HU-EVAL-002`, `feature/OMR-001`, `feature/HU-UX-001`.

Ramas de soporte (propuesta, validar en equipo):
| Rama | Desde → hacia | Uso |
|---|---|---|
| `docs/<desc>` | `develop` → `develop` | Documentación general, requisitos, onboarding |
| `chore/<desc>` | `develop` → `develop` | Configuración, tooling, dependencias |
| `hotfix/<desc>` | `main` → `main` y `develop` | Corrección urgente en la rama estable |

## Ciclo de una historia
```powershell
# 1. Crear la rama desde develop actualizado
git switch develop
git pull origin develop
git switch -c feature/HU-EVAL-002

# 2. Documentar e implementar con Claude Code (en la rama)
#    /sdd-spec HU-EVAL-002 → /sdd-plan HU-EVAL-002 → /sdd-tasks HU-EVAL-002 → /sdd-implement HU-EVAL-002

# 3. Commits pequeños en la rama
git add specs/HU-EVAL-002/spec.md
git commit -m "docs(HU-EVAL-002): crear spec de claves de respuesta versionadas"

# 4. Mantener la rama al día con develop (periódicamente y antes del PR)
git fetch origin
git merge origin/develop          # o rebase, según acuerdo del equipo

# 5. Verificar Definition of Done
#    /sdd-release HU-EVAL-002

# 6. Publicar la rama y abrir un único PR hacia develop
git push -u origin feature/HU-EVAL-002
```
Abrir el PR en GitHub con base `develop` y comparar `feature/HU-EVAL-002`.

## Commits (Conventional Commits)
Formato: `<tipo>(<ID>): <descripción en imperativo>`

| Tipo | Uso |
|---|---|
| `docs` | spec.md, plan.md, tasks.md u otra documentación |
| `feat` | Funcionalidad de la historia |
| `test` | Pruebas |
| `fix` | Corrección (incluye observaciones del PR) |
| `refactor` | Cambio interno sin alterar comportamiento |
| `chore` / `build` / `ci` | Configuración, Docker, pipelines |

Ejemplos de la secuencia de una historia:
```
docs(HU-EVAL-002): crear spec de claves de respuesta versionadas
docs(HU-EVAL-002): crear plan técnico
docs(HU-EVAL-002): crear tareas
feat(HU-EVAL-002): agregar esquema clave_respuesta e índices (T-01, T-02)
test(HU-EVAL-002): cubrir unicidad de versión activa de clave (CA-02)
feat(HU-EVAL-002): exponer endpoint de publicación de clave (T-07)
fix(HU-EVAL-002): atender observaciones de revisión del PR
```
Nunca incluir secretos ni datos personales en mensajes de commit.

## Pull Request
- **Un único PR por historia**, de `feature/<ID>` hacia `develop`, cuando la historia esté terminada (spec, plan, tareas, código y pruebas).
- Título: `feat(<ID>): <título de la historia>` — ej. `feat(HU-EVAL-002): claves de respuesta versionadas`.
- Cuerpo: plantilla `.github/pull_request_template.md` (Claude Code la prepara con `/sdd-release`).
- Para hacer merge:
  1. Revisión de código aprobada (mínimo 1 revisor distinto del autor).
  2. Pruebas en verde.
  3. Checklist de `/sdd-release` completo.
- **Observaciones:** se corrigen en la misma rama con nuevos commits (`fix(<ID>): ...`); el PR se actualiza solo.
- Estrategia de merge sugerida: **squash merge** hacia `develop` (validar en equipo).

Ejemplo de PR:
```
Título:  feat(HU-EVAL-002): claves de respuesta versionadas
Base:    develop  ←  feature/HU-EVAL-002
Incluye: specs/HU-EVAL-002/{spec,plan,tasks}.md + código + pruebas
Cubre:   CA-01..CA-05 (matriz de cobertura completa en tasks.md)
```

## Integración de develop a main
Cuando el equipo decide publicar una versión estable: PR `develop` → `main`, revisado por el líder técnico, con todas las pruebas en verde. Frecuencia y etiquetado de versiones: a definir en equipo.

## Protección de ramas (configurar en GitHub)
Para `main` y `develop`:
- Requerir Pull Request con al menos 1 aprobación.
- Requerir checks de CI en verde (cuando exista CI, DT-08).
- Descartar aprobaciones al agregar commits nuevos.
- Bloquear force push y borrado.

## Uso de Claude Code con Git
- Las skills SDD verifican que estés en `feature/<ID>` y se detienen si estás en `develop` o `main`.
- Claude Code propone commits, pero solo los ejecuta si lo pides. Nunca hace `git push` ni crea PR (bloqueado en `.claude/settings.json`).
- Revisa siempre el diff antes de commitear.
