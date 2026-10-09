# Instalación rápida — MongoDB + Redis + Claude Code + Docker

> Guía completa para el equipo: [`docs/onboarding/README.md`](docs/onboarding/README.md).

## 1. Requisitos
Docker Desktop con `Engine running`. Verificar con `docker --version` y `docker compose version`.

## 2. Configurar variables
Desde la raíz del proyecto, si no existe un `.env`:
`Copy-Item .env.docker.example .env`
Reemplazar los marcadores `cambiar_*` por valores propios. Si ya existe `.env`, integrar las variables nuevas en vez de sobrescribirlo. No subir `.env` a Git (está en `.gitignore`).
Detalle de cada variable: [`docs/onboarding/02-variables-entorno.md`](docs/onboarding/02-variables-entorno.md).

## 3. Encender MongoDB + Redis
```powershell
docker compose config --quiet
docker compose up -d mongo redis
docker compose ps
docker compose exec mongo mongosh -u <MONGO_ROOT_USER> -p --authenticationDatabase admin
```
`-p` sin valor pide la contraseña de forma interactiva; no escribirla en la línea de comandos.
Dentro de mongosh: `use omr_preicfes` y `db.runCommand({ping:1})`; luego `exit`.
El usuario root se autentica en `admin`. La base de datos se crea cuando se inserta información.

## 4. Conectar la API
- NestJS en el host: `MONGODB_URI` con `localhost:27017` (definida en `.env`).
- NestJS como contenedor: Compose construye la URI con hostname `mongo:27017` y `MONGO_ROOT_PASSWORD_URLENCODED`.
- No ejecutar el perfil `app` hasta que existan `apps/api`, `apps/web`, `apps/omr` y sus Dockerfiles.

## 5. Trabajar con Specs
Flujo obligatorio: [`docs/onboarding/03-flujo-sdd.md`](docs/onboarding/03-flujo-sdd.md).
Las skills del proyecto están en `.claude/skills/`. Las skills globales del usuario (`~/.agents/skills`) son opcionales y no forman parte del proyecto.

## 6. Apagar, sin borrar datos
`docker compose down`
**No ejecutar `docker compose down -v`**: borra volúmenes con datos.
