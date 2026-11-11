---
id: HT-AUTH-03
spec: ./spec.md
plan: ./plan.md
status: ready            # draft | ready | in-progress | in-review | done
updated: 2026-11-11
---

# HT-AUTH-03 — Tasks

Rama: `feature/HT-AUTH-03` (desde `develop`).

Reglas:
- Generado por `/sdd-spec` (en `draft`) junto con `spec.md` y `plan.md`; `/sdd-tasks` lo actualiza cuando cambian. Pasa a `ready` solo cuando spec y plan están en `ready` y la trazabilidad se valida (`scripts/sdd-validate.ps1 -Id HT-AUTH-03`).
- No se implementa con este archivo en `draft`.
- Cada tarea `T-NN` referencia al menos un criterio (`CA-NN`), regla (`RN-NN`) o requisito no funcional (`RNF-NN`) y la sección del plan que implementa.
- Una tarea solo se marca `[x]` cuando su verificación pasa; registrar evidencia (comando y resultado, archivos, endpoint) y el commit.
- Si durante la implementación el plan resulta incorrecto, actualizar primero `plan.md` y luego estas tareas.
- Al actualizar: nunca borrar ni desmarcar tareas `[x]` ni su evidencia; no renumerar; las tareas obsoletas se tachan `~~T-NN~~ (obsoleta: motivo)`.
- Columna **Cubre**: `CA-NN`, `RN-NN`, `RNF-NN` o `Soporte` (con justificación en la tarea).
- Dependencias resueltas el 2026-11-11 (spec §12, plan DEC-03, DEC-04, DEC-06 y DEC-07): ninguna tarea vigente está bloqueada.

## Fase 1 — Datos (MongoDB / Mongoose)
| ID | Tarea | Cubre | Plan § | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|---|
| T-01 | Esquema `instituciones` mínimo y comando de siembra idempotente (DEC-03) | CA-02, RN-02 | §3, §14 | Integración: validaciones de `nombre`; siembra dos veces sin duplicados | [ ] | |
| T-02 | Esquema `pruebas` con `institucion_id`, `nombre`, `creado_por`, `schemaVersion` (DEC-04) | CA-06, RN-13 | §3 | Integración: campos requeridos rechazados | [ ] | |
| T-03 | Esquema `claves_respuesta` con enums de materia/opciones, `respuestas.length === cantidad_preguntas`, validador PUBLICADA⇒completa, `optimisticConcurrency`, `SESIONES = ['SESION_1','SESION_2']`, `MAX_PREGUNTAS = 100` | CA-07, RN-06, RN-08, RN-09, RN-10 | §3 | Integración: `E`, `BLANK`, materia `FIS`, sesión `SESION_3`, 0 y 101 preguntas, longitud distinta y PUBLICADA incompleta rechazadas | [ ] | |
| T-04 | Esquema `auditoria_admin` (`strict: 'throw'`, solo inserción) | CA-14, RN-17 | §3 | Integración: campo `correo` rechazado; inserción válida | [ ] | |
| T-05 | Migración `003-ht-auth-03-indices.ts` con los índices de §4 de `usuarios`, `instituciones`, `pruebas`, `claves_respuesta` y `auditoria_admin` (los de `resoluciones_manuales` van en OMR-002) y reversión | CA-01, CA-08, CA-11, RN-07 | §4, §7 | `migrate:up` dos veces sin cambios; `migrate:down` elimina los índices; E11000 en clave duplicada | [ ] | |

