---
id: HT-AUTH-03
title: Administración de cuentas, navegación principal, claves de respuesta y verificación manual
status: in-progress      # draft | ready | in-progress | in-review | done
owner: JhonDc
branch: feature/HT-AUTH-03
updated: 2026-11-11
---

# HT-AUTH-03 — Administración de cuentas, navegación principal, claves de respuesta y verificación manual

> **spec.md describe QUÉ se construye y POR QUÉ.** El CÓMO (colecciones, índices, endpoints, contratos, pruebas) va en `plan.md`.
> Fuente: requisitos aportados por el desarrollador el 2026-11-11 (§14). Generado por `/sdd-spec` junto con `plan.md` y `tasks.md`, en estado `draft`. Solo el desarrollador responsable cambia el estado a `ready`, tras revisar el checklist §13.
> Las reglas marcadas *(confirmada)* no venían en los requisitos aportados: eran propuestas que el desarrollador aprobó el 2026-11-11 (§12, §14).

## 1. Objetivo
Como **administrador** de OMR-PreICFES, quiero aprobar las cuentas que esperan habilitación y navegar el sistema desde un menú lateral; como **responsable académico**, quiero registrar, editar y publicar las claves de respuesta de cada prueba por materia, y confirmar con una casilla «Verificada» las marcas dudosas que el sistema OMR envía a revisión manual, para que solo personas habilitadas operen el sistema y la calificación se base en claves completas y lecturas confirmadas.

## 2. Contexto y fuentes
- **Tipo:** historia técnica (backend + frontend) que agrupa cuatro funcionalidades pedidas por el desarrollador en una sola entrega.
- **Fuentes:**
  - Requisitos aportados por JhonDc el 2026-11-11 (§14): panel de usuarios, menú lateral, CRUD de clave de respuestas y casilla «Verificada».
  - `CLAUDE.md` (reglas OMR): áreas, puntajes, estados de lectura A/B/C/D, BLANK, MULTIPLE, UNCERTAIN; la lectura dudosa va a revisión manual.
  - `specs/000-architecture/architecture.md`: «los resultados ambiguos no deben calificarse automáticamente».
  - `specs/HT-AUTH-01/spec.md` RN-01 (PENDIENTE_APROBACION hasta que un administrador asigne institución y rol), RN-15 (coherencia rol–institución), RN-17 / `DEC-14` (aislamiento por institución, 404/403), `DEC-11` (roles; nadie modifica su propio rol), `DEC-22` (una asignación nunca concede ADMIN por invitación).
  - `specs/HT-AUTH-02/spec.md`: frontend de autenticación, ruta privada `/inicio` y protección de rutas.
- **Situación del repositorio (verificada el 2026-11-11 en `develop`, `1882346`):**
  - `usuarios` ya tiene `estado`, `rol` e `institucion_id`; la transición PENDIENTE_APROBACION → ACTIVA está permitida en `account-status.ts` pero **no existe la operación** que la ejecuta (HT-AUTH-01 la delegó a «una historia posterior»). Esta historia la implementa.
  - No existe una colección de instituciones ni de pruebas/exámenes (DT-09).
  - No existen lecturas OMR ni revisión manual: el motor OMR (`apps/omr`) y la lectura de burbujas son de OMR-001..003.
  - El frontend tiene una única ruta privada (`/inicio`) sin menú ni estructura de navegación.
- **Relación con otras historias del roadmap:** HU-EVAL-002 («Claves de respuesta versionadas») cubre un tema que se superpone con §3 de esta historia; ver §12.

## 3. Alcance
### Incluye
1. **Panel de usuarios:** listado de cuentas en PENDIENTE_APROBACION y acción «Aprobar», que asigna rol institucional e institución y deja la cuenta ACTIVA.
2. **Menú lateral (sidebar):** navegación principal de las rutas privadas, con opciones según el rol.
3. **Claves de respuesta:** crear, consultar, listar, editar, publicar y eliminar claves por prueba, fecha, sesión y materia, con grilla generada según la cantidad de preguntas y respuestas limitadas a A, B, C y D; estados Borrador y Publicada.
4. **Casilla «Verificada»:** control visual en la resolución manual de una marca dudosa, con su regla de negocio y su contrato.

