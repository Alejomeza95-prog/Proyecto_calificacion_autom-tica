---
id: HT-AUTH-01
title: Registro, verificación, acceso y recuperación de cuenta (RBAC)
status: draft            # draft | ready | in-progress | in-review | done
owner: JulianD27-ia
branch: feature/HT-AUTH-01
updated: 2026-11-02
---

# HT-AUTH-01 — Registro, verificación, acceso y recuperación de cuenta (RBAC)

> **spec.md describe QUÉ se construye y POR QUÉ.** El CÓMO (colecciones, índices, endpoints, contratos y pruebas) va en `plan.md`.
> Fuente: requisitos aportados por JulianD27-ia (2026-10-22, reiterados el 2026-11-02). Ver §14. No inventar requisitos ni criterios.
> Generado por `/sdd-spec` junto con `plan.md` y `tasks.md`, en estado `draft`. Solo el desarrollador responsable cambia el estado a `ready`, tras revisar el checklist §13.

## 1. Objetivo
Como persona que necesita acceder a OMR-PreICFES, quiero crear una cuenta, verificar mi correo, iniciar y cerrar sesión y recuperar mi contraseña, para utilizar de forma segura las funciones que tengo autorizadas (HU-AUTH-001).

Objetivo técnico: implementar el ciclo de vida de la cuenta **antes** de exponer información académica. Incluye creación de cuenta, contraseña, verificación de correo, inicio y cierre de sesión, recuperación de contraseña y autorización RBAC.

## 2. Contexto y fuentes
- **Historia de negocio relacionada:** HU-AUTH-001.
- **Tipo:** historia técnica. Habilita toda historia que exponga datos académicos o requiera roles (p. ej. HU-EVAL-001, que usa DOCENTE y ADMIN).
- **Fuente:** [`docs/requisitos/historias/HT-AUTH-01.md`](../../docs/requisitos/historias/HT-AUTH-01.md): objetivo técnico, CA-AUTH-01..12, tareas de backend y frontend, modelo propuesto, contratos, DoD, seguridad, dependencias y decisiones pendientes. Ver §14.
- **Historia separada de HT-CORE-01 (2026-11-02):** entre el 2026-10-22 y el 2026-11-02 este contenido fue el Bloque B de HT-CORE-01. El responsable decidió separarlo de nuevo. Los IDs vuelven a la numeración original de HT-AUTH-01 (ver la tabla de equivalencias en §14). HT-CORE-01 conserva el Bloque A (base técnica, entorno local y esqueletos de `apps/backend` y `apps/frontend`).
- **Relación con decisiones transversales:** materializa DT-04 (Autenticación y RBAC), hoy pendiente. La arquitectura canónica indica «JWT/OIDC, RBAC, logs sin datos personales innecesarios». La estrategia de sesión, el proveedor de correo y la integración deben alinearse con ella sin presuponer un framework no confirmado.
- **Mapeo de IDs:** los criterios aportados como `CA-AUTH-NN` se registran como `CA-NN` con el mismo número (CA-01 = CA-AUTH-01 … CA-12 = CA-AUTH-12), por compatibilidad con `scripts/sdd-validate.ps1`.
- **Situación del repositorio (verificada el 2026-11-02 contra GitHub):**
  - El PR #1 (`feature/HT-CORE-01` → `develop`) se fusionó el 2026-10-29 (commit de merge `baf777d`). `develop` ya contiene `apps/backend` (NestJS, prefijo `api/v1`, health check) y `apps/frontend` (React + Vite), sin código de negocio.
  - En `develop`, HT-CORE-01 sigue con `status: in-progress` y todavía incluye el Bloque B (este contenido) y sus tareas T-13..T-45. La separación de HT-AUTH-01 aún no está en `develop`: existe solo como cambios sin confirmar en la copia local.
  - No hay colección de usuarios, de instituciones ni roles definidos. HU-EVAL-001 usa los roles DOCENTE y ADMIN; estos requisitos mencionan Admin y Coordinador.
- **Rama base:** `feature/HT-AUTH-01` se crea desde `develop` actualizado (que incluya `baf777d`). La copia local de `develop` está desactualizada (`7156f5f`): primero hay que traer `origin/develop`.