## Fase 2 — Dominio y servicios
| ID | Tarea | Cubre | Plan § | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|---|
| T-06 | `ProblemType.CONFLICTO` (409) y `clave-incompleta` (422) con `preguntasFaltantes` en el filtro `problem+json` | CA-03, CA-08, CA-09, CA-10, RNF-02 | §8, §11 | Unit: cuerpo `problem+json` correcto | [ ] | |
| T-07 | `AdminAuditService.record()` con eventos de §3.5, sin PII; fallo registrado con `correlationId` sin revertir | CA-14, RN-17 | §2.3, §5 | Unit + integración | [ ] | |
| T-08 | `AdminUsersService.listPending` (paginado, proyección sin secretos) | CA-01, RN-01 | §2.3, §3 | Integración: solo PENDIENTE_APROBACION, sin `password_hash` | [ ] | |
| T-09 | `AdminUsersService.approve`: `findOneAndUpdate` condicional, `roleInstitutionViolation`, rol solo COORDINADOR/DOCENTE, rechazo de autoaprobación, auditoría | CA-02, CA-03, RN-02, RN-03, RN-04 | §2.3, §5, §11 | Integración: aprobación OK; dos aprobaciones en paralelo → una 409 | [ ] | |
| T-10 | `answer-key.rules.ts`: `resize`, `isComplete`, `missingQuestions` | CA-06, CA-10, RN-08, RN-10 | §2.3 | Unit: conservar, recortar y ampliar; faltantes correctos | [ ] | |
| T-11 | `PruebasService` (listar con alcance; alta por ADMIN y COORDINADOR, DEC-04 y DEC-06) | CA-06, RN-13 | §2.3, §11 | Integración: alcance por institución; duplicado → 409; DOCENTE no crea | [ ] | |
| T-12 | `AnswerKeysService.create` (copia `institucion_id` de la prueba, E11000 → 409) | CA-06, CA-08, RN-07, RN-13 | §2.3, §5 | Integración | [ ] | |
| T-13 | `AnswerKeysService.update` con `version` y filtro `estado: BORRADOR` | CA-09, CA-10, RN-11, RN-14 | §5 | Integración: versión vieja → 409; PUBLICADA → 409 | [ ] | |
| T-14 | `AnswerKeysService.publish` con completitud en el filtro atómico | CA-10, RN-10 | §5 | Integración: completa → PUBLICADA; incompleta → 422 | [ ] | |
| T-15 | `AnswerKeysService.remove` y `list`/`get` con `InstitutionScopePolicy` | CA-11, CA-12, RN-12, RN-13 | §5, §11 | Integración: otra institución → 404; PUBLICADA no se elimina | [ ] | |
| T-16 | `ManualReviewService.resolve` y esquema `resoluciones_manuales` (sin endpoint productivo, DEC-07) | CA-13, RN-15, RN-16 | §3, §14 | Unit + integración: `verificada: true` sin valor rechazado; `verificada` nunca por defecto | [ ] | |

## Fase 3 — API / jobs
| ID | Tarea | Cubre | Plan § | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|---|
| T-17 | `AdminUsersController` (`GET /admin/usuarios`, `POST /admin/usuarios/:id/aprobar`), DTOs, `@Roles('ADMIN')`, `@OriginProtected()` | CA-01, CA-02, CA-03, RN-01 | §8, §9 | Supertest: 200/400/401/403/404/409 | [ ] | |
| T-18 | `GET /instituciones` (ADMIN) y `GET`/`POST /pruebas` (Lectura/Edición, DEC-06) | CA-02, CA-06 | §8, §9 | Supertest: 200/201/403/409 por rol | [ ] | |
| T-19 | `AnswerKeysController` (GET lista, GET id, POST, PUT, POST publicar, DELETE) con DTOs de §9.1 y roles Lectura/Edición de DEC-06 | CA-06, CA-07, CA-08, CA-09, CA-10, CA-11, CA-12 | §8, §9 | Supertest: matriz de códigos de §8 | [ ] | |
| ~~T-20~~ | ~~`PATCH /revision-manual/marcas/:id` y migración de índices de `resoluciones_manuales`~~ (obsoleta: trasladada a OMR-002 por DEC-07, aprobada el 2026-11-11) | — | §8 | — | — | |

## Fase 4 — Frontend
| ID | Tarea | Cubre | Plan § | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|---|
| T-21 | `AppShell` + `Sidebar` + `nav-items.ts` filtrado por rol, `aria-current`, botón de menú en pantallas angostas, cierre de sesión | CA-04, CA-05, RN-05, RNF-01 | §2.1, §14 | Vitest + Testing Library: opciones por rol; teclado | [ ] | |
| T-22 | Rutas privadas nuevas (`/usuarios`, `/claves`, `/claves/nueva`, `/claves/:id`), `RequireRole`, actualización de `PRIVATE_ROUTES` | CA-04, RN-05 | §2.1 | Vitest: URL no permitida redirige | [ ] | |
| T-23 | Panel de usuarios: lista de pendientes, diálogo de aprobación (rol, institución), mensajes de 400/403/409 | CA-01, CA-02, CA-03 | §2.1, §8 | Vitest con API simulada | [ ] | |
| T-24 | Listado de claves con filtros y estado; acciones según estado y rol | CA-11, CA-12, RN-12 | §2.1, §8 | Vitest | [ ] | |
| T-25 | Editor de clave: selectores de prueba, fecha, sesión y materia; grilla dinámica A–D; aviso al reducir N; guardar borrador, publicar (faltantes resaltados), conflicto 409 | CA-06, CA-07, CA-08, CA-09, CA-10, RN-08, RN-09, RN-14 | §2.1, §9 | Vitest: grilla de N filas; solo A–D seleccionables; aviso de conflicto | [ ] | |
| T-26 | Componente `VerifiedCheckbox` (deshabilitado sin valor, desmarcado por defecto, etiqueta accesible) | CA-13, RN-16 | §2.1 | Vitest: estados habilitado/deshabilitado | [ ] | |