### Fuera de alcance
- Rechazar, bloquear, desactivar o reactivar cuentas; cambiar el rol de una cuenta ya ACTIVA; invitaciones (`HT-AUTH-01/DEC-22`).
- Administración completa de instituciones (DT-09): aquí solo hay un catálogo mínimo de consulta, con altas por siembra controlada. De las pruebas solo se incluyen el listado y el alta mínima.
- Corrección y versionado de claves publicadas (HU-EVAL-002), comparación con las respuestas (HU-EVAL-003), ponderación y puntajes (HU-EVAL-004/005).
- Producción de lecturas OMR, detección de marcas dudosas, la cola de revisión manual y el endpoint que guarda la verificación (OMR-002). Esta historia entrega la casilla, su regla y su servicio, probados con datos de prueba (§4).
- Identidad visual global (HU-UX-001).

### Supuestos
- La sesión, el rol y la institución del usuario se obtienen de `GET /api/v1/auth/me` (HT-AUTH-01/02).
- Las cinco materias de la clave son las áreas oficiales de `CLAUDE.md`: Matemáticas (MAT), Ciencias Naturales (CN), Competencias Ciudadanas (CC), Lectura Crítica (LC) e Inglés (ING).

## 4. Dependencias funcionales
- **HT-AUTH-01 / HT-AUTH-02** (en `develop`): cuentas, roles, guards, sesión y rutas privadas.
- **Instituciones (DT-09):** aprobar una cuenta COORDINADOR o DOCENTE exige una institución. Esta historia crea un catálogo mínimo de consulta, alimentado por siembra controlada (§12, resuelta).
- **Pruebas:** la clave se asocia a una prueba seleccionable. Esta historia crea un catálogo mínimo por institución, con listado y alta (§12, resuelta).
- **OMR-002 (lectura de burbujas y ambigüedad):** fuente de las marcas dudosas. Aquí la casilla «Verificada» se prueba con datos de prueba; el guardado real de la verificación se integra en OMR-002 (CA-13).

## 5. Reglas de negocio e invariantes
**Panel de usuarios**
- **RN-01:** solo un ADMIN con cuenta ACTIVA puede consultar las cuentas pendientes y aprobarlas (HT-AUTH-01 §8: «un ADMIN ACTIVO aprueba las cuentas en PENDIENTE_APROBACION»). Un COORDINADOR no aprueba cuentas (§12, resuelta).
- **RN-02:** la aprobación solo procede sobre una cuenta en PENDIENTE_APROBACION y la deja ACTIVA, con un rol y una institución coherentes (HT-AUTH-01 RN-15). Una cuenta en cualquier otro estado no se aprueba.
- **RN-03** *(confirmada)*: la aprobación asigna solo roles institucionales (COORDINADOR o DOCENTE), nunca ADMIN, por analogía con `HT-AUTH-01/DEC-22`. Nadie aprueba ni asigna rol a su propia cuenta (`HT-AUTH-01/DEC-11`).
- **RN-04:** si dos administradores aprueban la misma cuenta a la vez, solo una aprobación tiene efecto; la otra recibe un aviso de que la cuenta ya no está pendiente.

**Menú lateral**
- **RN-05:** el menú lateral solo muestra las opciones que el rol del usuario puede usar. Ocultar una opción no reemplaza la autorización: el servidor rechaza igualmente el acceso a una función no permitida.

**Claves de respuesta**
- **RN-06:** la materia de una clave es una de MAT, CN, CC, LC o ING.
- **RN-07:** una clave se identifica por prueba + fecha + sesión + materia. No puede haber dos claves con la misma combinación en la misma institución.
- **RN-08:** la persona que registra la clave indica la cantidad de preguntas de la materia: un entero entre 1 y 100. Esa cantidad determina el número de filas de la grilla (una fila por pregunta, numeradas desde 1).
- **RN-09:** cada respuesta de la clave es exactamente una de A, B, C o D. Los estados de lectura BLANK, MULTIPLE y UNCERTAIN no son valores válidos de una clave.
- **RN-10:** una clave tiene estado **Borrador** o **Publicada**. Una clave nueva nace en Borrador. En Borrador se puede guardar incompleta *(confirmada)* y editar libremente (respuestas y cantidad de preguntas). **Publicar** exige que todas las preguntas tengan respuesta.
- **RN-11:** una clave Publicada no se modifica ni se reabre en esta historia. Su corrección y versionado corresponden a HU-EVAL-002 (§12, resuelta).
- **RN-12** *(confirmada)*: solo se elimina una clave en Borrador; una Publicada no se elimina.
- **RN-13:** las claves y pruebas pertenecen a una institución. COORDINADOR y DOCENTE solo ven y operan las de su institución; un recurso de otra institución se trata como inexistente (HT-AUTH-01 RN-17, `DEC-14`). ADMIN tiene alcance global.
- **RN-14** *(confirmada)*: si dos personas editan el mismo Borrador a la vez, la segunda en guardar recibe un aviso de conflicto y no sobrescribe en silencio los cambios de la primera.

