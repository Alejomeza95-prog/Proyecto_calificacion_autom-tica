---
name: testing-quality
description: Diseña y ejecuta la estrategia de pruebas del proyecto. Usar al implementar criterios de aceptación, corregir bugs, preparar release o decidir qué debe probarse en unit, integración, E2E y OMR experimental.
---

# Testing Quality

## Pirámide
- Unit: reglas de dominio, validadores, scoring, parsers, decisiones OMR puras.
- Integración MongoDB: contra un MongoDB real (no mocks de Mongoose). Verificar esquemas, validaciones, índices únicos/parciales, scripts de migración y escrituras masivas. Herramienta pendiente de decisión: Testcontainers, la instancia de Docker Compose con una base de datos de pruebas aislada, o `mongodb-memory-server`.
- Transacciones: solo se prueban contra replica set; si la spec no lo habilita, probar en su lugar los índices y estados compensatorios.
- Integración de jobs: Redis/BullMQ.
- Archivos: GridFS real cuando la spec lo apruebe.
- API/contract: status codes, problem+json, idempotencia, ETag y OpenAPI.
- E2E: flujos principales con Playwright.
- OMR experimental: dataset controlado con ground truth y métricas de error silencioso.

## Trazabilidad
- Cada criterio de aceptación `CA-NN` tiene al menos una prueba que lo nombra (en el título del test o en la matriz de `tasks.md`).
- Cada prueba de integración limpia o aísla sus datos; nunca usa la base de datos de desarrollo con datos reales.

## Regla
Un bug corregido debe incorporar una prueba que falle antes del arreglo y pase después, cuando sea técnicamente razonable.

## Evidencia de cierre
Registrar comandos ejecutados y resultados en `specs/<ID>/tasks.md` o en el resumen de release.