## Fase 5 — Pruebas transversales
| ID | Tarea | Cubre | Plan § | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|---|
| T-27 | E2E: ADMIN aprueba → DOCENTE/COORDINADOR inicia sesión → crea, edita y publica clave | CA-02, CA-06, CA-09, CA-10 | §12 | Playwright | [ ] | |
| T-28 | E2E accesibilidad y responsive del menú y pantallas nuevas | CA-05, RNF-01 | §12 | Playwright + axe-core sin serious/critical | [ ] | |
| T-29 | Prueba de aislamiento entre instituciones y de auditoría completa | CA-11, CA-14, RN-13, RN-17 | §12 | Jest + Supertest | [ ] | |
| T-30 | Typecheck strict y lint en backend y frontend; tests de constantes compartidas (`MATERIAS`, `OPCIONES_CLAVE`, `SESIONES`, `MAX_PREGUNTAS`) | RNF-02, RN-06, RN-09 | §9, §12 | `pnpm typecheck`, `pnpm lint`, `pnpm test` en verde | [ ] | |
| T-31 | Guardar los requisitos aportados en `docs/requisitos/historias/HT-AUTH-03.md` y actualizar `specs/roadmap.md` y `docs/catalogo-historias.md` | Soporte: trazabilidad exigida por `CLAUDE.md` regla 9 | §10 | Archivos presentes y enlazados | [ ] | |

## Fase 6 — Release
| ID | Tarea | Cubre | Plan § | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|---|
| T-32 | `/sdd-release` y Pull Request hacia `develop` | Todos | — | Checklist de release completo | [ ] | |

## Matriz de cobertura
| Criterio / regla | Tareas | Pruebas | Cubierto |
|---|---|---|---|
| CA-01 | T-05, T-08, T-17, T-23 | Supertest listado; Vitest panel | [ ] |
| CA-02 | T-01, T-09, T-17, T-18, T-23, T-27 | Supertest aprobar; E2E | [ ] |
| CA-03 | T-06, T-09, T-17, T-23 | Supertest 400/403/404/409 | [ ] |
| CA-04 | T-21, T-22 | Vitest; Playwright | [ ] |
| CA-05 | T-21, T-28 | Playwright + axe | [ ] |
| CA-06 | T-02, T-10, T-11, T-12, T-18, T-19, T-25, T-27 | Jest `resize`; Vitest grilla; E2E | [ ] |
| CA-07 | T-03, T-19, T-25 | Supertest 400; validador de esquema | [ ] |
| CA-08 | T-05, T-06, T-12, T-19, T-25 | Integración E11000 → 409 | [ ] |
| CA-09 | T-06, T-13, T-19, T-25, T-27 | Supertest versión vieja → 409 | [ ] |
| CA-10 | T-06, T-10, T-13, T-14, T-19, T-25, T-27 | Supertest 422/409 | [ ] |
| CA-11 | T-05, T-15, T-19, T-24, T-29 | Supertest alcance | [ ] |
| CA-12 | T-15, T-19, T-24 | Supertest 204/409 | [ ] |
| CA-13 | T-16, T-26 | Vitest casilla; Jest servicio; integración del esquema | [ ] |
| CA-14 | T-04, T-07, T-29 | Integración auditoría | [ ] |
| RN-01..RN-17 | ver columna «Cubre» | §12 del plan | [ ] |
| RNF-01 | T-21, T-28 | axe-core | [ ] |
| RNF-02 | T-06, T-30 | tsc, lint | [ ] |

## Registro de cambios
| Fecha | Cambio | Motivo |
|---|---|---|
| 2026-11-11 | Creación con `/sdd-spec` | — |
| 2026-11-11 | Sincronización con spec y plan en `ready` (`/sdd-tasks`): se retiran las marcas de bloqueo de T-01, T-02, T-03, T-11, T-18 y T-19; T-01, T-03, T-05, T-11, T-18 y T-30 se ajustan a DEC-03, DEC-04, DEC-06, `SESIONES` y `MAX_PREGUNTAS`; T-20 obsoleta (trasladada a OMR-002, DEC-07); matriz de CA-13 actualizada. Estado draft → ready por pedido explícito de JhonDc | spec §14, plan §17 |