**Casilla «Verificada»**
- **RN-15:** una marca leída como dudosa (UNCERTAIN o MULTIPLE) no se califica automáticamente y queda pendiente de revisión manual (`CLAUDE.md`, arquitectura).
- **RN-16:** la casilla «Verificada» solo puede marcarse después de elegir el valor resuelto de la marca (A, B, C, D o BLANK). Nunca se marca de forma automática. Marcarla y guardar confirma la resolución y saca la marca de los pendientes; sin marcarla, la marca sigue pendiente aunque tenga un valor elegido.

**Transversal**
- **RN-17:** se registra quién, cuándo y qué hizo en cada aprobación de cuenta, en cada creación, edición, publicación y eliminación de una clave y en cada verificación manual, sin datos personales innecesarios en los registros técnicos.

## 6. Flujo funcional
**6.1 Aprobar una cuenta**
1. El ADMIN abre «Usuarios» desde el menú lateral y ve las cuentas pendientes (nombre, correo, fecha de registro).
2. Elige una cuenta, selecciona rol (COORDINADOR o DOCENTE) e institución y confirma «Aprobar».
3. La cuenta queda ACTIVA y desaparece de la lista de pendientes; la persona ya puede iniciar sesión.

**6.2 Registrar una clave**
1. Desde «Claves de respuesta» elige «Nueva clave».
2. Selecciona prueba, fecha, sesión y materia, e indica la cantidad de preguntas.
3. Aparece la grilla con una fila por pregunta y las opciones A, B, C y D.
4. Marca las respuestas y elige «Guardar borrador» (puede quedar incompleta) o «Publicar» (exige todas).
5. Desde el listado puede reabrir un Borrador, editarlo y guardarlo de nuevo, o eliminarlo.

**6.3 Verificar una marca dudosa**
1. En la resolución manual de una marca dudosa, la persona revisora elige el valor resuelto.
2. Se habilita la casilla «Verificada»; al marcarla y guardar, la marca queda confirmada.

## 7. Estados y situaciones de negocio
| Estado / situación | Significado | Qué ve o puede hacer el usuario |
|---|---|---|
| Cuenta PENDIENTE_APROBACION | Correo verificado, sin rol ni institución | Aparece en el panel de usuarios; no puede iniciar sesión |
| Cuenta ACTIVA (tras aprobar) | Rol institucional e institución asignados | Inicia sesión y ve el menú según su rol |
| Cuenta ya aprobada por otro | Otro ADMIN la aprobó antes | Aviso «la cuenta ya no está pendiente»; la lista se actualiza |
| Clave en Borrador | En construcción | Editar, guardar, publicar o eliminar |
| Clave Publicada | Lista para calificar | Solo consulta (la corrección corresponde a HU-EVAL-002) |
| Clave duplicada | Ya existe una con la misma prueba, fecha, sesión y materia | Aviso; se ofrece abrir la existente |
| Conflicto de edición | Otra persona guardó antes | Aviso; recargar antes de volver a guardar |
| Marca dudosa pendiente | Lectura UNCERTAIN o MULTIPLE sin confirmar | Elegir valor; casilla «Verificada» deshabilitada hasta elegirlo |
| Marca verificada | Resolución confirmada | Ya no aparece como pendiente |

