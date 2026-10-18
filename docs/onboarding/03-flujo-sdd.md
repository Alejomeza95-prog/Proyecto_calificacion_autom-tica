# 3. Flujo Spec-Driven Development (SDD)

Cada historia de usuario se documenta y construye en su propia rama con tres archivos, que **`/sdd-spec` genera juntos en una sola ejecución**:

| Archivo | Responde | Plantilla | Lo crea | Lo actualiza | Estados |
|---|---|---|---|---|---|
| `specs/<ID>/spec.md` | **Qué** y **por qué**: alcance, reglas RN, criterios CA | `specs/_templates/spec-template.md` | `/sdd-spec` | `/sdd-spec` | `draft → ready → in-progress → in-review → done` |
| `specs/<ID>/plan.md` | **Cómo**: arquitectura, colecciones y esquemas Mongoose, índices, endpoints, contratos, seguridad, pruebas, decisiones | `specs/_templates/plan-template.md` | `/sdd-spec` | `/sdd-plan` | `draft → ready` |
| `specs/<ID>/tasks.md` | **Pasos**: tareas T-NN → CA/RN → sección del plan → prueba | `specs/_templates/tasks-template.md` | `/sdd-spec` | `/sdd-tasks` | `draft → ready → in-progress → in-review → done` |

## Flujo completo
```
develop
  └─► feature/<ID>
        1. /sdd-spec <ID> <requisitos y CA>
              → specs/<ID>/spec.md + plan.md + tasks.md   (los tres en draft, trazabilidad validada)
              → si falta información esencial, Claude pregunta y no crea archivos
        2. Revisión del desarrollador
              - spec.md: checklist §13, OPEN QUESTIONS resueltas  → confirma ready
              - plan.md: checklist §16                           → confirma ready
              - si cambian requisitos: /sdd-plan <ID> y /sdd-tasks <ID> (actualizan sin borrar lo aprobado)
        3. /sdd-tasks <ID>       → tasks.md sincronizado y en ready
           commit  docs(<ID>): crear spec, plan y tareas
        4. /sdd-implement <ID>   → solo con spec y plan en ready y confirmación explícita
                                   código + pruebas, tarea por tarea   commits feat/test(<ID>): ... (T-NN)
        5. Pruebas completas (unit, integración MongoDB, E2E)
        6. /sdd-release <ID>     → checklist DoD + borrador de PR  (in-review)
        7. PR único  feature/<ID> → develop
        8. Revisión: observaciones se corrigen en la misma rama
        9. Aprobado + pruebas en verde → merge a develop  (done)
```

## Qué necesita `/sdd-spec`
Invocación: `/sdd-spec <ID> <requisitos>`, pegando los requisitos o indicando un documento de `docs/requisitos/`.

| Información esencial | Si falta |
|---|---|
| ID de la historia | Claude lo pide |
| Objetivo: rol, capacidad, valor | Claude lo pide |
| Requisitos o reglas de negocio | Claude los pide |
| Al menos un criterio de aceptación verificable | Claude lo pide |
| Responsable | Claude lo pide o usa `git config user.name` |

Lo no esencial (límites, paths de API, volúmenes, decisiones técnicas abiertas) no bloquea: queda como `OPEN QUESTIONS` en la spec (§12) o en el plan (§15). Claude no inventa respuestas.

Ejemplo ilustrativo (historia ficticia, no forma parte del backlog):
```
/sdd-spec HU-EJEMPLO-01 Como docente quiero ver el estado de procesamiento de una carga,
para saber cuándo están listos los resultados.
Reglas: solo el docente que creó la carga o un ADMIN pueden consultarla.
CA-01: Dado una carga en procesamiento, cuando la consulto, entonces veo su estado y porcentaje de avance.
CA-02: Dado una carga de otro docente, cuando intento consultarla sin ser ADMIN, entonces se me niega el acceso.
```

## Trazabilidad
`/sdd-spec`, `/sdd-plan`, `/sdd-tasks` e `/sdd-implement` comprueban que:
- cada `CA-NN` tiene diseño y caso de prueba en plan §12 y al menos una tarea;
- cada `RN-NN` aparece en el plan y en alguna tarea;
- cada tarea cita un `CA`/`RN`/`RNF` existente (o es «Soporte») y una sección existente del plan;
- ningún ID citado en plan o tareas falta en la spec.

Validador del repositorio (solo lectura, Windows PowerShell 5.1 o superior):
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/sdd-validate.ps1 -Id HU-EJEMPLO-01
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/sdd-validate.ps1 -Id HU-EJEMPLO-01 -RequireReady   # antes de implementar
```
Imprime `[OK]`, `[FALLA]` y `[AVISO]` por comprobación; termina con código 0 si no hay fallas.

## Actualizar sin perder lo aprobado
- IDs estables: `RN`, `CA`, `DEC` y `T` no se renumeran. Lo retirado u obsoleto se tacha con su motivo (`~~CA-03~~ (retirado: ...)`).
- `/sdd-plan` conserva las decisiones `DEC-NN` (las superadas se marcan «reemplazada por») y registra el cambio en plan §17.
- `/sdd-tasks` nunca borra ni desmarca tareas `[x]` ni su evidencia; las tareas nuevas toman el siguiente número.
- Un documento en `ready` que cambia vuelve a `draft` y el desarrollador debe confirmarlo de nuevo.
- Ningún archivo se sobrescribe completo sin mostrar los cambios y obtener confirmación.

## Reglas
- **No hay aprobaciones ni PR separados para spec o plan.** El desarrollador responsable verifica el checklist de cada plantilla y confirma `ready`; Claude nunca marca `ready` por su cuenta. El equipo revisa spec, plan, tareas, código y pruebas juntos en el PR.
- No se implementa sin `spec.md` y `plan.md` en `ready`, `tasks.md` en `ready` y confirmación explícita del desarrollador. `/sdd-spec` nunca inicia la implementación y `/sdd-implement` solo lo invoca el desarrollador.
- Si durante la implementación el plan no encaja, se actualiza `plan.md` (y `spec.md` si cambia el comportamiento) antes de seguir.
- No inventar historias, criterios ni estimaciones: provienen de `docs/requisitos/`, de requisitos aportados por el desarrollador y registrados en spec §14, o de decisiones registradas (plan §14).
- Dudas de negocio se consultan con el responsable funcional y se registran en la spec; dudas técnicas transversales, en `docs/dependencias-transversales.md`.
- Persistencia solo MongoDB + Mongoose; transacciones solo con replica set (DT-02).

## Definition of Done
Checklist de `/sdd-release` (`.claude/skills/sdd-release/SKILL.md`): documentación SDD coherente con lo implementado, matriz de cobertura completa y validador sin fallas, pruebas y lint en verde, sin secretos ni PII, PR aprobado e integrado en `develop`.

## Historias existentes
- `specs/HU-EVAL-001/` es anterior a este flujo: tiene `spec.md` y un `tasks.md` preliminar, sin `plan.md`. Quien la tome ejecuta `/sdd-spec HU-EVAL-001` en `feature/HU-EVAL-001`: Claude actualizará la spec conservando su contenido y generará el `plan.md` que falta; luego `/sdd-tasks HU-EVAL-001` sincronizará las tareas.
- `HT-CORE-01` vive en la rama `feature/HT-CORE-01`, aún no integrada en `develop`.
