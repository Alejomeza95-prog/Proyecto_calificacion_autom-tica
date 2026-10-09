# 3. Flujo Spec-Driven Development (SDD)

Cada historia de usuario se documenta y construye en su propia rama con tres archivos:

| Archivo | Responde | Plantilla | Skill | Estados |
|---|---|---|---|---|
| `specs/<ID>/spec.md` | **Qué** y **por qué**: alcance, reglas RN, criterios CA | `specs/_templates/spec-template.md` | `/sdd-spec` | `draft → ready → in-progress → in-review → done` |
| `specs/<ID>/plan.md` | **Cómo**: arquitectura, colecciones y esquemas Mongoose, índices, endpoints, contratos, seguridad, pruebas, decisiones | `specs/_templates/plan-template.md` | `/sdd-plan` | `draft → ready` |
| `specs/<ID>/tasks.md` | **Pasos**: tareas T-NN → CA/RN → sección del plan → prueba | `specs/_templates/tasks-template.md` | `/sdd-tasks` | `pending → in-progress → in-review → done` |

## Flujo completo
```
develop
  └─► feature/<ID>
        1. /sdd-spec <ID>       → spec.md   (draft → ready)        commit docs(<ID>): crear spec
        2. /sdd-plan <ID>       → plan.md   (draft → ready)        commit docs(<ID>): crear plan técnico
        3. /sdd-tasks <ID>      → tasks.md  (pending)              commit docs(<ID>): crear tareas
        4. /sdd-implement <ID>  → código + pruebas, tarea por tarea  commits feat/test(<ID>): ... (T-NN)
        5. Pruebas completas (unit, integración MongoDB, E2E)
        6. /sdd-release <ID>    → checklist DoD + borrador de PR  (in-review)
        7. PR único  feature/<ID> → develop
        8. Revisión: observaciones se corrigen en la misma rama
        9. Aprobado + pruebas en verde → merge a develop  (done)
```

## Reglas
- **No hay aprobaciones ni PR separados para spec o plan.** El desarrollador responsable verifica el checklist de cada plantilla y marca `ready` antes de avanzar; el equipo revisa spec, plan, tareas, código y pruebas juntos en el PR.
- No se implementa sin `spec.md` y `plan.md` en `ready` y `tasks.md` generado. Las skills se detienen si falta alguno.
- Si durante la implementación el plan no encaja, se actualiza `plan.md` (y `spec.md` si cambia el comportamiento) antes de seguir.
- No inventar historias, criterios ni estimaciones: provienen de `docs/requisitos/` o de decisiones registradas (spec §14, plan §14).
- Dudas de negocio se consultan con el responsable funcional y se registran en la spec; dudas técnicas transversales, en `docs/dependencias-transversales.md`.
- Persistencia solo MongoDB + Mongoose; transacciones solo con replica set (DT-02).

## Definition of Done
Checklist de `/sdd-release` (`.claude/skills/sdd-release/SKILL.md`): documentación SDD coherente con lo implementado, matriz de cobertura completa, pruebas y lint en verde, sin secretos ni PII, PR aprobado e integrado en `develop`.

## Historias existentes
`specs/HU-EVAL-001/` es anterior a este flujo: tiene `spec.md` y un `tasks.md` preliminar en `draft`, sin `plan.md`. Quien la tome debe completarla con `/sdd-spec`, `/sdd-plan` y `/sdd-tasks` en su rama `feature/HU-EVAL-001`.
