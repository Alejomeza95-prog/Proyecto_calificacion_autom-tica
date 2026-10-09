---
id: ARCH-000
status: approved
updated: 2026-10-09
---
# Arquitectura canónica — Sistema OMR PreICFES

- Frontend: React + Vite + TypeScript.
- Backend principal: NestJS + Mongoose + TypeScript.
- **Base de datos única: MongoDB**.
- Archivos: GridFS, si la Spec aprobada establece almacenar hojas e imágenes allí.
- OMR: FastAPI + Python + OpenCV + NumPy.
- Procesamiento asíncrono: Redis + BullMQ cuando se requiera.
- Infraestructura local: Docker Compose. MongoDB 7 y Redis como servicios base; aplicaciones mediante perfil `app` tras validar sus carpetas y Dockerfiles.

Flujo principal: React -> NestJS -> MongoDB.
Flujo OMR: React -> NestJS -> MongoDB/GridFS -> job -> motor OpenCV -> MongoDB.

## Modelado
- Cada colección requiere definición de esquema Mongoose, índices, constraints lógicas y reglas de integridad de referencias.
- No asumir relaciones SQL ni migraciones Prisma.
- Para operaciones sobre varios documentos que requieran transacción, evaluar configuración de replica set y documentarlo en la Spec antes de implementar.
- Versionar cambios de documentos mediante scripts controlados con pruebas.

## Seguridad y calidad
- JWT/OIDC, RBAC, logs sin datos personales innecesarios.
- Los resultados ambiguos no deben calificarse automáticamente.
- Usar pruebas contra MongoDB real y pruebas E2E de rutas críticas.
