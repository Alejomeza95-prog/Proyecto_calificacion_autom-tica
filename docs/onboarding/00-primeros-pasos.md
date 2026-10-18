# 0. Primeros pasos del desarrollador

Ruta completa desde clonar el repositorio hasta abrir el Pull Request de una historia. Comandos para PowerShell en Windows.

## 1. Clonar el repositorio
```powershell
git clone https://github.com/Alejomeza95-prog/Proyecto_calificacion_autom-tica.git omr-preicfes
cd omr-preicfes
```

## 2. Cambiar a `develop`
```powershell
git switch develop
git pull origin develop
```
`develop` es la base de integración. `main` es la versión estable; nadie trabaja ni hace push directo en ninguna de las dos.

## 3. Configurar el entorno local
```powershell
Copy-Item .env.docker.example .env      # solo si no tienes .env; si ya existe, no lo sobrescribas
# Editar .env y reemplazar los marcadores cambiar_* por valores propios
docker compose config --quiet           # sin salida = configuración válida
docker compose up -d mongo redis
docker compose ps                       # mongo debe quedar "healthy"
```
`.env` está ignorado por Git: nunca lo subas ni pegues su contenido en chats, issues o PR. Detalle: [01-instalacion.md](01-instalacion.md) y [02-variables-entorno.md](02-variables-entorno.md).

## 4. Instalar y ejecutar Claude Code
```powershell
irm https://claude.ai/install.ps1 | iex   # o: npm install -g @anthropic-ai/claude-code
claude --version
claude                                    # siempre desde la raíz del repositorio
```
Dentro de Claude Code escribe `/` y comprueba que aparecen `/sdd-spec`, `/sdd-plan`, `/sdd-tasks`, `/sdd-implement` y `/sdd-release`. Vienen en `.claude/skills/` del repositorio; no necesitas skills globales. Detalle: [05-skills-claude-code.md](05-skills-claude-code.md).

## 5. Crear la rama de la historia desde `develop`
```powershell
git switch develop
git pull origin develop
git switch -c feature/<ID>                # ej. feature/HU-EVAL-002
```
Se recomienda crearla **antes** de generar los documentos. Si generaste los documentos estando en `develop`, crea la rama antes del primer commit: `git switch -c feature/<ID>` lleva los archivos sin confirmar a la nueva rama. Nunca commitees en `develop` ni en `main`.

## 6. Generar `spec.md`, `plan.md` y `tasks.md` con `/sdd-spec`
```
/sdd-spec <ID> <objetivo, requisitos y criterios de aceptación, o ruta en docs/requisitos/>
```
Claude crea `specs/<ID>/spec.md`, `plan.md` y `tasks.md` en `draft` y valida la trazabilidad. Si falta información esencial, la pregunta y no crea nada. No inventa requisitos: lo que no tenga fuente queda como OPEN QUESTION. Detalle: [03-flujo-sdd.md](03-flujo-sdd.md).

## 7. Revisar y aprobar los documentos
1. `spec.md`: revisa objetivo, reglas `RN`, criterios `CA` y el checklist §13. Resuelve las OPEN QUESTIONS con el responsable funcional.
2. `plan.md`: revisa colecciones, índices, endpoints, pruebas y el checklist §16.
3. Si cambian los requisitos: `/sdd-plan <ID>` y `/sdd-tasks <ID>` actualizan los documentos sin borrar lo aprobado.
4. Cuando estén listos, pide a Claude que marque `spec.md` y `plan.md` en `ready` (o cámbialo tú en el front matter) y ejecuta `/sdd-tasks <ID>` para dejar `tasks.md` en `ready`.
5. Valida y commitea:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/sdd-validate.ps1 -Id <ID> -RequireReady
   git add specs/<ID>/
   git commit -m "docs(<ID>): crear spec, plan y tareas"
   ```

## 8. Implementar la historia
```
/sdd-implement <ID>
```
Solo el desarrollador puede lanzarlo. Claude verifica la rama, los estados `ready` y la trazabilidad, pide tu confirmación y avanza tarea por tarea con pruebas y evidencia. Propone un commit por tarea (`feat(<ID>): ... (T-NN)`); solo lo ejecuta si lo pides.

## 9. Ejecutar las pruebas
Unit, integración contra MongoDB real y E2E según la estrategia del `plan.md` (§12), más lint y typecheck. No se declara terminada una historia con pruebas fallidas.

## 10. Preparar el Pull Request hacia `develop`
```powershell
git fetch origin
git merge origin/develop                   # mantener la rama al día
```
```
/sdd-release <ID>                          # checklist DoD y borrador del PR
```
```powershell
git push -u origin feature/<ID>
```
Abrir el PR en GitHub: base `develop` ← `feature/<ID>`, título `feat(<ID>): <título>`, cuerpo con `.github/pull_request_template.md`. Las observaciones se corrigen en la misma rama. Detalle: [04-git-ramas-commits-pr.md](04-git-ramas-commits-pr.md).

## Recibir actualizaciones de la configuración del equipo
Cuando se integre un cambio de configuración en `develop`:
```powershell
git switch develop
git pull origin develop
git switch feature/<ID>
git merge develop                          # o rebase, según acuerdo del equipo
```
Reinicia Claude Code para que cargue las skills y `CLAUDE.md` actualizados. Tu `.env` local no se modifica.