## 3. Alcance
### Incluye
- Registro propio con nombre, correo y contraseña.
- Verificación de correo mediante enlace o código de un solo uso, y reenvío de la verificación.
- Inicio y cierre de sesión.
- Consulta de la identidad de la sesión actual.
- «Olvidé mi contraseña» y creación de una nueva contraseña.
- Estados de cuenta y control de acceso a rutas privadas según rol, institución y alcance del recurso (RBAC en backend).
- Correos de verificación, reenvío, restablecimiento y aviso de cambio de contraseña.
- Limitación de intentos, respuestas genéricas y auditoría de eventos de seguridad.
- Pantallas: Registro, Revisa tu correo, Verificar correo, Reenviar verificación, Login, Olvidé mi contraseña y Crear nueva contraseña, más la protección de la navegación privada.
- Documentación del proveedor de correo, plantillas, variables de entorno, roles y estados (DoD aportado).
- Inicialización segura del primer administrador mediante una operación del servidor, sin ruta pública (§6.5).
- Catálogo mínimo de roles y su alcance por institución (§8), aplicado por el backend.

### Fuera de alcance
- Pantallas y operaciones administrativas para aprobar cuentas o asignar institución y rol (ver OPEN QUESTIONS). En las pruebas se usan datos sembrados. Esta historia sí define **quién** aprueba (§8).
- Crear, editar o listar instituciones (DT-09). Esta historia solo usa el identificador de institución para el alcance.
- Creación y envío de invitaciones. Esta historia solo garantiza que, si una invitación validada existe, el rol y la institución provienen del servidor.
- Inicio de sesión con proveedores externos (OIDC/SSO), segundo factor y cambio de contraseña desde el perfil con sesión iniciada.
- Gestión de instituciones.
- Identidad visual del sistema: paleta, tipografía, tokens de diseño, DESIGN.md y componentes con estilo propio (HU-UX-001). Esta historia define la estructura, los estados, los textos y la accesibilidad de las pantallas de cuenta (§6.4), no su estilo.

### Supuestos
- HT-CORE-01 (fusionada en `develop`) deja disponibles MongoDB y Redis en local y los esqueletos `apps/backend` y `apps/frontend`.
- Existe un medio de prueba de correo que no entrega mensajes reales (pendiente de decisión).
- Quien ejecuta la inicialización del primer administrador tiene acceso operativo al servidor (consola del contenedor o del host) y no a una interfaz pública.

