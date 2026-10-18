---
id: HU-XXXX-000
spec: ./spec.md
status: draft            # draft | ready  (solo el desarrollador marca ready)
owner: <desarrollador responsable>
updated: YYYY-MM-DD
---

# <ID> — Plan técnico

> **plan.md describe CÓMO se construye lo definido en `spec.md`.** Debe respetar `specs/000-architecture/architecture.md` y las skills `project-architecture` y `mongodb-mongoose`.
> Persistencia exclusiva: MongoDB + Mongoose. No PostgreSQL, Prisma ni MySQL.
> Generado por `/sdd-spec` como propuesta (`draft`); `/sdd-plan` lo actualiza cuando cambia la spec, sin borrar decisiones ni contenido aprobado (ver §17).

## 1. Resumen técnico
Qué se construye, en qué componentes y cuál es el enfoque general (3–6 líneas).

## 2. Arquitectura
### 2.1 Componentes afectados
| Componente | Ruta | Cambio |
|---|---|---|
| API NestJS | `apps/api/src/<modulo>/` | |
| Worker BullMQ | `apps/api/src/<modulo>/workers/` | |
| Frontend React | `apps/web/src/<feature>/` | |
| Motor OMR | `apps/omr/app/` | |

### 2.2 Flujo técnico
```
React ──► NestJS (<Controller>) ──► <Service> ──► MongoDB
                                     └──► cola <nombre> (Redis/BullMQ) ──► <Worker>
```

### 2.3 Módulos y responsabilidades
| Módulo / clase | Responsabilidad | Reglas (RN) que implementa |
|---|---|---|
| | | |

## 3. Colecciones y esquemas MongoDB / Mongoose
Por cada colección:

### 3.x `<nombre_coleccion>`
- Clase: `<NombreSchema>` · `@Schema({ collection: '<nombre_coleccion>', timestamps: true })`
- Embebido vs. referencia: justificación.

| Campo | Tipo Mongoose | Requerido | Validación (`enum`, `min`, `match`...) | Referencia | PII |
|---|---|---|---|---|---|
| `_id` | ObjectId | sí | | | no |
| `schemaVersion` | Number | sí | `default: 1` | | no |
| | | | | | |

## 4. Índices
| Colección | Índice (campos y orden) | Tipo (único / parcial / compuesto / TTL) | `partialFilterExpression` | Consulta o regla (RN/CA) que respalda |
|---|---|---|---|---|
| | | | | |

## 5. Consistencia y transacciones
- ¿Se requiere atomicidad entre varios documentos? Sí / No.
- **Las transacciones multi-documento requieren replica set**; la instancia local es standalone (ver DT-02).
- Estrategia elegida: índices únicos / operación atómica de un documento / `bulkWrite` idempotente (`ordered: false`) / transacción (solo con replica set aprobado).
- Manejo de errores de clave duplicada (E11000).

## 6. Archivos (GridFS)
- No aplica / Propuesta GridFS (pendiente de aprobación, ver DT-03).
- Bucket, metadatos (SHA-256, MIME, tamaño, usuario, documento dueño), límite de tamaño, retención.

## 7. Scripts de migración y versionado
| Script | Colección | `schemaVersion` origen → destino | Acción (índices, backfill de campos) | Reversión | Idempotente |
|---|---|---|---|---|---|
| | | | | | sí |

## 8. Endpoints
| Método | Path | Rol | Request | Response | Códigos | Idempotencia | CA |
|---|---|---|---|---|---|---|---|
| | `/api/v1/...` | | | | 200/201/202/400/403/404/409 | | |

Errores en formato `application/problem+json`.

## 9. Contratos de datos
### 9.1 DTOs y validación
```ts
// <NombreDto> — validación con class-validator o Zod
```

### 9.2 Eventos y jobs
| Cola / evento | Productor | Consumidor | Payload | Reintentos / backoff | Idempotencia |
|---|---|---|---|---|---|
| | | | | | |

### 9.3 Tipos compartidos frontend ↔ backend
- Origen de los tipos y cómo se comparten.

## 10. Dependencias
| Tipo | Dependencia | Estado | Impacto si no está lista |
|---|---|---|---|
| Historia | HU-... | | |
| Técnica transversal | DT-.. (`docs/dependencias-transversales.md`) | | |
| Librería nueva | `<paquete>` — problema que resuelve | | |

## 11. Seguridad
- Autenticación y RBAC por endpoint (guards).
- PII: campos personales, enmascarado en logs.
- Auditoría: qué se registra (usuario, fecha, acción, antes/después) y dónde.
- Retención y borrado de datos/archivos.
- Validación de archivos subidos (tipo, tamaño, contenido).

## 12. Estrategia de pruebas
| CA / RN | Nivel | Caso | Herramienta | Datos de prueba |
|---|---|---|---|---|
| CA-01 | unit / integración MongoDB / contract / E2E | | Jest / Vitest / Playwright / pytest | seed sin datos personales reales |

- Integración: contra MongoDB real (estrategia según DT-05).
- Índices únicos y parciales probados con inserciones duplicadas.
- Transacciones probadas solo con replica set.

## 13. Observabilidad y rendimiento
- Logs con `correlationId`, métricas y alertas.
- Volumen esperado (de RNF de la spec) e índices o lotes que lo respaldan.

## 14. Decisiones técnicas
| ID | Decisión | Alternativas consideradas | Motivo | Fecha |
|---|---|---|---|---|
| DEC-01 | | | | |

## 15. Riesgos y OPEN QUESTIONS técnicas
- [ ] ...

## 16. Checklist de plan listo (`status: ready`)
- [ ] Cada CA y RN de la spec tiene diseño y estrategia de prueba.
- [ ] Colecciones con `collection:` explícito, validaciones y `schemaVersion`.
- [ ] Cada índice justificado por una consulta o regla.
- [ ] Decisión de transacciones coherente con replica set (DT-02).
- [ ] Endpoints y contratos completos.
- [ ] Sin tecnologías fuera de la arquitectura aprobada.
- [ ] Ningún ID (`RN`/`CA`/`RNF`) citado aquí falta en la spec; `scripts/sdd-validate.ps1 -Id <ID>` sin `[FALLA]`.
- [ ] `spec.md` en `ready`.

## 17. Registro de cambios
No borrar decisiones ni contenido aprobado: las decisiones superadas se marcan «reemplazada por DEC-NN»; lo obsoleto se tacha con su motivo.

| Fecha | Cambio | Motivo (CA/RN/spec §14) | Estado previo → nuevo |
|---|---|---|---|
| YYYY-MM-DD | Creación con `/sdd-spec` | — | — → draft |
