---
id: HU-XXXX-000
title: <Título>
status: draft            # draft | ready | in-progress | in-review | done
owner: <desarrollador responsable>
branch: feature/HU-XXXX-000
updated: YYYY-MM-DD
---

# <ID> — <Título>

> **spec.md describe QUÉ se construye y POR QUÉ.** El CÓMO (colecciones, índices, endpoints, contratos, pruebas) va en `plan.md`.
> Fuente obligatoria: documentos en `docs/requisitos/` o requisitos aportados por el desarrollador y registrados en §14. No inventar requisitos ni criterios.
> Generado por `/sdd-spec` junto con `plan.md` y `tasks.md`, en estado `draft`. Solo el desarrollador responsable cambia el estado a `ready`, tras revisar el checklist §13.

## 1. Objetivo
Como <rol>, quiero <capacidad>, para <valor>.

## 2. Contexto y fuentes
- Problema que resuelve y situación actual.
- Documentos fuente: `docs/requisitos/...` (sección/página) y/o «Requisitos aportados por <owner> el YYYY-MM-DD» (ver §14).

## 3. Alcance
### Incluye
- ...

### Fuera de alcance
- ...

### Supuestos
- ...

## 4. Dependencias funcionales
Otras historias o datos de negocio que deben existir (ej. estudiantes inscritos, claves de respuesta).
- ...

## 5. Reglas de negocio e invariantes
Numerarlas para poder referenciarlas desde `plan.md` y `tasks.md`.
- **RN-01:** ...

## 6. Flujo funcional
1. ...

## 7. Estados y situaciones de negocio
| Estado / situación | Significado | Qué ve o puede hacer el usuario |
|---|---|---|
| | | |

## 8. Roles y permisos (nivel negocio)
| Rol | Puede |
|---|---|
| | |

## 9. Datos de negocio involucrados
Qué información se registra o consulta, en lenguaje de negocio (sin esquemas; los esquemas van en `plan.md`). Indicar qué datos son personales.
- ...

## 10. Criterios de aceptación
Cada criterio debe ser verificable por una prueba automatizada o una evidencia reproducible.

### CA-01 — <nombre>
**Dado** ...  
**Cuando** ...  
**Entonces** ...

## 11. Requisitos no funcionales
Rendimiento esperado, volumen, disponibilidad, accesibilidad, retención (solo si están respaldados por un documento fuente).
- **RNF-01:** ...

## 12. OPEN QUESTIONS
Preguntas sin respuesta en los documentos fuente. No inventar respuestas. Al resolverlas, marcar `[x]`, anotar la respuesta y registrarla en §14.
- [ ] ...

## 13. Checklist de spec lista (`status: ready`)
- [ ] Objetivo, alcance y fuera de alcance claros.
- [ ] Reglas de negocio numeradas (RN-NN).
- [ ] Criterios de aceptación verificables (CA-NN).
- [ ] Sin OPEN QUESTIONS que cambien el comportamiento observable (o resueltas con el responsable funcional y registradas en §14).
- [ ] Todo requisito respaldado por `docs/requisitos/` o una decisión registrada.

## 14. Registro de cambios y aclaraciones
Mantener los IDs `RN`/`CA`/`RNF` estables: no renumerar. Un criterio retirado se marca `~~CA-NN~~ (retirado: motivo)`.

| Fecha | Cambio / aclaración | Fuente o persona consultada |
|---|---|---|
| YYYY-MM-DD | Creación con `/sdd-spec` | <documento fuente o requisitos aportados por owner> |