## 4. Dependencias funcionales
- **HT-CORE-01:** fusionada en `develop` el 2026-10-29 (PR #1). Aporta la base local y los esqueletos. **Pendiente:** llevar a `develop` la separación del Bloque B (los cambios de `specs/HT-CORE-01/` y `docs/` del 2026-11-02, hoy sin confirmar), para que no queden dos especificaciones vigentes de lo mismo. Sus tareas T-12 y T-46 siguen abiertas, pero no bloquean esta historia.
- Acceso a la arquitectura de usuarios y al repositorio.
- Aprobación del catálogo mínimo de roles (§8) y de quién aprueba cuentas (OPEN QUESTIONS).
- **Modelo institucional (DT-09):** esta historia solo necesita un identificador de institución estable para el alcance de los roles institucionales. La colección de instituciones, su ciclo de vida y su validación son de DT-09 y son prerrequisito de la historia que apruebe cuentas o envíe invitaciones, no de esta (§8, plan §10).
- Proveedor de correo institucional o servicio SMTP/API, dominios permitidos para los enlaces y ambiente de pruebas.

## 5. Reglas de negocio e invariantes
- **RN-01:** una cuenta tiene uno de estos estados: PENDIENTE_VERIFICACION, PENDIENTE_APROBACION, ACTIVA, BLOQUEADA o DESACTIVADA. El registro propio crea la cuenta en PENDIENTE_VERIFICACION. Al verificar el correo, una cuenta de registro propio pasa a PENDIENTE_APROBACION hasta que un administrador asigne institución y rol.
- **RN-02:** el rol y la institución nunca se toman del cliente. Solo los define una invitación validada o un administrador autorizado. El registro propio crea cuentas sin permisos institucionales.
- **RN-03:** el correo se normaliza antes de guardarlo y compararlo, y el correo normalizado es único: una solicitud repetida no crea cuentas duplicadas.
- **RN-04:** las respuestas públicas de registro, reenvío de verificación, «olvidé mi contraseña» e inicio de sesión no permiten saber si una cuenta existe ni en qué estado está.
- **RN-05:** la contraseña se guarda solo como hash adaptativo seguro. Nunca aparece en texto plano en la base de datos, los logs, las respuestas de la API ni las herramientas de analítica.
- **RN-06:** los tokens de verificación y de restablecimiento son aleatorios, de alta entropía y de un solo uso, y tienen un propósito y una expiración. Solo se guarda su hash y el token crudo solo viaja por correo. Un token nuevo invalida los anteriores del mismo propósito y usuario. La expiración se comprueba siempre al validar.
- **RN-07:** solo una cuenta con el correo verificado, en estado ACTIVA y no bloqueada puede iniciar sesión y consultar datos protegidos.
- **RN-08:** al restablecer la contraseña se consume el token, se revocan todas las sesiones existentes de la cuenta y se avisa por correo del cambio.
- **RN-09:** los intentos de registro, inicio de sesión, verificación, reenvío y recuperación se limitan por cuenta, IP y ventana de tiempo.
- **RN-10:** las rutas privadas validan en el backend la autenticación y el permiso según rol, institución y alcance del recurso. Ocultar opciones en la interfaz no sustituye esa validación.
- **RN-11:** cerrar sesión revoca o invalida la sesión según la estrategia aprobada.
- **RN-12:** los eventos de seguridad se auditan sin guardar contraseñas, tokens crudos ni datos personales innecesarios.
- **RN-13:** los enlaces de los correos se construyen solo a partir de un dominio permitido configurado. Nunca se toman de la solicitud, para evitar redirecciones abiertas.
- **RN-14:** ninguna ruta pública crea ni eleva una cuenta a administrador. El primer administrador solo se crea mediante una operación del servidor ejecutada por quien opera el despliegue. Esa operación no recibe la contraseña, solo funciona si no existe ningún administrador ACTIVO, crea a lo sumo una cuenta de inicialización y queda auditada. Los administradores siguientes los asigna un administrador existente (fuera de alcance).
- **RN-15:** toda cuenta ACTIVA tiene un rol del catálogo (§8). Los roles institucionales (COORDINADOR, DOCENTE) exigen una institución; el administrador no está ligado a una institución. El alcance de una cuenta se toma siempre de los datos del servidor, nunca de lo que envía el cliente ni de copias que hayan quedado desactualizadas.
- **RN-16:** cuando cambian las credenciales de una cuenta (restablecimiento de contraseña) o la cuenta deja de estar ACTIVA, ninguna credencial de sesión emitida antes sirve para acceder **ni para renovar** la sesión.

## 6. Flujo funcional
### 6.1 Registro y verificación
1. La persona abre **Registro**, ingresa nombre, correo y contraseña, y envía el formulario.
2. El sistema valida los datos y responde siempre con el mismo mensaje: «Si el correo puede registrarse, te enviamos un enlace de verificación». Muestra **Revisa tu correo** (RN-04).
3. Si el correo no estaba registrado, se crea la cuenta en PENDIENTE_VERIFICACION y se envía el enlace (RN-01, RN-06).
4. La persona abre el enlace: **Verificar correo** consume el token. Una cuenta de registro propio queda en PENDIENTE_APROBACION y ve un mensaje que explica que un administrador debe habilitarla.
5. Si el enlace venció o ya se usó, ve un mensaje claro y la opción **Reenviar verificación** (RN-06).

### 6.2 Inicio y cierre de sesión
1. **Login** pide correo y contraseña. Solo una cuenta verificada, ACTIVA y no bloqueada entra (RN-07). Cualquier otro caso recibe el mismo error genérico.
2. Con la sesión iniciada, la aplicación consulta la identidad de la sesión para decidir la navegación privada. Las rutas privadas sin sesión válida llevan a Login.
3. **Cerrar sesión** invalida la sesión y limpia el estado del cliente (RN-11).

### 6.3 Recuperación de contraseña
1. **Olvidé mi contraseña** pide el correo y siempre muestra el mismo mensaje genérico (RN-04).
2. Si la cuenta es elegible, recibe un enlace de restablecimiento de un solo uso.
3. **Crear nueva contraseña** valida el token y la nueva contraseña. Al guardar, revoca todas las sesiones, envía el aviso de cambio y permite iniciar sesión con la nueva contraseña (RN-08).
4. Si el enlace venció o ya se usó, ve un mensaje claro y la opción de pedir uno nuevo.

### 6.4 Experiencia de las pantallas (brief de la guía `impeccable`: shape, harden y clarify)
Brief en modo **Operate** (la persona completa una tarea). **No fija dirección visual:** paleta, tipografía, tokens, DESIGN.md y estilo de componentes son de HU-UX-001. En esta historia las pantallas usan HTML semántico y los estilos mínimos del esqueleto, de modo que HU-UX-001 pueda aplicar su identidad sin cambiar estructura ni comportamiento (tarea T-22). No agrega comportamiento de negocio.

- **Trabajo y público:** docentes y administradores de una academia PreICFES (PRODUCT.md) que entran desde el escritorio de la oficina o desde el celular, a menudo justo antes de procesar un lote. Quieren entrar rápido y sin dudas; no exploran.
- **Resultado:** cada pantalla tiene una sola acción principal y, tras enviarla, dice qué pasó y qué sigue. El éxito es llegar a la sesión, o saber exactamente qué esperar (correo, aprobación de un administrador), sin contactar a soporte.
- **Mensajes genéricos pero accionables:** la seguridad exige no revelar si la cuenta existe (RN-04), pero cada mensaje dice qué hacer después. Por ejemplo: «Revisa tu bandeja de entrada y spam. Si no llega en unos minutos, puedes pedir otro enlace».
- **Errores de validación en línea**, junto al campo, asociados al campo para lectores de pantalla, y **conservando lo escrito** (salvo la contraseña tras un envío fallido).
- **Contraseña:** permitir pegar y el autocompletado de gestores, mostrar u ocultar la contraseña, y publicar la política junto al campo antes del primer error (RNF-02).
- **Estados explícitos** en cada pantalla: en reposo, enviando (botón deshabilitado con indicador y sin doble envío), éxito, error de validación, enlace vencido o usado, demasiados intentos (429, con indicación de cuándo reintentar) y error de red (con opción de reintentar).
- **Accesibilidad:** los cambios de estado se anuncian, el foco se mueve al mensaje de resultado o al primer campo con error, todo funciona con teclado, el texto es legible al 200 % de zoom y ningún estado depende solo del color (RNF-05; PRODUCT.md, accesibilidad).
- **Responsivo:** las 7 pantallas funcionan en escritorio y en móvil (PRODUCT.md, contexto de operación).
- **Idioma:** español (Colombia), con un mismo término por concepto («correo», «enlace», «contraseña»).
- **Sin selección de rol ni institución** en el formulario público (RN-02).
- **Anti-objetivos:** mensajes que confirmen o nieguen la existencia de una cuenta; reglas de composición de contraseña no exigidas por la política; bloquear el pegado; textos técnicos («token», códigos HTTP) visibles para la persona.

| Pantalla | Acción principal | Estados propios además de los comunes |
|---|---|---|
| Registro | Crear cuenta | — |
| Revisa tu correo | Pedir otro enlace (secundaria: volver a Login) | Reenvío limitado (429) |
| Verificar correo | (automática al abrir el enlace) | Verificado y pendiente de aprobación; enlace vencido o usado |
| Reenviar verificación | Enviar enlace | — |
| Login | Iniciar sesión | Error genérico de credenciales |
| Olvidé mi contraseña | Enviar enlace de restablecimiento | — |
| Crear nueva contraseña | Guardar contraseña | Enlace vencido o usado; contraseña guardada (ir a Login). También se usa para activar la cuenta del primer administrador (§6.5) |

### 6.5 Inicialización del primer administrador
1. Quien opera el despliegue ejecuta en el servidor la operación de inicialización con el nombre y el correo del administrador. No hay pantalla ni ruta pública para esto (RN-14).
2. Si ya existe un administrador ACTIVO, la operación se niega y no cambia nada. Si existe una cuenta de inicialización pendiente de activar con otro correo, también se niega.
3. Si no existe, se crea la cuenta con rol ADMIN asignado por el servidor, sin contraseña utilizable, y se envía al correo un enlace de activación de un solo uso.
4. El administrador abre el enlace y, en **Crear nueva contraseña**, define su contraseña. Con eso queda verificado su correo y la cuenta pasa a ACTIVA.
5. Si el enlace vence, quien opera vuelve a ejecutar la operación con el mismo correo: no se crea otra cuenta, se emite un enlace nuevo y el anterior deja de servir.
6. Desde entonces, ese administrador aprueba las cuentas pendientes y asigna institución y rol (operación de una historia posterior).

## 7. Estados y situaciones de negocio
| Estado / situación | Significado | Qué ve o puede hacer el usuario |
|---|---|---|
| PENDIENTE_VERIFICACION | Cuenta creada sin correo verificado | No puede iniciar sesión. Puede verificar o pedir otro enlace. |
| PENDIENTE_APROBACION | Correo verificado, sin institución ni rol asignados | No puede iniciar sesión. Ve que un administrador debe habilitar su cuenta. |
| ACTIVA | Verificada y con rol asignado | Inicia sesión y usa las funciones de su rol, dentro del alcance de su institución. |
| BLOQUEADA | Bloqueada por un administrador o por la política de seguridad | No puede iniciar sesión y recibe el error genérico. |
| DESACTIVADA | Dada de baja | No puede iniciar sesión y recibe el error genérico. |
| Enlace vencido o usado | El token ya no sirve | Mensaje claro y opción de pedir uno nuevo, sin datos de la cuenta. |
| Límite de intentos | Demasiados intentos en la ventana | Mensaje de espera, sin revelar la existencia de la cuenta. |

## 8. Roles y permisos (nivel negocio)
| Rol | Puede |
|---|---|
| Visitante (sin sesión) | Registrarse, verificar el correo, pedir reenvío, iniciar sesión, pedir y completar la recuperación. |
| Usuario autenticado (cualquier rol ACTIVO) | Consultar su propia identidad de sesión y cerrar sesión. |
| Operador del despliegue (no es un rol de la aplicación) | Inicializar el primer administrador desde el servidor (§6.5, RN-14). |
| Administrador | Aprobar cuentas y asignar institución y rol (operación fuera de alcance; ver §12). |
| Roles institucionales (p. ej. Coordinador, Docente) | Lo que defina el catálogo de permisos, siempre dentro de su institución (catálogo pendiente). |

### 8.1 Catálogo mínimo de roles (propuesta; requiere aprobación, ver §12)
Fuentes: los requisitos aportados (Admin, Coordinador), HU-EVAL-001 y PRODUCT.md (DOCENTE, ADMIN; anular cargas solo ADMIN). Esta historia solo hace cumplir el rol, la institución y el estado; los permisos de negocio de cada rol los definen las historias que los usan.

| Rol | Alcance | Institución | Lo que esta historia le permite | Permisos previstos fuera de esta historia | Estado |
|---|---|---|---|---|---|
| ADMIN | Toda la plataforma | No tiene | `GET /auth/me`, logout; **aprobar cuentas y asignar institución y rol** (la operación es de una historia posterior) | Gestionar exámenes, formas y claves; anular cargas (PRODUCT.md, HU-EVAL-001) | Rol confirmado por las fuentes; alcance global **pendiente de aprobación** |
| COORDINADOR | Su institución | Obligatoria | `GET /auth/me`, logout | Sin fuente: **pendiente** | **Pendiente:** confirmar que existe y qué puede hacer (incluido si aprueba docentes de su institución) |
| DOCENTE | Su institución | Obligatoria | `GET /auth/me`, logout | Cargar hojas, resolver inconsistencias y ver resultados (PRODUCT.md, HU-EVAL-001) | Rol confirmado por las fuentes |

- **Quién aprueba cuentas:** un ADMIN ACTIVO aprueba las cuentas en PENDIENTE_APROBACION y les asigna institución y rol (requisito aportado: «hasta que un administrador asigne institución/rol»). El primer ADMIN se obtiene por §6.5. Si un COORDINADOR también puede aprobar dentro de su institución queda pendiente.
- **Relación con el modelo institucional (DT-09):** un recurso institucional solo es accesible para cuentas ACTIVAS de la misma institución, salvo el ADMIN de alcance global. Esta historia compara identificadores de institución y no valida que la institución exista: eso llega con DT-09 y con la historia de aprobación.

Ningún usuario puede asignarse Admin o Coordinador, ni acceder a datos de otra institución, modificando el cliente o llamando directamente a la API (DoD aportado).

## 9. Datos de negocio involucrados
- **Cuenta:** nombre (**personal**), correo (**personal**), estado, rol, institución, fecha de verificación del correo, fechas de creación, actualización, último acceso y último cambio de credenciales.
- **Credencial:** solo el hash de la contraseña (secreto).
- **Token de seguridad:** propósito (VERIFICAR_CORREO, RESTABLECER_PASSWORD o ACTIVAR_CUENTA para el primer administrador), hash del token, expiración y uso (secreto; nunca crudo, ni siquiera en colas o trabajos pendientes).
- **Sesión:** identificador revocable y vigencia (depende de la estrategia aprobada).
- **Evento de auditoría:** tipo de evento, cuenta (por identificador), fecha, resultado y origen técnico mínimo (sin contraseñas, tokens ni datos personales innecesarios).

## 10. Criterios de aceptación
### CA-01 — Registro crea cuenta pendiente sin privilegios (CA-AUTH-01)
**Dado** el formulario de registro con nombre, correo y contraseña válidos
**Cuando** la persona lo envía, aunque incluya en la solicitud campos de rol o institución
**Entonces** el backend valida los datos, normaliza el correo y crea la cuenta en PENDIENTE_VERIFICACION sin rol privilegiado ni institución.

### CA-02 — Correo único y sin enumeración (CA-AUTH-02)
**Dado** un correo ya registrado (incluso con distintas mayúsculas o espacios)
**Cuando** se repite el registro, incluso en solicitudes simultáneas
**Entonces** no se crea una cuenta duplicada y la respuesta pública es idéntica a la de un correo nuevo.

### CA-03 — Política y hash de contraseña (CA-AUTH-03)
**Dado** una contraseña que cumple la política publicada
**Cuando** se registra o se restablece
**Entonces** se guarda solo como hash adaptativo seguro (Argon2id o equivalente aprobado), y la contraseña en texto plano no aparece en la base de datos, los logs ni las respuestas.
**Y dado** una contraseña que no cumple la política, **entonces** se rechaza con un mensaje que indica la política.

### CA-04 — Verificación de un solo uso con expiración (CA-AUTH-04)
**Dado** una cuenta recién registrada
**Cuando** el sistema envía la verificación
**Entonces** el enlace o código contiene un token aleatorio de alta entropía, solo se guarda su hash y vence según la configuración (valor inicial propuesto: 24 horas).
**Y** un token vencido o ya usado es rechazado.

### CA-05 — Acceso solo para cuentas habilitadas (CA-AUTH-05)
**Dado** una cuenta con el correo sin verificar o en un estado distinto de ACTIVA
**Cuando** intenta iniciar sesión o consultar datos protegidos
**Entonces** se le niega el acceso.
**Y dado** una cuenta de registro propio que verifica su correo, **entonces** pasa a PENDIENTE_APROBACION hasta que un administrador asigne institución y rol.
**Y dado** un registro con una invitación autorizada, **entonces** el rol y la institución se toman de la invitación en el servidor.

### CA-06 — Reenvío de verificación limitado y sin enumeración (CA-AUTH-06)
**Dado** una persona que pide un nuevo correo de verificación
**Cuando** lo solicita
**Entonces** se invalida el token anterior y se envía uno nuevo si corresponde. La respuesta es la misma exista o no la cuenta, y se aplica un límite de frecuencia.

### CA-07 — Inicio de sesión con errores genéricos (CA-AUTH-07)
**Dado** un correo y una contraseña
**Cuando** se intenta iniciar sesión
**Entonces** solo se acepta si las credenciales son válidas y la cuenta está verificada, ACTIVA y no bloqueada. Los casos de correo inexistente, contraseña incorrecta o cuenta no habilitada reciben la misma respuesta genérica.

### CA-08 — Solicitud de recuperación genérica (CA-AUTH-08)
**Dado** cualquier correo
**Cuando** se usa «Olvidé mi contraseña»
**Entonces** la respuesta es siempre el mismo mensaje genérico. Si la cuenta es elegible, se envía un enlace de restablecimiento de un solo uso (valor inicial propuesto: 30 minutos), con el token guardado como hash y sin aparecer en los logs.

### CA-09 — Restablecimiento revoca sesiones (CA-AUTH-09)
**Dado** un token de restablecimiento válido, vigente y no usado
**Cuando** se crea una nueva contraseña
**Entonces** el token se consume, se revocan las sesiones existentes de la cuenta y es posible iniciar sesión con la nueva contraseña (y no con la anterior).
**Y dado** un token inválido, vencido o usado, **entonces** el restablecimiento se rechaza.

### CA-10 — Tokens de un solo uso y límites de intentos (CA-AUTH-10)
**Dado** un token de verificación o recuperación
**Cuando** se intenta usar por segunda vez, o después de emitir otro del mismo propósito
**Entonces** se rechaza.
**Y** los intentos se limitan por cuenta, IP y ventana de tiempo, y el exceso recibe una respuesta de límite excedido.

### CA-11 — Autorización en backend (CA-AUTH-11)
**Dado** un usuario autenticado
**Cuando** llama directamente a una ruta privada para la que su rol, su institución o el alcance del recurso no lo autorizan
**Entonces** el backend deniega el acceso, aunque la interfaz no muestre esa opción. Sin sesión válida, la respuesta es de no autenticado.

### CA-12 — Cierre de sesión y auditoría (CA-AUTH-12)
**Dado** una sesión activa
**Cuando** el usuario cierra sesión
**Entonces** la sesión o el token queda invalidado y ya no sirve para rutas privadas.
**Y** los eventos de registro, verificación, inicio y cierre de sesión, recuperación y restablecimiento se auditan sin contraseñas, tokens crudos ni datos personales innecesarios.

### CA-13 — Inicialización segura del primer administrador
**Dado** un sistema sin ningún administrador ACTIVO ni cuenta de inicialización
**Cuando** quien opera el despliegue ejecuta la operación de inicialización con un nombre y un correo
**Entonces** se crea una única cuenta con rol ADMIN asignado por el servidor, que no puede iniciar sesión hasta definir su contraseña con el enlace de activación de un solo uso. Al hacerlo, la cuenta queda verificada y ACTIVA, y el evento queda auditado.
**Y dado** que ya existe un administrador ACTIVO, o una cuenta de inicialización pendiente con otro correo, **entonces** la operación se niega sin cambios. Con la misma cuenta pendiente y el mismo correo, se emite un enlace nuevo y el anterior deja de servir.
**Y** ninguna solicitud a la API pública (registro, verificación, restablecimiento ni ninguna otra) crea una cuenta ADMIN ni cambia el rol de una cuenta.

## 11. Requisitos no funcionales
- **RNF-01:** hash adaptativo aprobado: Argon2id o un equivalente aprobado.
- **RNF-02:** política de contraseña propuesta: mínimo 12 caracteres, con soporte para frases de contraseña y gestores. Se permite pegar. No se imponen reglas arbitrarias de composición salvo que lo exija la política institucional.
- **RNF-03:** HTTPS en todos los despliegues.
- **RNF-04:** los vencimientos son configurables (valores iniciales propuestos: verificación 24 h y recuperación 30 min), así como los límites por IP y por cuenta.
- **RNF-05:** las pantallas de cuenta tienen estados de carga y error accesibles (anuncio de cambios, gestión del foco y uso con teclado).
- **RNF-06:** si se eligen cookies, hay protección contra CSRF; si se eligen tokens, su almacenamiento, expiración y revocación son seguros y están documentados.

## 12. OPEN QUESTIONS
- [ ] ¿El registro propio estará habilitado para todos o solo mediante invitación? Propuesta aportada: permitir la solicitud propia pendiente de aprobación y mantener la invitación para roles institucionales.
- [ ] Aprobar el catálogo mínimo de §8.1: ¿existe el rol COORDINADOR y qué puede hacer? ¿El ADMIN tiene alcance global o está ligado a una institución? ¿Un COORDINADOR puede aprobar cuentas de su institución? ¿En qué historia se construyen la aprobación y las invitaciones? (Propuesta registrada: aprueba un ADMIN ACTIVO; aprobación e invitaciones en una historia posterior.)
- [ ] Aprobar el mecanismo de §6.5 para el primer administrador: operación del servidor con enlace de activación por correo (propuesta) o definición de la contraseña en una consola interactiva (alternativa, ver plan DEC-08).
- [ ] DT-09: ¿qué historia crea la colección de instituciones? ¿Una cuenta puede pertenecer a más de una institución? (Esta historia supone una sola.)
- [ ] Cuando un administrador cambie el rol o la institución de una cuenta (historia posterior), ¿deben revocarse sus sesiones de inmediato? (Propuesta: sí, como en RN-16.)
- [ ] ¿Qué proveedor de correo se usará y cómo se probará el envío local sin distribuir mensajes reales?
- [ ] ¿Cookie de sesión segura o token? Documentar la expiración, CSRF, renovación y revocación (ver plan DEC-01).
- [ ] Confirmar los vencimientos iniciales (verificación 24 h, recuperación 30 min) y los límites concretos por IP y cuenta.
- [ ] ¿Cuándo pasa una cuenta a BLOQUEADA (por ejemplo, por intentos fallidos) y cómo se desbloquea?
- [ ] ¿«Olvidé mi contraseña» aplica a cuentas en PENDIENTE_APROBACION? ¿Qué cuentas son «elegibles»?
- [ ] ¿Cuánto tiempo se conservan los eventos de auditoría?
- [ ] ¿La verificación será por enlace, por código o por ambos?

## 13. Checklist de spec lista (`status: ready`)
- [ ] Objetivo, alcance y fuera de alcance claros.
- [ ] Reglas de negocio numeradas (RN-NN).
- [ ] Criterios de aceptación verificables (CA-NN).
- [ ] Sin OPEN QUESTIONS que cambien el comportamiento observable (o resueltas con el responsable funcional y registradas en §14).
- [ ] Todo requisito respaldado por `docs/requisitos/` o una decisión registrada.

## 14. Registro de cambios y aclaraciones
Mantener los IDs `RN`/`CA`/`RNF` estables: no renumerar. Un criterio retirado se marca `~~CA-NN~~ (retirado: motivo)`.

Equivalencia con el Bloque B de HT-CORE-01 (2026-10-22 a 2026-11-02): CA-NN = CA-(NN+8) de HT-CORE-01; RN-NN = RN-(NN+6); RNF-NN = RNF-(NN+1); T-NN = T-(NN+12); DEC-NN = DEC-(NN+4). La tarea de release T-34 sustituye a la parte de cuentas de T-46 de HT-CORE-01.

| Fecha | Cambio / aclaración | Fuente o persona consultada |
|---|---|---|
| 2026-10-22 | Creación con `/sdd-spec` como HT-AUTH-01. CA-01..CA-12 transcriben CA-AUTH-01..12. Las RN provienen de los criterios, las tareas de backend y la sección de seguridad aportadas. RNF-01..03 y RNF-06 provienen de la sección de seguridad; RNF-05 de las tareas de frontend. | Requisitos aportados por JulianD27-ia, 2026-10-22 |
| 2026-10-22 | Fusionada en HT-CORE-01 como Bloque B, con IDs renumerados. | JulianD27-ia |
| 2026-11-02 | Separada de nuevo de HT-CORE-01 como historia propia, a pedido del responsable. Se recupera la numeración original. El contenido se conserva sin cambios de comportamiento; el responsable reitera los mismos requisitos. Fuente movida a `docs/requisitos/historias/HT-AUTH-01.md`. | JulianD27-ia (sesión de Claude Code, 2026-11-02) |
| 2026-11-02 | §6.4 completada con un brief de la guía `impeccable` (shape: trabajo, resultado, anti-objetivos y tabla de pantallas; harden y clarify). Solo reformula los requisitos de experiencia aportados y PRODUCT.md; no agrega comportamiento de negocio. | Skill `impeccable` + PRODUCT.md |
| 2026-11-02 | Se agrega a §3 la documentación de proveedor, plantillas, variables, roles y estados, y a §8 la garantía de no autoasignación de roles, ambas tomadas del DoD aportado. | Requisitos aportados (DoD) |
| 2026-11-02 | **Revisión técnica pedida por el responsable** (9 observaciones). §2 y §4: HT-CORE-01 fusionada en `develop` (PR #1, `baf777d`, 2026-10-29) y rama base desde `develop` actualizado; la separación del Bloque B aún no está en `develop`. Nuevas: §6.5 y CA-13 (primer administrador), RN-14 (sin elevación pública a ADMIN), RN-15 (catálogo y alcance por institución), RN-16 (las credenciales anteriores no sirven ni para renovar), §8.1 (catálogo mínimo y quién aprueba; alcance global del ADMIN y rol COORDINADOR pendientes), relación con DT-09 en §4 y §8.1, y propósito de token ACTIVAR_CUENTA en §9. §3 y §6.4: la identidad visual queda fuera (HU-UX-001). Se agregan OPEN QUESTIONS. Ningún CA, RN ni RNF existente cambia de número ni de significado. | JulianD27-ia (revisión técnica, 2026-11-02) |
