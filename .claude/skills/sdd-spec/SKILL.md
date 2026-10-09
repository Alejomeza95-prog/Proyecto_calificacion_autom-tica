---
name: sdd-spec
description: Crea o actualiza spec.md (qué y por qué) de una historia de usuario en su rama feature/HU-XXXX, primer paso del flujo SDD spec → plan → tasks → implementación → pruebas → release. Usar cuando se pida especificar o planear una HU, convertir requisitos en spec o aclarar criterios de aceptación.
---

# SDD Spec

## Flujo del equipo
```
develop ──► feature/<ID> ──► spec.md ──► plan.md ──► tasks.md ──► implementación + pruebas ──► commits ──► /sdd-release ──► PR único hacia develop
            (esta skill)     /sdd-spec   /sdd-plan   /sdd-tasks    /sdd-implement                          revisión y merge
```
No hay aprobaciones ni PR separados para spec o plan: la revisión de todo ocurre en el PR único hacia `develop`. Antes de avanzar, el desarrollador responsable confirma que la spec está lista.

## Precondiciones
1. Confirmar la rama actual con `git branch --show-current`. Debe ser `feature/<ID>`. Si no lo es, indicar al desarrollador que la cree desde `develop` actualizado (`git switch develop`, `git pull`, `git switch -c feature/<ID>`); no crearla ni cambiarla sin su confirmación.
2. Leer `CLAUDE.md`, `specs/000-architecture/architecture.md` y `docs/SOURCE_OF_TRUTH.md`.
3. Localizar los documentos fuente de la historia en `docs/requisitos/`. **Si no existen, detenerse y reportarlo: no inventar historias, reglas, criterios ni estimaciones.**
4. Si `specs/<ID>/spec.md` ya existe, actualizarlo conservando su contenido; nunca sobrescribirlo completo sin confirmación.

## Salida
`specs/<ID>/spec.md` creado desde `specs/_templates/spec-template.md`.

La spec describe **qué** y **por qué**. No incluye esquemas, índices, endpoints ni contratos: eso pertenece a `plan.md`.

## Pasos
1. Completar front matter: `id`, `title`, `owner`, `branch: feature/<ID>`, `status: draft`.
2. Objetivo (rol, capacidad, valor) y contexto con referencia a las fuentes.
3. Alcance, fuera de alcance y supuestos.
4. Dependencias funcionales con otras historias.
5. Reglas de negocio numeradas `RN-NN`.
6. Flujo funcional, estados de negocio y roles.
7. Datos de negocio involucrados, marcando los personales.
8. Criterios de aceptación `CA-NN` en Dado/Cuando/Entonces, cada uno verificable.
9. Requisitos no funcionales `RNF-NN` solo si están respaldados.
10. Registrar dudas como `OPEN QUESTIONS` sin inventar respuestas.
11. Revisar el checklist de la plantilla (§13). Si se cumple, proponer `status: ready` y pedir al desarrollador que lo confirme.
12. Sugerir un commit en la rama (no ejecutarlo sin pedido): `docs(<ID>): crear spec`.

## Siguiente paso
Con la spec en `ready`: `/sdd-plan <ID>`.

## Vocabulario
Usar lenguaje de negocio. En términos técnicos, preferir los de MongoDB: colección, documento, referencia. No usar tabla, foreign key, JOIN ni migración Prisma.

## Criterio de buena spec
Otra persona del equipo puede diseñar el plan y las pruebas sin preguntar qué significa el requisito central.
