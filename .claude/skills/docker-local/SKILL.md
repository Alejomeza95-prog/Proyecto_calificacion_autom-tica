---
name: docker-local
description: Levanta y mantiene el entorno local Docker del proyecto OMR. Usar al configurar MongoDB, Redis, GridFS, API, motor OMR, workers, redes, healthchecks o al diagnosticar docker compose.
---

# Docker Local

## Entorno base
Usar `docker-compose.yml` del repositorio.

Servicios de infraestructura:
- `mongo` (MongoDB 7, standalone; sin replica set por ahora)
- `redis`

Servicios de aplicación (perfil `app`): `backend` (`apps/backend`, NestJS), `frontend` (`apps/frontend`, React + Vite) y `omr` (`apps/omr`, FastAPI). `omr` no se construye hasta que exista su carpeta (OMR-001..003): arrancar con `docker compose --profile app up -d --build backend frontend`.

## Variables
- `.env` local basado en `.env.docker.example`; nunca versionarlo.
- `MONGO_ROOT_PASSWORD`: contraseña real, usada por el contenedor `mongo`.
- `MONGO_ROOT_PASSWORD_URLENCODED`: la misma contraseña codificada para URL; usarla dentro de cualquier URI `mongodb://`. Si cambia la contraseña, regenerar ambas.

## Reglas
- Nunca poner secretos reales dentro de Dockerfile o compose.
- Agregar healthchecks a dependencias críticas.
- Persistencia local mediante named volumes.
- Habilitar replica set (necesario para transacciones) solo con decisión aprobada en una spec.
- Para reset destructivo, pedir confirmación antes de `down -v` si hay datos importantes.

## Comandos
- Validar: `docker compose config --quiet`
- Infra: `docker compose up -d mongo redis`
- Ver estado: `docker compose ps`
- Logs: `docker compose logs -f <servicio>`
- Apps: `docker compose --profile app up --build`
- Apagar: `docker compose down`
