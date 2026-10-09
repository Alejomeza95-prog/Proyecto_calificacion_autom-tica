# 1. Instalación y ejecución con Docker

## Requisitos
| Herramienta | Uso | Verificación |
|---|---|---|
| Docker Desktop (con Compose v2) | MongoDB 7 y Redis 7 locales | `docker --version`, `docker compose version` |
| Git | Control de versiones (`main` estable, `develop` integración, `feature/<ID>`) | `git --version` |
| Claude Code | Trabajo guiado por Specs y Skills | `claude --version` |
| Node.js 22 + pnpm (corepack) | Backend NestJS y frontend React, cuando existan `apps/api` y `apps/web` | `node -v`, `corepack enable` |
| Python 3.12 | Motor OMR, cuando exista `apps/omr` | `python --version` |

Las versiones de Node y Python provienen de `docker/templates/*.Dockerfile.example`; confirmar al crear las apps.

## Pasos
1. Clonar el repositorio y crear tu rama (ver [04-git-ramas-commits-pr.md](04-git-ramas-commits-pr.md)).
2. Crear el archivo de variables local:
   ```powershell
   Copy-Item .env.docker.example .env
   ```
   Reemplazar los marcadores `cambiar_*` con valores propios (ver [02-variables-entorno.md](02-variables-entorno.md)). Cada desarrollador usa su propia contraseña local; no compartirla por chat ni commitearla.
3. Validar la configuración sin iniciar nada:
   ```powershell
   docker compose config --quiet
   ```
   Sin salida y código 0 significa configuración válida.
4. Levantar la infraestructura base:
   ```powershell
   docker compose up -d mongo redis      # o scripts/docker-up.ps1
   docker compose ps                     # mongo debe quedar "healthy"
   ```
5. Verificar MongoDB (la contraseña se pide de forma interactiva):
   ```powershell
   docker compose exec mongo mongosh -u <MONGO_ROOT_USER> -p --authenticationDatabase admin
   ```
   Dentro: `use omr_preicfes`, `db.runCommand({ping:1})`, `exit`.

## Comandos habituales
| Acción | Comando |
|---|---|
| Ver estado | `docker compose ps` |
| Ver logs | `docker compose logs -f mongo` / `redis` |
| Apagar sin borrar datos | `docker compose down` (o `scripts/docker-down.ps1`) |
| Aplicaciones (cuando existan) | `docker compose --profile app up --build` |
| **Borrar todos los datos locales** | `scripts/docker-reset.ps1` (pide confirmación escrita). Nunca `docker compose down -v` sin estar seguro. |

## Servicios y puertos
| Servicio | Imagen | Puerto local | Persistencia | Perfil |
|---|---|---|---|---|
| `mongo` | `mongo:7` (standalone) | `127.0.0.1:${MONGO_PORT:-27017}` | volumen `mongo_data` | base |
| `redis` | `redis:7-alpine` (AOF) | `127.0.0.1:${REDIS_PORT:-6379}` | volumen `redis_data` | base |
| `api` | build `./apps/api` | `127.0.0.1:3000` | — | `app` |
| `omr` | build `./apps/omr` | `127.0.0.1:8000` | — | `app` |
| `web` | build `./apps/web` | `127.0.0.1:5173` | — | `app` |

Los puertos solo se publican en `127.0.0.1`, no en la red local.

## Problemas frecuentes
- **`mongo` no queda healthy:** revisar `docker compose logs mongo`. Si cambiaste usuario/contraseña después del primer arranque, MongoDB conserva las credenciales iniciales del volumen; un reset borra datos y requiere acuerdo.
- **Error de autenticación desde la API:** la contraseña en la URI debe ir codificada para URL (`MONGO_ROOT_PASSWORD_URLENCODED`).
- **El perfil `app` falla al construir:** las carpetas `apps/*` aún no existen.
