---
name: mongodb-mongoose
description: Diseñar modelos, colecciones, índices, validaciones, transacciones y GridFS con MongoDB y Mongoose para el proyecto OMR.
---
# MongoDB + Mongoose

## Principio
- MongoDB es la única base de datos; NestJS usa `@nestjs/mongoose` y `mongoose`. No PostgreSQL, MySQL ni Prisma.
- Diseñar colecciones de estudiantes, instituciones, grupos, exámenes, claves, intentos, lecturas OMR y auditoría de acuerdo con la spec y el `plan.md` de cada historia (el diseño de colecciones, índices y migraciones se documenta en `plan.md` §3–§7).

## Colecciones y esquemas
- Definir cada esquema con `@Schema({ collection: '<nombre>', timestamps: true })`. Fijar `collection` siempre: Mongoose pluraliza los nombres si no se indica.
- Usar `_id: ObjectId`; referencias con `Types.ObjectId` y `ref`.
- Incluir `schemaVersion` en documentos que puedan evolucionar.
- Embebido vs. referencia: embeber datos que se leen juntos y no crecen sin límite; referenciar los que crecen o se consultan por separado (límite 16 MB por documento).
- Integridad referencial lógica: MongoDB no la impone; el servicio que crea la referencia verifica que el documento exista.

## Índices
- Cada índice se justifica con una consulta real o un invariante de la spec.
- Invariantes de unicidad con índices únicos compuestos; si solo aplican a ciertos estados, usar `partialFilterExpression`.
- Declarar índices en el esquema (`Schema.index`) y crearlos en entornos compartidos mediante script de migración o `syncIndexes()` controlado, no con `autoIndex` en producción.

## Validaciones
- Esquema Mongoose (`required`, `enum`, `min`, `max`, `match`) + DTO/Zod en la API.
- Enums de estados compartidos entre esquema y dominio, sin duplicar literales.

## Escrituras masivas e idempotencia
- Cargas grandes con `bulkWrite` por lotes y `ordered: false`; los errores de clave duplicada (E11000) se tratan como inconsistencias de dominio, no como fallos del job.
- Usar upserts con filtro sobre la clave natural para que reintentar un lote no duplique datos.

## Transacciones
- **Las transacciones multi-documento requieren replica set** (o clúster sharded). No funcionan en una instancia standalone.
- La instancia Docker local corre hoy como standalone. Habilitar replica set (aunque sea de un nodo) requiere decisión documentada en la spec y un cambio aprobado en `docker-compose.yml`.
- Mientras no exista replica set: diseñar con operaciones atómicas de un documento, índices únicos y estados compensatorios. Patrones como outbox transaccional o change streams también dependen de replica set.

## GridFS
- GridFS es la propuesta para almacenar hojas OMR, imágenes y archivos cargados; **cada spec debe aprobarlo explícitamente**.
- Guardar en metadatos: hash SHA-256, tipo MIME, tamaño, usuario y referencia al documento dueño. El documento de negocio guarda el `fileId`.
- Definir retención y borrado en la spec.

## Scripts de migración
- Herramienta pendiente de decisión (por ejemplo `migrate-mongo` o scripts propios con registro en una colección `migrations`).
- Scripts versionados, idempotentes, compatibles hacia atrás, con reversión y prueba de integración.
- Nunca modificar datos o índices a mano en entornos compartidos.

## Seguridad
- No registrar información personal completa en logs.
- No eliminar colecciones ni datos existentes sin autorización explícita.
- Credenciales solo en `.env`; en URIs, usar la contraseña codificada para URL (`MONGO_ROOT_PASSWORD_URLENCODED`).
