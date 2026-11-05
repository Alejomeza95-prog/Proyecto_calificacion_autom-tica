---
id: HT-AUTH-01
title: Registro, verificación, acceso y recuperación de cuenta (RBAC)
status: in-progress      # draft | ready | in-progress | in-review | done
owner: JulianD27-ia
branch: feature/HT-AUTH-01-impl   # feature/HT-AUTH-01 se fusionó con el PR #3 (documental)
updated: 2026-11-04
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
  - En `develop`, HT-CORE-01 sigue con `status: in-progress` y todavía incluye el Bloque B (este contenido) y sus tareas T-13..T-45. La separación de HT-AUTH-01 aún no está en `develop`: está confirmada en el commit `0bcdae7` y publicada en `origin/feature/HT-AUTH-01`; su integración en `develop` queda pendiente hasta completar el Pull Request de esta rama (T-37).
  - No hay colección de usuarios, de instituciones ni roles definidos. HU-EVAL-001 usa los roles DOCENTE y ADMIN; estos requisitos mencionan Admin y Coordinador.
- **Rama base:** `feature/HT-AUTH-01` se crea desde `develop` actualizado (que incluya `baf777d`). La copia local de `develop` está desactualizada (`7156f5f`): primero hay que traer `origin/develop`.

## 3. Alcance
### Incluye
- Registro propio con nombre, correo y contraseña.
- Verificación de correo **exclusivamente mediante enlace** de un solo uso enviado por correo, y reenvío de la verificación (DEC-18).
- Inicio y cierre de sesión.
- Consulta de la identidad de la sesión actual.
- «Olvidé mi contraseña» y creación de una nueva contraseña.
- Estados de cuenta y control de acceso a rutas privadas según rol, institución y alcance del recurso (RBAC en backend).
- Correos de verificación, reenvío, restablecimiento y aviso de cambio de contraseña.
- Limitación de intentos, respuestas genéricas y auditoría de eventos de seguridad.
- ~~Pantallas: Registro, Revisa tu correo, Verificar correo, Reenviar verificación, Login, Olvidé mi contraseña y Crear nueva contraseña, más la protección de la navegación privada.~~ (trasladado a la historia posterior de frontend (ID por asignar; DEC-23, aprobada el 2026-11-05))
- API de autenticación y sus contratos (`/api/v1/auth`, errores `application/problem+json`), que la historia de frontend consumirá.
- Documentación del proveedor de correo, plantillas, variables de entorno, roles y estados (DoD aportado).
- Inicialización segura del primer administrador mediante una operación del servidor, sin ruta pública (§6.5).
- Catálogo mínimo de roles y su alcance por institución (§8), aplicado por el backend.

### Fuera de alcance
- Pantallas y operaciones administrativas para aprobar cuentas o asignar institución y rol (ver OPEN QUESTIONS). En las pruebas se usan datos sembrados. Esta historia sí define **quién** aprueba (§8).
- Crear, editar o listar instituciones (DT-09). Esta historia solo usa el identificador de institución para el alcance.
- Creación y envío de invitaciones. Esta historia solo garantiza que, si una invitación validada existe, el rol y la institución provienen del servidor.
- Inicio de sesión con proveedores externos (OIDC/SSO), segundo factor y cambio de contraseña desde el perfil con sesión iniciada.
- Códigos de verificación de correo (numéricos o alfanuméricos): la primera versión solo usa enlaces (DEC-18).
- Gestión de instituciones.
- **Frontend de la cuenta** (historia posterior de frontend (ID por asignar; DEC-23, aprobada el 2026-11-05)): las 7 pantallas y su brief (§6.4), la protección de la navegación privada, el cliente API y el estado de sesión en el navegador, la coordinación de renovaciones entre pestañas, el widget de CAPTCHA y las pruebas Playwright y de accesibilidad. Esta historia deja la API lista y documentada para esa historia.
- Identidad visual del sistema: paleta, tipografía, tokens de diseño, DESIGN.md y componentes con estilo propio (HU-UX-001). ~~Esta historia define la estructura, los estados, los textos y la accesibilidad de las pantallas de cuenta (§6.4), no su estilo.~~ La estructura, los estados, los textos y la accesibilidad de las pantallas de cuenta quedan en §6.4 como insumo de la historia posterior de frontend (ID por asignar) (DEC-23, aprobada el 2026-11-05); HT-AUTH-01 no las implementa.

### Supuestos
- HT-CORE-01 (fusionada en `develop`) deja disponibles MongoDB y Redis en local y los esqueletos `apps/backend` y `apps/frontend`.
- Existe un medio de prueba de correo que no entrega mensajes reales: Mailpit solo en desarrollo y pruebas (DEC-05, aprobada).
- Quien ejecuta la inicialización del primer administrador tiene acceso operativo al servidor (consola del contenedor o del host) y no a una interfaz pública.

