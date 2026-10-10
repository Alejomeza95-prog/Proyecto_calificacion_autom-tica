# HT-CORE-01 — Base técnica, configuración y servicios locales (documento fuente)

| Campo | Valor |
|---|---|
| Origen | Texto entregado por el responsable en una sesión de Claude Code (`/sdd-spec`), transcrito sin cambios de contenido |
| Fecha de registro | 2026-10-10 |
| Responsable | Diego Alejandro Narvaez Meza |
| Tipo | Historia técnica transversal |
| Datos personales / secretos | Ninguno |

---

**Historia relacionada:** Transversal a todas las historias

## Objetivo técnico
Dejar una base local reproducible y segura para que el equipo pueda desarrollar e integrar API, persistencia, colas, frontend y OMR.

## Criterios de aceptación
- Docker Compose puede validar su configuración y arrancar MongoDB y Redis.
- Las variables locales se obtienen desde la plantilla sin publicar secretos.
- El estado de los servicios puede verificarse con `docker compose ps` y logs.
- El flujo y las convenciones de SDD del repositorio están identificados.

## Tareas — Backend / servicios
- Revisar `README_SETUP.md`, `docs/onboarding/03-flujo-sdd.md`, `docs/onboarding/02-variables-entorno.md` y `.claude/skills/`.
- Crear `.env` desde `.env.docker.example` si no existe; mantener secretos fuera de Git.
- Validar `.gitignore` y comprobar `git check-ignore -v .env`.
- Validar `docker compose config --quiet` y arrancar mongo/redis cuando Docker Engine esté operativo.
- Documentar comandos de inicio, comprobación y apagado seguro.

## Tareas — Frontend
- Confirmar la estructura real de `apps/api` y `apps/web` antes de crear scaffolding.
- Definir con el equipo convenciones de lint, formato, pruebas y variables públicas/privadas del frontend.
- Crear instrucciones breves para configurar el entorno local.

## Modelo de datos / endpoints / contratos
- Configuración de entorno local y ejemplo sin secretos.
- Comandos: `docker compose config --quiet`; `docker compose up -d mongo redis`; `docker compose ps`.
- No aplica endpoints funcionales; el health check de servicios se definirá según implementación.

## Definition of Done (DoD)
- El equipo puede arrancar los servicios sin exponer secretos.
- Las variables de entorno están documentadas y `.env` permanece ignorado por Git.
- El procedimiento se puede repetir en una máquina de desarrollo compatible.

## Seguridad
- No ejecutar `docker compose down -v` en entornos con datos que deban conservarse.
- No registrar URI de conexión completa ni contraseñas en logs.

## Dependencias
- Acceso a Docker Desktop/WSL configurado; archivos setup del repositorio disponibles.

## Decisiones pendientes
- ¿Cuál es la estructura final del monorepo?
- ¿Qué comandos de test/lint exige CI?