## 8. Roles y permisos (nivel negocio)
| Rol | Puede |
|---|---|
| ADMIN | Ver pendientes y aprobar cuentas; crear, editar, publicar y eliminar claves y crear pruebas en cualquier institución; verificar marcas dudosas |
| COORDINADOR | Crear, editar, publicar y eliminar claves y crear pruebas de su institución; verificar marcas dudosas de su institución. No aprueba cuentas |
| DOCENTE | Solo consultar claves y pruebas de su institución |

## 9. Datos de negocio involucrados
- **Cuenta:** nombre (**personal**), correo (**personal**), estado, rol, institución, fecha de registro.
- **Prueba:** nombre e institución.
- **Clave de respuesta:** prueba, fecha, sesión (Sesión 1 o Sesión 2), materia, cantidad de preguntas, respuesta por pregunta, estado, quién la creó, editó y publicó, y cuándo.
- **Resolución manual:** marca, valor leído, valor resuelto, verificada (sí/no), quién y cuándo.
- **Registro de auditoría:** acción, autor, recurso, fecha y hora.

## 10. Criterios de aceptación

### CA-01 — Listado de cuentas pendientes
**Dado** un ADMIN ACTIVO con sesión iniciada  
**Cuando** abre «Usuarios»  
**Entonces** ve solo las cuentas en PENDIENTE_APROBACION, con nombre, correo y fecha de registro, sin datos de credenciales;  
**y dado** un usuario COORDINADOR o DOCENTE, **cuando** intenta consultar el listado, **entonces** el sistema lo rechaza por permiso insuficiente.

### CA-02 — Aprobar una cuenta
**Dado** una cuenta en PENDIENTE_APROBACION  
**Cuando** un ADMIN la aprueba con el rol COORDINADOR o DOCENTE y una institución  
**Entonces** la cuenta queda ACTIVA con ese rol e institución, sale de la lista de pendientes, puede iniciar sesión y la aprobación queda registrada (RN-17).

### CA-03 — Aprobación rechazada
**Dado** un intento de aprobación  
**Cuando** la cuenta no está en PENDIENTE_APROBACION (incluida una aprobación simultánea ya aplicada), o el rol es ADMIN, o falta la institución, o quien aprueba es su propia cuenta o no es ADMIN  
**Entonces** la cuenta no cambia y el usuario recibe un mensaje que indica el motivo (conflicto, datos inválidos o permiso insuficiente).

### CA-04 — Menú lateral por rol
**Dado** un usuario con sesión iniciada  
**Cuando** se muestra cualquier pantalla privada  
**Entonces** el menú lateral muestra «Inicio», «Claves de respuesta» según los permisos de su rol y «Usuarios» solo si es ADMIN, resalta la opción de la pantalla actual y permite cerrar sesión;  
**y cuando** un usuario sin permiso escribe la dirección de una opción oculta, **entonces** no accede a su contenido.

### CA-05 — Menú lateral usable y accesible
**Dado** una pantalla privada  
**Cuando** se usa solo con teclado o en una pantalla angosta (móvil)  
**Entonces** todas las opciones del menú son alcanzables y activables con teclado, la opción actual se anuncia como actual a los lectores de pantalla, en pantallas angostas el menú se abre y cierra con un botón, y la página no presenta infracciones de accesibilidad graves o críticas.

### CA-06 — Crear clave y generar la grilla
**Dado** un usuario autorizado y al menos una prueba disponible  
**Cuando** selecciona prueba, fecha, sesión (Sesión 1 o Sesión 2), materia (MAT, CN, CC, LC o ING) e indica N preguntas (de 1 a 100)  
**Entonces** aparece una grilla de N filas numeradas de 1 a N con las opciones A, B, C y D; al cambiar N en un Borrador la grilla se ajusta, conservando las respuestas de las preguntas que siguen existiendo y avisando antes de descartar las que sobran;  
**y cuando** guarda, **entonces** la clave queda en Borrador.

### CA-07 — Respuestas limitadas a A, B, C y D
**Dado** una clave en edición  
**Cuando** se intenta guardar una respuesta distinta de A, B, C o D (incluidas BLANK, MULTIPLE o UNCERTAIN), una cantidad de preguntas no entera, menor que 1 o mayor que 100, una sesión distinta de Sesión 1 o Sesión 2, o una materia fuera del catálogo  
**Entonces** el sistema rechaza el guardado indicando el campo inválido y la clave guardada no cambia.