## 4. Dependencias funcionales
- **HT-CORE-01:** fusionada en `develop` el 2026-10-29 (PR #1). Aporta la base local y los esqueletos. **Pendiente:** llevar a `develop` la separación del Bloque B (los cambios de `specs/HT-CORE-01/` y `docs/` del 2026-11-02, confirmada en el commit `0bcdae7` y publicada en `origin/feature/HT-AUTH-01`; su integración en `develop` queda pendiente hasta completar el Pull Request de esta rama (T-37)), para que no queden dos especificaciones vigentes de lo mismo. Sus tareas T-12 y T-46 siguen abiertas, pero no bloquean esta historia.
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
- **RN-06:** los tokens de verificación y de restablecimiento son aleatorios, de alta entropía y de un solo uso, y tienen un propósito y una expiración. Solo se guarda su hash y el token crudo solo viaja por correo. Un token nuevo invalida los anteriores del mismo propósito y usuario. La expiración se comprueba siempre al validar. Abrir un enlace no consume su token: el consumo ocurre solo cuando la persona confirma la acción, para que los escáneres automáticos de correo no invaliden enlaces (DEC-18).
- **RN-07:** solo una cuenta con el correo verificado, en estado ACTIVA y no bloqueada puede iniciar sesión y consultar datos protegidos.
- **RN-08:** al restablecer la contraseña se consume el token, se revocan todas las sesiones existentes de la cuenta y se avisa por correo del cambio.
- **RN-09:** los intentos de registro, inicio de sesión, verificación, reenvío, recuperación, restablecimiento y activación se limitan por cuenta (o correo, o enlace existente) y por IP, cada uno en su ventana de tiempo (valores iniciales en §6.6). Los límites son configurables. Al alcanzar un límite se informa que hay demasiados intentos y cuándo se puede reintentar, con la misma respuesta exista o no la cuenta. **En el inicio de sesión, el contador por cuenta no es un límite que rechace:** cuenta solo los intentos fallidos y, al llegar al umbral, activa una verificación adicional antes de comprobar la contraseña (DEC-16, aprobada; CA-16). Quien presenta las credenciales correctas de una cuenta habilitada puede entrar aunque el contador esté en el umbral. El límite que sí rechaza los intentos es el de la IP. Superar un límite o el umbral **nunca** bloquea la cuenta de forma permanente ni la pasa a BLOQUEADA: al terminar la ventana, el contador se borra solo. Los contadores no guardan correos, IP ni enlaces sin protección.
- **RN-10:** las rutas privadas validan en el backend la autenticación y el permiso según rol, institución y alcance del recurso. Ocultar opciones en la interfaz no sustituye esa validación.
- **RN-11:** cerrar sesión revoca o invalida la sesión según la estrategia aprobada.
- **RN-12:** los eventos de seguridad se auditan sin guardar contraseñas, tokens crudos ni datos personales innecesarios.
- **RN-13:** los enlaces de los correos se construyen solo a partir de un dominio permitido configurado. Nunca se toman de la solicitud, para evitar redirecciones abiertas.
- **RN-14:** ninguna ruta pública crea ni eleva una cuenta a administrador. El primer administrador solo se crea mediante una operación del servidor ejecutada por quien opera el despliegue. Esa operación no recibe la contraseña, solo funciona si no existe ningún administrador ACTIVO, crea a lo sumo una cuenta de inicialización y queda auditada. Los administradores siguientes los asigna un administrador existente (fuera de alcance).
- **RN-15:** toda cuenta ACTIVA tiene un rol del catálogo (§8). Los roles institucionales (COORDINADOR, DOCENTE) exigen una institución; el administrador no está ligado a una institución. El alcance de una cuenta se toma siempre de los datos del servidor, nunca de lo que envía el cliente ni de copias que hayan quedado desactualizadas.
- **RN-16:** cuando cambian las credenciales de una cuenta (restablecimiento de contraseña) o la cuenta deja de estar ACTIVA, ninguna credencial de sesión emitida antes sirve para acceder **ni para renovar** la sesión.
- **RN-17** *(decisión de negocio DEC-14, aprobada el 2026-11-03)*: en la primera versión una cuenta pertenece a una sola institución. El ADMIN tiene alcance global; COORDINADOR y DOCENTE, solo su institución. Una cuenta institucional solo ve recursos de su institución: un recurso de otra institución se trata como inexistente (no se revela que existe). Si el recurso está dentro de su alcance pero su rol no le permite la acción, se le informa que no tiene permiso. El aislamiento se aplica tanto en la lógica de los servicios como en las propias consultas a la base de datos, de modo que listados y búsquedas tampoco devuelven datos de otra institución.
- **RN-18** *(decisión de negocio DEC-11, aprobada el 2026-11-03)*: ninguna cuenta puede asignarse ni modificar su propio rol, tampoco un ADMIN. La asignación y el cambio de rol solo ocurren mediante operaciones autorizadas del backend; en esta historia ninguna ruta permite cambiar un rol, y el registro y la activación nunca lo toman de la solicitud.
- **RN-19** *(decisión del responsable, DEC-19, aprobada el 2026-11-03)*: la recuperación de contraseña por autoservicio solo está disponible para cuentas **ACTIVA** o **PENDIENTE_APROBACION**. Una cuenta PENDIENTE_VERIFICACION debe usar el reenvío de la verificación; una BLOQUEADA o DESACTIVADA requiere intervención administrativa. Si la cuenta deja de ser elegible después de emitir el enlace, el restablecimiento se rechaza como un enlace inválido. Restablecer la contraseña no cambia el estado, el rol ni la institución de la cuenta. En todos los casos la respuesta es genérica y no revela si la cuenta existe ni su estado (RN-04).

## 6. Flujo funcional
### 6.1 Registro y verificación
1. La persona abre **Registro**, ingresa nombre, correo y contraseña, y envía el formulario.
2. El sistema valida los datos y responde siempre con el mismo mensaje: «Si el correo puede registrarse, te enviamos un enlace de verificación». Muestra **Revisa tu correo** (RN-04).
3. Si el correo no estaba registrado, se crea la cuenta en PENDIENTE_VERIFICACION y se envía el enlace (RN-01, RN-06).
4. La persona abre el enlace: **Verificar correo** muestra la acción «Confirmar mi correo». Abrir el enlace **no** consume el token; al confirmar, el sistema lo consume (DEC-18). Una cuenta de registro propio queda en PENDIENTE_APROBACION y ve un mensaje que explica que un administrador debe habilitarla.
5. Si el enlace venció o ya se usó, ve un mensaje claro y la opción **Reenviar verificación** (RN-06).

### 6.2 Inicio y cierre de sesión
1. **Login** pide correo y contraseña. Solo una cuenta verificada, ACTIVA y no bloqueada entra (RN-07). Cualquier otro caso recibe el mismo error genérico.
2. Con la sesión iniciada, la aplicación consulta la identidad de la sesión para decidir la navegación privada. Las rutas privadas sin sesión válida llevan a Login.
3. **Cerrar sesión** invalida la sesión y limpia el estado del cliente (RN-11).

### 6.3 Recuperación de contraseña
1. **Olvidé mi contraseña** pide el correo y siempre muestra el mismo mensaje genérico (RN-04).
2. Si la cuenta es elegible (ACTIVA o PENDIENTE_APROBACION, RN-19), recibe un enlace de restablecimiento de un solo uso. En los demás estados no se envía nada; el mensaje genérico recuerda que, si aún no verificó el correo, puede pedir un nuevo enlace de verificación.
3. **Crear nueva contraseña** valida el token y la nueva contraseña. Al guardar, revoca todas las sesiones, envía el aviso de cambio y permite iniciar sesión con la nueva contraseña (RN-08). No cambia el estado, el rol ni la institución de la cuenta (RN-19): una cuenta PENDIENTE_APROBACION sigue esperando la aprobación.
4. Si el enlace venció o ya se usó, ve un mensaje claro y la opción de pedir uno nuevo.

### 6.4 Experiencia de las pantallas (brief de la guía `impeccable`: shape, harden y clarify)
> **Trasladada a la historia posterior de frontend (ID por asignar; DEC-23, aprobada el 2026-11-05).** Se conserva como insumo de esa historia; HT-AUTH-01 no implementa pantallas. Los mensajes genéricos y los códigos de respuesta que esta sección supone sí los garantiza la API.

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
| Verificar correo | Confirmar mi correo (abrir el enlace no lo consume, DEC-18) | Verificado y pendiente de aprobación; enlace vencido o usado |
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

### 6.6 Límites de intentos y vencimientos iniciales (DEC-15: mecanismos aprobados el 2026-11-03; valores provisionales hasta validar los de producción antes del release, salvo los de la activación, ya aprobados)
| Operación | Límite por cuenta, correo o enlace | Límite por IP |
|---|---|---|
| Inicio de sesión | **Umbral de desafío:** 5 intentos **fallidos** por correo cada 15 min; a partir de ahí, cada intento exige un CAPTCHA antes de comprobar la contraseña (DEC-16, aprobada). No rechaza: con CAPTCHA resuelto y credenciales correctas se entra | **Límites** (los dos responden «demasiados intentos»): 60 intentos con credenciales **incorrectas** cada 15 min (contadas solo cuando la contraseña llegó a comprobarse); 60 intentos con CAPTCHA **ausente o inválido** cada 15 min (contador aparte, DEC-16) |
| Registro | 3 solicitudes por correo cada hora | 20 solicitudes cada hora |
| Reenvío de verificación | 3 solicitudes por cuenta cada hora | 30 solicitudes cada hora |
| Verificación de correo | 10 intentos por enlace **existente** cada 15 min | 30 intentos cada 15 min (único límite para enlaces inexistentes) |
| Recuperación de contraseña | 3 solicitudes por cuenta cada hora | 30 solicitudes cada hora |
| Restablecimiento de contraseña | 5 intentos por enlace **existente** cada 15 min | 30 intentos cada 15 min (único límite para enlaces inexistentes) |
| Activación del primer administrador | 5 intentos por enlace de activación **existente** cada 15 min | 30 intentos cada 15 min (único límite para enlaces inexistentes) |

| Vencimiento | Valor inicial propuesto |
|---|---|
| Enlace de verificación de correo | 24 horas |
| Enlace de recuperación de contraseña | 30 minutos |
| Credencial de acceso | 15 minutos |
| Sesión renovable | 7 días desde el inicio de sesión (renovar no la extiende) |
| Enlace de activación del primer administrador | 24 horas (DEC-08; no forma parte de esta propuesta) |

- «Por cuenta» se cuenta sobre el correo escrito y normalizado, exista o no la cuenta, para que el límite no revele qué correos están registrados (RN-04).
- **Inicio de sesión:** el límite temporal restringe los intentos incorrectos, no el acceso del propietario. Tras 5 fallos de una cuenta en la ventana, los intentos siguientes deben resolver un CAPTCHA **antes** de que se compruebe la contraseña; resuelto el CAPTCHA, la validación sigue de forma normal y, si las credenciales son correctas y la cuenta está habilitada, se entra sin que el contador cambie. El desafío se pide igual para correos registrados y no registrados. «Demasiados intentos» se reserva para límites realmente alcanzados, sobre todo el de la IP. **El CAPTCHA no es una protección absoluta** contra ataques automatizados y no reemplaza el límite por IP.
- **Redes compartidas:** en una institución educativa muchas personas pueden salir a Internet con la misma IP; los fallos de todas cuentan para los mismos límites por IP. Separar los intentos sin CAPTCHA en su propio contador evita que un programa automático que no resuelve CAPTCHA agote el cupo de contraseñas incorrectas de la red, pero el riesgo sigue (plan §15).
- **Enlaces:** el límite por enlace solo existe para enlaces emitidos por el sistema. Un enlace inventado o inexistente solo cuenta para el límite por IP y no deja ningún registro propio.
- Superar un límite responde «demasiados intentos» con el tiempo de espera. La cuenta no cambia de estado ni queda bloqueada (RN-09).
- Los enlaces son de un solo uso, y pedir uno nuevo invalida el anterior del mismo propósito (RN-06). Cada renovación de la sesión entrega una credencial nueva y reutilizar cualquiera ya usada cierra esa sesión con todas sus credenciales. Restablecer la contraseña cierra todas las sesiones (RN-08, RN-16).

## 7. Estados y situaciones de negocio
| Estado / situación | Significado | Qué ve o puede hacer el usuario |
|---|---|---|
| PENDIENTE_VERIFICACION | Cuenta creada sin correo verificado | No puede iniciar sesión. Puede verificar o pedir otro enlace. |
| PENDIENTE_APROBACION | Correo verificado, sin institución ni rol asignados | No puede iniciar sesión. Ve que un administrador debe habilitar su cuenta. |
| ACTIVA | Verificada y con rol asignado | Inicia sesión y usa las funciones de su rol, dentro del alcance de su institución. |
| BLOQUEADA | Bloqueada por un administrador (historia posterior). **Nunca** se asigna automáticamente por intentos fallidos (RN-09) | No puede iniciar sesión y recibe el error genérico. |
| DESACTIVADA | Dada de baja | No puede iniciar sesión y recibe el error genérico. |
| Enlace vencido o usado | El token ya no sirve | Mensaje claro y opción de pedir uno nuevo, sin datos de la cuenta. |
| Verificación adicional (CAPTCHA) | Tras 5 fallos de inicio de sesión de un correo en la ventana (DEC-16, aprobada) | Debe resolver un CAPTCHA para que se compruebe su contraseña; con credenciales correctas entra. Igual para correos registrados y no registrados. |
| Límite de intentos | Demasiados intentos en la ventana (§6.6) | Mensaje de espera que indica cuándo puede reintentar, sin revelar la existencia de la cuenta. La cuenta no queda bloqueada. |
| Servicio temporalmente no disponible | La protección contra intentos abusivos no puede funcionar (DEC-06), el servicio está saturado (DEC-17) o la verificación adicional (CAPTCHA) no responde (DEC-16); en todos los casos se falla de forma cerrada | No puede registrarse, iniciar sesión, verificar, pedir enlaces ni cambiar la contraseña por un momento; ve un mensaje para reintentar más tarde. Quien ya tiene la sesión iniciada sigue trabajando. |

## 8. Roles y permisos (nivel negocio)
| Rol | Puede |
|---|---|
| Visitante (sin sesión) | Registrarse, verificar el correo, pedir reenvío, iniciar sesión, pedir y completar la recuperación. |
| Usuario autenticado (cualquier rol ACTIVO) | Consultar su propia identidad de sesión y cerrar sesión. |
| Operador del despliegue (no es un rol de la aplicación) | Inicializar el primer administrador desde el servidor (§6.5, RN-14). |
| Administrador | Aprobar cuentas y asignar institución y rol (operación fuera de alcance; ver §12). |
| Roles institucionales (Coordinador, Docente; DEC-11) | Lo que definan las historias que usan cada rol, siempre dentro de la institución asignada (permisos de Coordinador pendientes de definición funcional). |

### 8.1 Catálogo mínimo de roles (decisión de negocio DEC-11, aprobada el 2026-11-03)
Fuentes: los requisitos aportados (Admin, Coordinador), HU-EVAL-001 y PRODUCT.md (DOCENTE, ADMIN; anular cargas solo ADMIN). Esta historia solo hace cumplir el rol, la institución y el estado; los permisos de negocio de cada rol los definen las historias que los usan. **No se inventan permisos adicionales.**

| Rol | Alcance | Institución | Lo que esta historia le permite | Permisos previstos fuera de esta historia | Estado |
|---|---|---|---|---|---|
| ADMIN | Toda la plataforma OMR PreICFES | No tiene | `GET /auth/me`, logout | Administrar las instituciones y sus usuarios, incluido aprobar cuentas y asignar institución y rol (DEC-11; operaciones de historias posteriores, DT-09); gestionar exámenes, formas y claves; anular cargas (PRODUCT.md, HU-EVAL-001) | **Aprobado** (DEC-11, 2026-11-03): rol global |
| COORDINADOR | Solo la institución asignada | Obligatoria | `GET /auth/me`, logout | **Pendientes de definición funcional** (no se inventan) | **Aprobado** (DEC-11, 2026-11-03): rol institucional. Sus permisos específicos siguen pendientes |
| DOCENTE | Solo la institución asignada | Obligatoria | `GET /auth/me`, logout | Cargar hojas, resolver inconsistencias y ver resultados (PRODUCT.md, HU-EVAL-001) | **Aprobado** (DEC-11, 2026-11-03): rol institucional |

- **Quién aprueba cuentas:** un ADMIN ACTIVO aprueba las cuentas en PENDIENTE_APROBACION y les asigna institución y rol (requisito aportado: «hasta que un administrador asigne institución/rol»). El primer ADMIN se obtiene por §6.5. Que un COORDINADOR también apruebe dentro de su institución **no** forma parte de DEC-11: depende de la definición funcional de sus permisos y queda abierto.
- **Relación con el modelo institucional (DT-09):** un recurso institucional solo es accesible para cuentas ACTIVAS de la misma institución, salvo el ADMIN de alcance global. Esta historia compara identificadores de institución y no valida que la institución exista: eso llega con DT-09 y con la historia de aprobación.
- **Asignación de roles (DEC-11 aprobada, RN-18):** nadie se asigna ni modifica su propio rol; solo operaciones autorizadas del backend asignan o cambian roles.
- **Aislamiento (DEC-14 aprobada, RN-17):** una institución por cuenta en la v1; ADMIN con alcance global; COORDINADOR y DOCENTE con alcance institucional; un recurso de otra institución se responde como inexistente; un permiso insuficiente dentro del alcance se responde como «sin permiso». El aislamiento se aplica en los servicios y en las propias consultas a la base de datos.
- **Registro e invitaciones (DEC-07 aprobada):** el autorregistro público está permitido, con verificación de correo y **aprobación administrativa obligatoria** (tras verificar, la cuenta queda en PENDIENTE_APROBACION hasta que un administrador la apruebe); las invitaciones institucionales asignan el rol desde el servidor.

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
**Entonces** se envía **un enlace** (no un código, DEC-18) con un token aleatorio de 256 bits en Base64URL (43 caracteres); solo se guarda su hash SHA-256 y vence según la configuración (valor inicial: 24 horas).
**Y** abrir el enlace no consume el token: se consume una sola vez, de forma atómica, cuando la persona confirma la verificación.
**Y** un token vencido, ya usado o reemplazado por uno más reciente es rechazado.
**Y** el token no aparece en los logs ni se expone a recursos externos de la página.
**Nota (DEC-23, aprobada el 2026-11-05):** en esta historia se verifica la parte de la API (solo enlace con el token en el fragmento, ninguna ruta `GET` consume tokens, confirmación por `POST`); que la página no exponga el token a recursos externos lo verifica la historia de frontend.

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
**Entonces** la respuesta es siempre el mismo mensaje genérico, exista o no la cuenta y cualquiera sea su estado. Solo si la cuenta está ACTIVA o PENDIENTE_APROBACION (RN-19) se envía un enlace de restablecimiento de un solo uso (valor inicial: 30 minutos), con el token guardado como hash y sin aparecer en los logs; un enlace nuevo invalida el anterior.
**Y dado** una cuenta PENDIENTE_VERIFICACION, BLOQUEADA o DESACTIVADA, **entonces** no se emite token ni se envía correo, con la misma respuesta.

### CA-09 — Restablecimiento revoca sesiones (CA-AUTH-09)
**Dado** un token de restablecimiento válido, vigente y no usado
**Cuando** se crea una nueva contraseña
**Entonces** el token se consume, se revocan las sesiones existentes de la cuenta y es posible iniciar sesión con la nueva contraseña (y no con la anterior).
**Y** el estado, el rol y la institución de la cuenta no cambian (RN-19).
**Y dado** un token inválido, vencido o usado, o una cuenta que dejó de ser elegible después de emitir el enlace, **entonces** el restablecimiento se rechaza con el mismo mensaje.

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

### CA-14 — Límites de intentos sin bloqueo permanente ni bloqueo del propietario
**Dado** una operación pública de cuenta (inicio de sesión, registro, reenvío, verificación, recuperación o restablecimiento)
**Cuando** se alcanza un límite configurado por correo o enlace, o por IP, dentro de su ventana (§6.6)
**Entonces** se responde «demasiados intentos» indicando cuándo reintentar, con la misma respuesta exista o no la cuenta.
**Y** la cuenta no cambia de estado ni queda bloqueada: al terminar la ventana el contador desaparece y se puede volver a intentar.
**Y** en el inicio de sesión el contador por cuenta solo cuenta intentos fallidos, un intento correcto no lo consume y **no** produce «demasiados intentos»: al llegar al umbral activa la verificación adicional de CA-16. En el inicio de sesión, «demasiados intentos» corresponde al límite por IP.
**Y** un enlace inexistente solo consume el límite por IP; el límite por enlace se aplica únicamente a enlaces emitidos por el sistema, incluida la activación del primer administrador.
**Y** ningún contador ni registro del límite contiene el correo, la IP ni el enlace sin protección.

### CA-15 — Vencimiento y renovación segura de la sesión
**Dado** un inicio de sesión exitoso
**Cuando** pasa el tiempo o se renueva la sesión
**Entonces** la credencial de acceso vence según la configuración (valor inicial propuesto: 15 minutos) y la sesión solo puede renovarse hasta su vencimiento (valor inicial propuesto: 7 días desde el inicio de sesión).
**Y** cada renovación entrega una credencial de renovación nueva y la anterior deja de servir; si alguien reutiliza cualquier credencial ya usada de esa sesión, la sesión se cierra con todas sus credenciales (la vigente incluida).
**Y** la sesión no dura más de 7 días desde el inicio de sesión, aunque se renueve, ni admite más renovaciones que el máximo configurado (valor inicial propuesto: 1.000); al alcanzarlo, la sesión se cierra y se pide iniciar sesión de nuevo.
**Y** si dos renovaciones de la misma credencial llegan a la vez, como máximo una tiene éxito y nunca quedan dos credenciales de renovación válidas para la misma sesión.
**Y** con la sesión abierta en varias pestañas del mismo navegador, las renovaciones se coordinan entre ellas para que el uso normal no cierre la sesión.
**Nota (DEC-23, aprobada el 2026-11-05):** la coordinación entre pestañas es del cliente y la verifica la historia de frontend; esta historia garantiza la rotación atómica y la detección de reutilización del servidor, que no se relajan.
**Y** al restablecer la contraseña se cierran todas las sesiones existentes, incluidas sus renovaciones.

### CA-16 — Verificación adicional en el inicio de sesión (DEC-16, aprobada por el responsable del proyecto el 2026-11-03; proveedor pendiente antes del release)
**Dado** un correo, registrado o no, que acumuló 5 intentos de inicio de sesión fallidos en la ventana (§6.6)
**Cuando** se intenta iniciar sesión con ese correo sin resolver la verificación adicional (CAPTCHA), o con una verificación inválida
**Entonces** no se comprueba la contraseña y se pide resolver la verificación, con la misma respuesta para correos registrados y no registrados.
**Y dado** que la verificación se resuelve, **entonces** la validación de credenciales sigue de forma normal: con credenciales correctas de una cuenta habilitada se entra y el contador no cambia; con credenciales incorrectas se responde con el error genérico y el contador aumenta.
**Y** la verificación adicional no reemplaza los límites por IP: alcanzado alguno, se responde «demasiados intentos» aunque la verificación esté resuelta.
**Y dado** que el servicio de verificación adicional no está disponible, **entonces** no se puede iniciar sesión con ese correo mientras siga en desafío (fallo cerrado): se muestra un mensaje comprensible para reintentar más tarde, el intento no cuenta como fallo, reintentar es seguro y no existe ninguna otra vía que omita la verificación; al terminar la ventana del contador, el desafío deja de pedirse.

## 11. Requisitos no funcionales
- **RNF-01:** hash adaptativo aprobado: Argon2id o un equivalente aprobado.
- **RNF-02:** política de contraseña propuesta: mínimo 12 caracteres, con soporte para frases de contraseña y gestores. Se permite pegar. No se imponen reglas arbitrarias de composición salvo que lo exija la política institucional. *(DEC-23, aprobada el 2026-11-05: esta historia verifica la política en la API; pegar y autocompletar en los formularios lo verifica la historia de frontend.)*
- **RNF-03:** HTTPS en todos los despliegues.
- **RNF-04:** todos los vencimientos y límites son configurables, sin valores fijos en el código, y una configuración inválida o incompleta impide arrancar. Valores iniciales propuestos (DEC-15, §6.6): verificación de correo 24 h, recuperación de contraseña 30 min, credencial de acceso 15 min y sesión renovable 7 días.
- **RNF-05:** las pantallas de cuenta tienen estados de carga y error accesibles (anuncio de cambios, gestión del foco y uso con teclado). *(DEC-23, aprobada el 2026-11-05: lo cubre la historia posterior de frontend, ID por asignar; HT-AUTH-01 no tiene tareas para RNF-05.)*
- **RNF-06:** si se eligen cookies, hay protección contra CSRF; si se eligen tokens, su almacenamiento, expiración y revocación son seguros y están documentados. **Concreción (DEC-01 y DEC-20, aprobadas):** las operaciones de autenticación que cambian estado y las protegidas por la cookie de sesión solo se aceptan desde los orígenes del frontend configurados explícitamente; una solicitud sin origen, con origen `null` o con un origen no autorizado se rechaza con «acceso denegado» (403), sin efectos.
- **RNF-07** *(DEC-17, aprobada por el responsable del proyecto el 2026-11-03; valores de producción pendientes de las pruebas de carga, T-43)*: el servicio de autenticación limita la cantidad total de solicitudes de autenticación y la cantidad de verificaciones de contraseña simultáneas, para que una ráfaga de solicitudes no agote el procesador ni la memoria. Distingue dos respuestas: «demasiados intentos» cuando el límite es atribuible a quien hace la solicitud (su IP, su correo o su enlace), y «servicio no disponible, reintenta más tarde» cuando el servicio está saturado o le falta capacidad. Los valores se definen con pruebas de carga y concurrencia; **no hay valores de producción sin esas pruebas**.

## 12. OPEN QUESTIONS
- [x] ~~¿El registro propio estará habilitado para todos o solo mediante invitación?~~ **Resuelta (DEC-07, aprobada el 2026-11-03):** autorregistro público con verificación de correo y aprobación administrativa obligatoria; las invitaciones institucionales asignan el rol desde el servidor.
- [x] ~~Aprobar el catálogo mínimo de §8.1~~ **Resuelta (DEC-11, aprobada el 2026-11-03):** ADMIN global con administración de instituciones y usuarios; COORDINADOR y DOCENTE limitados a su institución asignada; nadie modifica su propio rol (RN-18); roles asignados solo por el backend.
- [ ] Permisos específicos de COORDINADOR: **pendientes de definición funcional** (DEC-11). Preguntas que siguen abiertas: ¿Un COORDINADOR puede aprobar cuentas de su institución? ¿En qué historia se construyen la aprobación y las invitaciones? (Propuesta registrada: aprueba un ADMIN ACTIVO; aprobación e invitaciones en una historia posterior.)
- [x] ~~Aprobar el mecanismo de §6.5 para el primer administrador~~: **DEC-08 aprobada por el responsable del proyecto el 2026-11-03**: operación del servidor (`bootstrap:admin`) con enlace de activación por correo, sin contraseña expuesta en la consola ni en los logs. La consola interactiva queda como alternativa no aprobada.
- [x] ~~¿Una cuenta puede pertenecer a más de una institución?~~ **Resuelta (DEC-14, aprobada el 2026-11-03):** una sola en la v1; 404 fuera del alcance y 403 por permiso insuficiente; aislamiento en servicios y consultas.
- [ ] DT-09: ¿qué historia crea la colección de instituciones? (Sigue abierta.)
- [ ] Cuando un administrador cambie el rol o la institución de una cuenta (historia posterior), ¿deben revocarse sus sesiones de inmediato? (Propuesta: sí, como en RN-16.)
- [ ] ¿Qué proveedor de correo se usará? (Sigue abierto; bloquea solo el release.) Prueba local sin mensajes reales: **DEC-05 aprobada** (Mailpit solo en dev/test). Estrategia de envío: **DEC-09 aprobada**, con el riesgo de pérdida ante una caída aceptado y la condición de mantener un reenvío y una recuperación seguros.
- [x] ~~¿Cookie de sesión segura o token?~~ **DEC-01 y DEC-10 aprobadas el 2026-11-03** (JWT de 15 min en memoria y renovación en una cookie `HttpOnly`, `Secure` y `SameSite=Strict`, con rotación, revocación y versión de credenciales). Condición: la protección CSRF y la configuración segura de la cookie se documentan y se verifican (RNF-06).
- [ ] Valores de producción de §6.6: **mecanismos de DEC-15 y DEC-06 aprobados el 2026-11-03**; los valores numéricos (salvo la activación) se validan antes del release.
- [ ] Elegir el proveedor de CAPTCHA antes del release (privacidad de los datos que recibe, disponibilidad y accesibilidad). La verificación adicional tras 5 fallos y su fallo cerrado (**DEC-16**, CA-16) están aprobados desde el 2026-11-03.
- [ ] Fijar los valores de producción de la protección de recursos con pruebas de carga (T-43) antes del release. El mecanismo (**DEC-17**, RNF-07) está aprobado desde el 2026-11-03; k6 queda sujeta a la política de licencias.
- [ ] Redes compartidas: ¿se necesita un límite por IP distinto para las redes de las instituciones? Decidir con datos de uso reales.
- [x] ~~Límites de la activación del primer administrador~~ **Resuelta y aprobada (2026-11-03, dentro de DEC-15):** 5 intentos por enlace de activación existente y 30 por IP cada 15 min. La propuesta habla de «invitación»: en esta historia es el enlace de activación `ACTIVAR_CUENTA` del primer administrador; las invitaciones institucionales llegan con otra historia.
- [x] ~~¿Pasa una cuenta a BLOQUEADA por intentos fallidos?~~ No: superar intentos nunca bloquea ni cambia el estado (RN-09, propuesta del responsable del 2026-11-03).
- [ ] ¿Quién pasa una cuenta a BLOQUEADA y cómo se desbloquea? (Operación administrativa de una historia posterior.)
- [x] ~~¿«Olvidé mi contraseña» aplica a cuentas en PENDIENTE_APROBACION? ¿Qué cuentas son «elegibles»?~~ **Resuelta (DEC-19, aprobada el 2026-11-03):** solo ACTIVA y PENDIENTE_APROBACION; PENDIENTE_VERIFICACION usa el reenvío de la verificación; BLOQUEADA y DESACTIVADA requieren intervención administrativa; respuesta genérica siempre (RN-19, CA-08).
- [ ] ¿Cuánto tiempo se conservan los eventos de auditoría?
- [x] ~~¿La verificación será por enlace, por código o por ambos?~~ **Resuelta (DEC-18, aprobada el 2026-11-03):** solo enlace; abrirlo no consume el token y la confirmación ocurre por POST (CA-04, RN-06).
- [x] ~~¿Contra qué origen se valida la protección CSRF y qué pasa si falta la cabecera `Origin`?~~ **Resuelta (DEC-20, aprobada el 2026-11-03):** lista explícita de orígenes del frontend; origen ausente, `null` o no autorizado → 403 (RNF-06).

## 13. Checklist de spec lista (`status: ready`)
- [x] Objetivo, alcance y fuera de alcance claros (verificación solo por enlace, DEC-18; códigos fuera de alcance).
- [x] Reglas de negocio numeradas (RN-NN).
- [x] Criterios de aceptación verificables (CA-NN).
- [x] Sin OPEN QUESTIONS que cambien el comportamiento observable (o resueltas con el responsable funcional y registradas en §14). Resueltas el 2026-11-03: DEC-18, DEC-19 y DEC-20. Las que siguen abiertas en §12 pertenecen a historias posteriores (permisos de COORDINADOR, DT-09, BLOQUEADA, revocación al cambiar de rol), solo bloquean el release (proveedores de correo y CAPTCHA, valores de producción) o no cambian el comportamiento de esta historia (retención de auditoría, redes compartidas).
- [x] Todo requisito respaldado por `docs/requisitos/` o una decisión registrada.

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
| 2026-11-03 | **Formalización de decisiones** sobre la matriz arquitectónica revisada por el responsable. Propuestas técnicas registradas para aprobación: DEC-01, DEC-05, DEC-06, DEC-08, DEC-09, DEC-10, DEC-12 y DEC-13 (plan §14). Propuestas de negocio registradas como pendientes de aprobación formal: DEC-07 (registro e invitaciones), DEC-11 (catálogo de roles) y DEC-14 (una institución por cuenta; 404/403). Se agrega **RN-17** (sujeta a DEC-14), la situación «Servicio temporalmente no disponible» en §7 (consecuencia visible de DEC-06) y referencias a las DEC en §8.1 y §12. Las OPEN QUESTIONS siguen abiertas hasta la aprobación formal. Ningún CA, RN ni RNF existente cambia de número ni de significado. | JulianD27-ia (revisión de la matriz, 2026-11-03) |
| 2026-11-03 | **DEC-11 aprobada** por el responsable como decisión de negocio: ADMIN global (toda la plataforma, administra instituciones y usuarios); COORDINADOR y DOCENTE limitados a la institución asignada; nadie se asigna ni modifica su propio rol; roles asignados solo por operaciones autorizadas del backend; permisos de COORDINADOR pendientes de definición funcional. Nueva **RN-18**. §8.1 y §12 actualizadas. DEC-07 y DEC-14 (RN-17) siguen como propuestas pendientes. | Decisión del responsable (2026-11-03) |
| 2026-11-03 | **DEC-07 y DEC-14 aprobadas** por el responsable como decisiones de negocio. DEC-07: autorregistro público con verificación de correo y aprobación administrativa obligatoria; invitaciones institucionales con rol asignado desde el servidor. DEC-14: una institución por cuenta en la v1, ADMIN global, COORDINADOR y DOCENTE institucionales, 404 para recursos de otra institución, 403 por permiso insuficiente, aislamiento en servicios y consultas. RN-17 deja de ser propuesta y agrega el aislamiento en las consultas; §8.1 y §12 actualizadas (la pregunta de qué historia crea las instituciones sigue abierta). §2 y §4: la separación está confirmada en `0bcdae7` y publicada en `origin/feature/HT-AUTH-01`, pendiente de llegar a `develop` por PR. Los permisos de COORDINADOR siguen pendientes de definición funcional. Ningún CA cambia. | Decisión del responsable (2026-11-03) |
| 2026-11-03 | **Propuesta de límites y vencimientos** aportada por el responsable, registrada como **propuesta técnica DEC-15** (pendiente de aprobación). Nueva §6.6 con los valores; RN-09 ampliada (límites por operación, configurables, aviso con tiempo de espera, conteo exista o no la cuenta, sin bloqueo permanente ni paso automático a BLOQUEADA, contadores que expiran y sin datos en claro); RNF-04 con todos los vencimientos y límites configurables; §7 (BLOQUEADA nunca automática; límite con tiempo de espera). **Nuevos CA-14** (límites sin bloqueo permanente) y **CA-15** (vencimiento, rotación y reutilización de la renovación, cierre de sesiones al restablecer). §12: aprobación de DEC-15 y límites de `/auth/activate` (no incluidos en la propuesta) abiertos; la pregunta de BLOQUEADA por intentos queda resuelta. Ningún CA o RN existente cambia de número. | Propuesta del responsable (2026-11-03) |
| 2026-11-03 | **Revisión de seguridad de DEC-15** pedida por el responsable (DEC-15 sigue como propuesta). RN-09 y §6.6: en el login el límite por cuenta restringe los intentos incorrectos y no el acceso del propietario (credenciales siempre comprobadas; solo los fallos consumen; nunca BLOQUEADA); límite por enlace solo para enlaces existentes, el resto solo por IP; límites de `/auth/activate` (5 por enlace existente y 30 por IP cada 15 min) y pregunta de §12 resuelta. CA-14: propietario con credenciales correctas en el umbral entra; incorrectas → «demasiados intentos»; enlaces inexistentes. CA-15: reutilizar cualquier credencial de renovación cierra la sesión completa; máximo absoluto de 7 días. | Revisión del responsable (2026-11-03) |
| 2026-11-03 | **Ajustes previos a la aprobación de DEC-15** pedidos por el responsable (DEC-15 sigue pendiente). RN-09, §6.6 y §7: en el inicio de sesión el contador por cuenta ya no responde «demasiados intentos»; tras 5 fallos exige un CAPTCHA antes de comprobar la contraseña (**propuesta DEC-16**), igual para correos registrados y no registrados, sin ser una protección absoluta y sin reemplazar el límite por IP; riesgo de redes compartidas. CA-14 ajustado (en el login, «demasiados intentos» corresponde a la IP). CA-15: máximo de renovaciones y renovaciones simultáneas. **Nuevo CA-16** (verificación adicional, sujeto a DEC-16) y **nuevo RNF-07** (protección de recursos, propuesta DEC-17, valores solo tras pruebas de carga). §12: aprobación de DEC-16 y DEC-17, proveedor de CAPTCHA y redes compartidas. | Revisión del responsable (2026-11-03) |
| 2026-11-03 | **Revisión de consistencia de DEC-15, DEC-16 y DEC-17.** §6.6: el inicio de sesión separa el umbral de desafío por correo y dos límites por IP (credenciales incorrectas y CAPTCHA ausente o inválido), sin cambiar el umbral de 60; redes compartidas actualizado. §7: «Servicio temporalmente no disponible» incluye la saturación y la caída del CAPTCHA. CA-15: coordinación de renovaciones entre pestañas. CA-16: comportamiento ante la indisponibilidad del proveedor de CAPTCHA (fallo cerrado, mensaje, reintento seguro, expiración del contador, sin vías alternativas). RNF-07: distinción entre límite atribuible al cliente y saturación del servicio. Ningún CA, RN o RNF cambia de número. | Revisión del responsable (2026-11-03) |
| 2026-11-03 | **Aprobación de las decisiones técnicas** DEC-01, DEC-02, DEC-03, DEC-05, DEC-06, DEC-08, DEC-09, DEC-10, DEC-12, DEC-13, DEC-15, DEC-16 y DEC-17, con sus condiciones (plan §14), y aceptación de los riesgos residuales (plan §15). Solo se actualizan las marcas de estado de §6.6, CA-16, RNF-07 y §12; **no cambia el comportamiento**. Pendientes antes del release: proveedor de CAPTCHA y valores de producción de DEC-15 y DEC-17 | Responsable del proyecto |
| 2026-11-03 | Revisión de cierre documental: §13 marca los puntos verificados (RN numeradas, CA verificables, requisitos respaldados). **No pasa a `ready`:** siguen abiertas la elegibilidad de «Olvidé mi contraseña» y el método de verificación (enlace, código o ambos), que cambian el comportamiento de CA-08 y CA-04 | Revisión pedida por el responsable del proyecto |
| 2026-11-03 | **Decisiones del responsable del proyecto para cerrar los bloqueos documentales.** DEC-18: verificación solo por enlace (sin códigos), token de 256 bits Base64URL, 24 h, hash SHA-256, consumo atómico de un solo uso, abrir el enlace no lo consume y la confirmación es por POST; §3 (alcance y fuera de alcance), RN-06, §6.1, tabla de pantallas y CA-04. DEC-19: recuperación solo para ACTIVA y PENDIENTE_APROBACION, sin cambiar estado, rol ni institución; **RN-19 nueva**, §6.3, CA-08 y CA-09. DEC-20: validación estricta de `Origin` con lista explícita; RNF-06. Supuesto de correo de prueba actualizado (DEC-05). §12: tres preguntas cerradas; §13 completa | Responsable del proyecto |
| 2026-11-03 | **draft → ready**, autorizado por el responsable del proyecto tras la revisión de los checklists (§13 completo; trazabilidad validada) | Responsable del proyecto |
| 2026-11-05 | **Propuesta DEC-23** (plan §14), pendiente de aprobación: HT-AUTH-01 queda **solo backend**. El frontend de la cuenta (pantallas de §6.4, navegación privada, cliente y sesión del navegador, coordinación entre pestañas, widget de CAPTCHA, pruebas Playwright y de accesibilidad) pasa a una historia posterior de frontend sin ID asignado. §3: la viñeta de pantallas se tacha y el frontend pasa a «Fuera de alcance»; §6.4 se conserva como insumo; notas en CA-04, CA-15, RNF-02 y RNF-05 sobre la parte que verifica cada historia. Ningún CA, RN ni RNF cambia de número ni se retira. | Instrucción del responsable (2026-11-05) |
| 2026-11-05 | **DEC-23 aprobada** por el responsable del proyecto (decisión de alcance, alternativa B): el frontend de la cuenta se desarrollará en una historia posterior e independiente (ID por asignar). Las notas de §3, §6.4, CA-04, CA-15, RNF-02 y RNF-05 pasan de «propuesta» a «aprobada». Ningún CA, RN ni RNF se elimina ni se renumera. Estado: `in-progress` (sin cambio, por instrucción del responsable). | Decisión del responsable (2026-11-05) |
| 2026-11-05 | Ajuste de alcance tras DEC-23: §3 (fuera de alcance, identidad visual) deja de atribuir a esta historia la estructura, los estados, los textos y la accesibilidad de las pantallas; quedan en §6.4 como insumo de la historia posterior de frontend. Sin cambios en CA, RN ni RNF. Estado: `in-progress` (sin cambio). | Revisión del responsable (2026-11-05) |
