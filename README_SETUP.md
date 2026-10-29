# Instalación rápida — MongoDB + Redis + Claude Code + Docker

> Guía completa para el equipo: [`docs/onboarding/README.md`](docs/onboarding/README.md).

## 1. Requisitos
Docker Desktop con `Engine running`. Verificar con `docker --version` y `docker compose version`. Los scripts de `scripts/` son PowerShell (Windows).

## 2. Configurar variables
Desde la raíz del proyecto, si no existe un `.env`:
`Copy-Item .env.docker.example .env`
Reemplazar los marcadores `cambiar_*` por valores propios. Si ya existe `.env`, integrar las variables nuevas en vez de sobrescribirlo. No subir `.env` a Git (está en `.gitignore`).
Detalle de cada variable: [`docs/onboarding/02-variables-entorno.md`](docs/onboarding/02-variables-entorno.md).

Comprobar antes de arrancar (no necesita contenedores):
```powershell
powershell -ExecutionPolicy Bypass -File scripts/verify-local.ps1 -Static
```

## 3. Encender MongoDB + Redis
```powershell
powershell -ExecutionPolicy Bypass -File scripts/docker-up.ps1   # valida la configuración y arranca mongo y redis
```
Equivale a `docker compose config --quiet`, `docker compose up -d mongo redis` y `docker compose ps`.

Para entrar a MongoDB:
```powershell
docker compose exec mongo mongosh -u <MONGO_ROOT_USER> -p --authenticationDatabase admin
```
`-p` sin valor pide la contraseña de forma interactiva; no escribirla en la línea de comandos.
Dentro de mongosh: `use omr_preicfes` y `db.runCommand({ping:1})`; luego `exit`.
El usuario root se autentica en `admin`. La base de datos se crea cuando se inserta información.

## 4. Comprobar el estado
```powershell
powershell -ExecutionPolicy Bypass -File scripts/verify-local.ps1   # [OK]/[FALLA] por criterio; código 0 si todo pasa
docker compose ps                                                  # mongo y redis deben quedar "healthy"
docker compose logs -f mongo                                       # o redis
```
El script nunca imprime contraseñas ni URIs. No pegues en issues o PR la salida de `docker compose config` sin `--quiet`: muestra los valores de `.env`.

Si Redis no arranca con `port is already allocated`, otro proyecto usa el puerto 6379: define `REDIS_PORT=6380` (u otro libre) en tu `.env` y en `REDIS_URL`. Lo mismo aplica a `MONGO_PORT`.

## 5. Conectar la API
- NestJS en el host: `MONGODB_URI` con `localhost:27017` (definida en `.env`).
- NestJS como contenedor: Compose construye la URI con hostname `mongo:27017` y `MONGO_ROOT_PASSWORD_URLENCODED`.
- El perfil `app` construye `backend` (`apps/backend`) y `frontend` (`apps/frontend`). `omr` (`apps/omr`) aún no existe: nombrar los servicios al arrancar (ver §5.1 y DT-01 en [`docs/dependencias-transversales.md`](docs/dependencias-transversales.md)).

### 5.1 Backend y frontend
Cada app es una carpeta independiente con su propio `package.json` y `pnpm-lock.yaml` (pnpm mediante corepack: `corepack enable`).

```powershell
# En el host (desde apps/backend o apps/frontend)
pnpm install --frozen-lockfile
pnpm lint; pnpm typecheck; pnpm test; pnpm build    # backend: también pnpm test:e2e
pnpm start:dev                                      # backend en http://localhost:3000/api/v1/health
pnpm dev                                            # frontend en http://localhost:5173

# Con Docker (desde la raíz; mongo y redis arrancan como dependencias)
docker compose --profile app up -d --build backend frontend
docker compose ps                                   # backend debe quedar "healthy"
```
No usar `docker compose --profile app up` sin nombrar los servicios: `omr` aún no tiene carpeta y su build falla.

## 6. Apagar, sin borrar datos
```powershell
powershell -ExecutionPolicy Bypass -File scripts/docker-down.ps1   # docker compose down: los volúmenes se conservan
```
**No ejecutar `docker compose down -v`**: borra los volúmenes con datos. Si de verdad hay que borrar todo, usar `scripts/docker-reset.ps1`, que pide confirmación escrita, y solo con acuerdo del equipo.

## 7. Trabajar con Specs
- Ruta completa del desarrollador: [`docs/onboarding/00-primeros-pasos.md`](docs/onboarding/00-primeros-pasos.md).
- Flujo obligatorio: [`docs/onboarding/03-flujo-sdd.md`](docs/onboarding/03-flujo-sdd.md). `/sdd-spec <ID> <requisitos>` genera `spec.md`, `plan.md` y `tasks.md` en `draft`; se implementa solo con spec y plan en `ready`.
- Plantillas: [`specs/_templates/`](specs/_templates/).
- Skills del proyecto: [`.claude/skills/`](.claude/skills/) (se cargan al abrir `claude` en la raíz del repo; [guía de uso](docs/onboarding/05-skills-claude-code.md)). Las skills globales del usuario (`~/.agents/skills`) son opcionales y no forman parte del proyecto.
- Validar trazabilidad: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/sdd-validate.ps1 -Id <ID>`.
- Ramas, commits y PR: [`docs/onboarding/04-git-ramas-commits-pr.md`](docs/onboarding/04-git-ramas-commits-pr.md).
