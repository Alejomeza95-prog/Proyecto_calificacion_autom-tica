# Arquitectura oficial — Sistema OMR PreICFES

Documento de presentación para el equipo. La fuente canónica es [`specs/000-architecture/architecture.md`](../specs/000-architecture/architecture.md) (`approved`); si hay diferencias, prevalece ella.

## Stack
| Capa | Tecnología | Estado |
|---|---|---|
| Frontend | React + Vite + TypeScript | Aprobado · `apps/web` por crear |
| Backend de negocio | NestJS + TypeScript + Mongoose (`@nestjs/mongoose`) | Aprobado · `apps/api` por crear |
| Base de datos | **MongoDB 7 (única)** | Aprobado · corre en Docker (standalone) |
| Archivos (hojas, imágenes, cargas) | GridFS | **Propuesta pendiente de aprobación** por spec |
| Procesamiento OMR | Python + FastAPI + OpenCV + NumPy | Aprobado · `apps/omr` por crear |
| Colas | Redis + BullMQ | Aprobado · Redis corre en Docker |
| Entorno local | Docker Compose | Aprobado · validado con `docker compose config` |

**No se usa PostgreSQL, Prisma, MySQL ni otra base de datos.**

## Flujos
```
Flujo principal:  React ──HTTP──► NestJS ──Mongoose──► MongoDB

Flujo OMR:        React ──► NestJS ──► MongoDB (+ GridFS*) ──► job BullMQ (Redis)
                                                                   │
                                     MongoDB ◄── resultado ◄── motor OMR (FastAPI + OpenCV)
```
\* GridFS pendiente de aprobación.

## Principios
- El backend NestJS es autoritativo: el frontend no duplica reglas de negocio.
- El procesamiento pesado de visión no se ejecuta dentro del request HTTP; va por cola.
- Lecturas OMR dudosas (MULTIPLE, UNCERTAIN) o identidad conflictiva van a revisión manual; nunca se califican automáticamente.
- Cada colección tiene esquema Mongoose, índices justificados, validaciones, `schemaVersion` y scripts de migración.
- Transacciones multi-documento solo con replica set (decisión pendiente, ver [dependencias transversales](dependencias-transversales.md)).
- Seguridad: JWT/OIDC + RBAC (mecanismo concreto pendiente); logs con `correlationId` y sin PII innecesaria.

## Dominio OMR (de `CLAUDE.md`)
- Áreas: Matemáticas, Ciencias Naturales, Competencias Ciudadanas, Lectura Crítica e Inglés.
- Puntaje por área: 0 a 100.
- Estados de lectura: A/B/C/D, BLANK, MULTIPLE, UNCERTAIN.

## Estado de la infraestructura local
| Servicio | Estado |
|---|---|
| `mongo` | Definido, healthcheck con `mongosh ping`, volumen `mongo_data` |
| `redis` | Definido, AOF activado, volumen `redis_data` |
| `api`, `omr`, `web` | Definidos en perfil `app`; no construibles hasta crear `apps/*` |