### CA-08 — Clave duplicada
**Dado** una clave existente para una prueba, fecha, sesión y materia  
**Cuando** se intenta crear otra con la misma combinación en la misma institución  
**Entonces** el sistema la rechaza con un aviso de duplicado.

### CA-09 — Editar un Borrador
**Dado** una clave en Borrador  
**Cuando** se cambian respuestas o la cantidad de preguntas y se guarda  
**Entonces** los cambios quedan guardados y se registran (RN-17);  
**y dado** que otra persona guardó el mismo Borrador después de que se abrió, **cuando** se intenta guardar, **entonces** el sistema avisa del conflicto y no sobrescribe los cambios ajenos.

### CA-10 — Publicar y proteger la clave publicada
**Dado** una clave en Borrador  
**Cuando** se publica con todas las preguntas respondidas  
**Entonces** queda Publicada, con fecha y autor de la publicación;  
**y cuando** se intenta publicar con preguntas sin respuesta, **entonces** se rechaza indicando cuáles faltan;  
**y dado** una clave Publicada, **cuando** se intenta modificarla o eliminarla directamente, **entonces** se rechaza y la clave no cambia.

### CA-11 — Consultar y listar claves dentro del alcance
**Dado** claves de varias instituciones  
**Cuando** un COORDINADOR o DOCENTE lista claves (filtrando por prueba, fecha, sesión, materia o estado) o abre una por su identificador  
**Entonces** solo obtiene las de su institución, y una clave de otra institución se responde como inexistente; un ADMIN obtiene las de cualquier institución.

### CA-12 — Eliminar un Borrador
**Dado** una clave en Borrador  
**Cuando** un usuario autorizado la elimina y confirma  
**Entonces** deja de aparecer en el listado y la eliminación queda registrada (RN-17).

### CA-13 — Casilla «Verificada»
**Dado** una marca dudosa (UNCERTAIN o MULTIPLE) en resolución manual, revisada por un ADMIN o COORDINADOR (con datos de prueba hasta que exista OMR-002)  
**Cuando** aún no se eligió el valor resuelto  
**Entonces** la casilla «Verificada» aparece deshabilitada y desmarcada;  
**y cuando** se elige un valor (A, B, C, D o BLANK), marca la casilla y guarda, **entonces** la marca queda verificada con su valor, autor y fecha, y deja de figurar como pendiente;  
**y cuando** se guarda sin marcar la casilla, **entonces** la marca sigue pendiente;  
**y** ninguna marca dudosa aparece verificada sin una acción explícita de una persona.

### CA-14 — Auditoría
**Dado** cualquiera de las acciones de RN-17  
**Cuando** se completa  
**Entonces** existe un registro con la acción, el autor, el recurso afectado y la fecha, sin correos ni contraseñas en el registro técnico.

## 11. Requisitos no funcionales
- **RNF-01:** las pantallas nuevas no presentan infracciones de accesibilidad graves o críticas según la verificación automática adoptada por el proyecto (`HT-AUTH-01/DEC-13`: Playwright + axe-core).
- **RNF-02:** el código nuevo usa TypeScript en modo estricto y errores en formato `application/problem+json` (`CLAUDE.md`, `HT-AUTH-01/DEC-21`).

