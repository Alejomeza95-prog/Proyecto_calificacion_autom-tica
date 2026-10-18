<!-- PR único por historia: feature/<ID> → develop. Título: feat(<ID>): <título de la historia> -->

## Historia
- ID: <!-- HU-EVAL-00X / OMR-00X / HU-UX-00X -->
- Rama: `feature/<ID>` → `develop`
- Documentos SDD:
  - Spec: `specs/<ID>/spec.md`
  - Plan: `specs/<ID>/plan.md`
  - Tareas: `specs/<ID>/tasks.md`

## Resumen
<!-- Qué se construyó y por qué (2–5 líneas). -->

## Criterios de aceptación cubiertos
| Criterio | Tareas | Prueba |
|---|---|---|
| CA-01 | T-.. | <!-- nombre del test o evidencia --> |

## Cambios técnicos (según plan.md)
- Colecciones / esquemas:
- Índices:
- Scripts de migración:
- Endpoints:
- Jobs / eventos:

## Pruebas ejecutadas
```
<!-- comandos y resultados: unit, integración MongoDB, E2E, lint, typecheck -->
```

## Checklist (`/sdd-release`)
- [ ] `spec.md`, `plan.md` y `tasks.md` reflejan lo implementado
- [ ] Matriz de cobertura completa: cada CA tiene tarea y prueba; `scripts/sdd-validate.ps1 -Id <ID>` sin fallas
- [ ] Implementación coherente con el plan (colecciones, índices, endpoints, contratos)
- [ ] Scripts de migración idempotentes y reversibles
- [ ] Sin transacciones sin replica set; GridFS solo si está aprobado
- [ ] Pruebas, lint, typecheck y build en verde
- [ ] Rama actualizada con `develop`
- [ ] Sin `.env`, credenciales, datos personales ni archivos temporales
- [ ] Sin PostgreSQL, Prisma ni otra base de datos

## Notas para revisión
<!-- Riesgos, decisiones técnicas (DEC-NN), puntos donde se pide atención. -->

## Observaciones atendidas
<!-- Al corregir observaciones en la misma rama, listar aquí qué se cambió. -->