## 12. OPEN QUESTIONS
Todas resueltas por el desarrollador responsable (JhonDc) el 2026-11-11, que delegó la resolución aceptando las propuestas del plan y los valores indicados (§14).
- [x] ~~Instituciones: ¿qué institución se asigna al aprobar?~~ **Resuelta:** catálogo mínimo `instituciones` de solo consulta por API, con altas por siembra controlada (migración o comando); su administración completa sigue en DT-09 (`plan.md` DEC-03).
- [x] ~~Pruebas: ¿de dónde sale la lista de «Nombre de la prueba»?~~ **Resuelta:** catálogo mínimo de pruebas por institución, con listado y alta (ADMIN y COORDINADOR) (`plan.md` DEC-04).
- [x] ~~Sesión: valores; ¿fecha y sesión pertenecen a la prueba o a la clave?~~ **Resuelta:** Sesión 1 y Sesión 2. Fecha y sesión son datos de la clave.
- [x] ~~Límite de la cantidad de preguntas y quién la fija~~ **Resuelta:** la fija la persona que registra la clave; entero de 1 a 100 (RN-08).
- [x] ~~¿Cómo se corrige una clave Publicada? ¿Se absorbe HU-EVAL-002?~~ **Resuelta:** en esta historia una clave Publicada es de solo consulta; su corrección y versionado quedan en HU-EVAL-002, que sigue siendo una historia aparte (RN-11).
- [x] ~~¿Qué pueden hacer COORDINADOR y DOCENTE con las claves?~~ **Resuelta:** ADMIN y COORDINADOR crean, editan, publican y eliminan; DOCENTE solo consulta (§8, `plan.md` DEC-06). Es una definición parcial de los permisos de COORDINADOR pendientes desde `HT-AUTH-01/DEC-11`.
- [x] ~~¿Puede un COORDINADOR aprobar cuentas?~~ **Resuelta:** no; solo ADMIN (RN-01).
- [x] ~~Confirmar RN-03~~ **Resuelta:** confirmada; la aprobación nunca asigna ADMIN.
- [x] ~~Confirmar RN-10, RN-12 y RN-14~~ **Resuelta:** confirmadas.
- [x] ~~Casilla «Verificada»: rol revisor, BLANK, persistencia~~ **Resuelta:** revisan ADMIN y COORDINADOR; BLANK es un valor resuelto válido; esta historia entrega esquema, servicio, regla y componente probados con datos de prueba; el endpoint productivo y sus índices se integran en OMR-002 (`plan.md` DEC-07).
- [x] ~~¿Se mantiene una sola historia o se divide?~~ **Resuelta:** se mantiene una sola historia HT-AUTH-03 con un único PR, como pidió el desarrollador.

## 13. Checklist de spec lista (`status: ready`)
- [x] Objetivo, alcance y fuera de alcance claros.
- [x] Reglas de negocio numeradas (RN-NN).
- [x] Criterios de aceptación verificables (CA-NN).
- [x] Sin OPEN QUESTIONS que cambien el comportamiento observable (o resueltas con el responsable funcional y registradas en §14).
- [x] Todo requisito respaldado por `docs/requisitos/` o una decisión registrada.

## 14. Registro de cambios y aclaraciones
| Fecha | Cambio / aclaración | Fuente o persona consultada |
|---|---|---|
| 2026-11-11 | Creación con `/sdd-spec`. **Requisitos aportados por JhonDc el 2026-11-11**: (1) panel de usuarios para aprobar cuentas de PENDIENTE_APROBACION a ACTIVA; (2) menú lateral para la navegación principal; (3) CRUD de clave de respuestas: selección de nombre de la prueba, fecha, sesión y materia (MAT, CN, CC, LC, ING), grilla dinámica según la cantidad de preguntas por materia, respuestas limitadas a A, B, C y D, guardar la clave y que sea editable, con estados Borrador y Publicada; (4) casilla «Verificada» vinculada a la resolución manual para confirmar marcas dudosas del OMR. Se pidió incluir criterios de aceptación, modelos MongoDB y endpoints NestJS. Pendiente: guardar estos requisitos en `docs/requisitos/historias/HT-AUTH-03.md`. | Requisitos aportados por JhonDc |
| 2026-11-11 | **Resolución de las OPEN QUESTIONS y aprobación.** El responsable aprobó la spec y delegó la resolución de §12 aceptando las propuestas: catálogos mínimos de instituciones (siembra) y pruebas; Sesión 1 y Sesión 2; 1 a 100 preguntas; clave Publicada de solo consulta (corrección en HU-EVAL-002); permisos ADMIN/COORDINADOR completos y DOCENTE de consulta; COORDINADOR no aprueba cuentas; RN-03, RN-10, RN-12 y RN-14 confirmadas; revisión manual por ADMIN/COORDINADOR, BLANK válido y endpoint de verificación trasladado a OMR-002; historia única. RN-01, RN-08, RN-11, §3, §4, §8, §9, CA-06, CA-07 y CA-13 actualizados con esos valores. Ningún ID cambia de número. Estado draft → ready. | Decisión de JhonDc (2026-11-11) |
