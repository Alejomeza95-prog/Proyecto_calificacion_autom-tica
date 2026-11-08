---
id: HT-AUTH-02
title: Frontend de autenticación
status: in-review        # draft | ready | in-progress | in-review | done
owner: JulianD27-ia
branch: feature/HT-AUTH-02
updated: 2026-11-07
---

# HT-AUTH-02 — Frontend de autenticación

> **spec.md describe QUÉ se construye y POR QUÉ.** El CÓMO (rutas técnicas, cliente HTTP, contratos y pruebas) va en `plan.md`.
> Fuente: requisitos aportados por el desarrollador el 2026-11-05 (§14). Generado por `/sdd-spec` junto con `plan.md` y `tasks.md`, en estado `draft`. Solo el desarrollador responsable cambia el estado a `ready`, tras revisar el checklist §13.

## 1. Objetivo
Como persona que necesita acceder a OMR-PreICFES, quiero crear una cuenta, verificar mi correo, iniciar y cerrar sesión y recuperar mi contraseña desde una interfaz web, para acceder de forma segura a las funciones autorizadas de la plataforma (HU-AUTH-01).

Objetivo técnico: desarrollar el frontend funcional del módulo de autenticación, integrado con los servicios reales de HT-AUTH-01, administrando el estado de autenticación y protegiendo la navegación hacia las rutas privadas.

## 2. Contexto y fuentes
- **Tipo:** historia técnica, solo frontend. Es la «historia posterior de frontend» prevista por `HT-AUTH-01/DEC-23` (aprobada el 2026-11-05), que hasta hoy no tenía ID.
- **Fuentes:** requisitos aportados por el desarrollador (§14); `specs/HT-AUTH-01/spec.md` §6.4 (brief de pantallas heredado por DEC-23); `specs/HT-AUTH-01/plan.md` §5, §8, §9 y §11; `docs/operacion/autenticacion.md`; código de `apps/backend/src/auth`; `PRODUCT.md`.
- **Mapeo de IDs:** cada `CA-AUTH-02-NN` aportado se registra como `CA-NN` con el mismo número, por compatibilidad con `scripts/sdd-validate.ps1`.
- **Situación del repositorio (verificada el 2026-11-05):**
  - `apps/frontend` es un esqueleto de HT-CORE-01 con React 19, Vite, TypeScript strict, Vitest y Testing Library, y una sola pantalla sin rutas. No hay enrutador, Playwright, componentes, estilos, tokens de diseño ni recursos gráficos.
  - La API de HT-AUTH-01 **está en `develop`** (PR #4, fusionado el 2026-11-05). HT-AUTH-01 sigue `in-progress` por tareas de release (T-33, T-34, T-41 y T-43), que no cambian los contratos de esta historia.
- **Diferencias entre los requisitos aportados y el código real** (resueltas por el desarrollador el 2026-11-05, ver §12 y §14):

| Tema | Requisito aportado | Código o documento real | Resolución |
|---|---|---|---|
| Prefijo | `/auth/...` | `/api/v1/auth/...` | Se usa el prefijo real |
| Datos de la sesión | `GET /auth/me` incluye el correo | Devuelve `id`, `nombre`, `rol`, `institucionId`, `estado`; **sin correo** ni nombre de institución | Se respeta el contrato; la interfaz no depende de esos datos |
| Cuenta PENDIENTE_APROBACION | La interfaz muestra un mensaje y no da acceso | No puede iniciar sesión: recibe el mismo error genérico que cualquier otro caso; solo la respuesta de la verificación de correo informa ese estado | Mensaje tras verificar; en el inicio de sesión, mensaje genérico y orientación general |
| Identidad visual | Respetar la de OMR-PreICFES | No existe: `PRODUCT.md` declara «sin marca aún», no hay `DESIGN.md` y HU-UX-001 no tiene spec | Dirección sencilla y consistente, limitada a este módulo, sin identidad corporativa global |
| Activación del primer administrador | No aparecía en la lista de pantallas ni de endpoints | El backend envía enlaces a `/activar-cuenta#token=…` y expone `POST /api/v1/auth/activate` | Se incorpora como flujo propio, distinto de la recuperación |

## 3. Alcance
### Incluye
- Pantallas de inicio de sesión, registro, confirmación «revisa tu correo», verificación de correo, reenvío de verificación, solicitud de recuperación, creación de nueva contraseña y activación de cuenta.
- Una vista privada básica `/inicio`, destino predeterminado tras iniciar sesión.
- Una dirección visual sencilla y consistente para este módulo, documentada en `DESIGN.md` con ese alcance.
- Cliente de la API de autenticación, estado de sesión, restauración al recargar y cierre de sesión.
- Protección de la navegación privada.
- Componente de Cloudflare Turnstile cuando el backend solicite el desafío.
- Validaciones, mensajes de error, estados de carga, adaptación a móvil y escritorio y navegación por teclado.
- Pruebas automatizadas de los flujos principales contra el backend real y documentación de configuración y ejecución.

### Fuera de alcance
- Servicios, endpoints o contratos de backend; modificar el código de HT-AUTH-01.
- Administración de usuarios, aprobación de cuentas, gestión de invitaciones y asignación de roles o instituciones.
- Identidad corporativa global: logo, marca o sistema de diseño de toda la plataforma (HU-UX-001).
- El comando `bootstrap:admin` y la emisión de enlaces de activación, que ya pertenecen al backend.
- El despliegue y la configuración definitiva de producción, pendientes de definición. Esta historia solo documenta los requisitos de proxy inverso, CSP y `Referrer-Policy`.
- Retirar `CAPTCHA_SITE_KEY` de la plantilla de HT-AUTH-01.
- Códigos de verificación, inicio de sesión con proveedores externos, segundo factor y cambio de contraseña con la sesión iniciada (fuera de alcance en HT-AUTH-01).
- Funciones académicas privadas (HU-EVAL-001 y siguientes).

### Supuestos
- Los contratos de HT-AUTH-01 revisados aquí se mantienen. La primera actividad de T-01 lo confirma contra `develop`.
- En desarrollo y pruebas se dispone de MongoDB, Redis y Mailpit de Compose.

## 4. Dependencias funcionales
- **HT-CORE-01:** esqueleto de `apps/frontend`.
- **HT-AUTH-01:** servicios, contratos y mecanismos de autenticación; correo configurado en el ambiente local de pruebas.
- **Credenciales de Cloudflare Turnstile:** sitekey pública y dominios autorizados, pendientes en HT-AUTH-01 (`docs/operacion/autenticacion.md` §0). Sin ellas no se puede comprobar el widget real.
- **HU-UX-001:** dueña de la identidad visual del sistema; sin spec. No bloquea: cuando exista, podrá adoptar o reemplazar la dirección de este módulo.
- **Historia posterior de aprobación de cuentas (sin ID):** hasta que exista, una cuenta de autorregistro no puede llegar a ACTIVA por la interfaz.

## 5. Reglas de negocio e invariantes
- **RN-01:** el frontend no accede a la base de datos. Consume únicamente la API real de HT-AUTH-01, sin respuestas simuladas en el código de la aplicación y sin inventar ni modificar rutas o contratos.
- **RN-02:** el token de acceso se mantiene únicamente en memoria. Ningún token ni contraseña se guarda en `localStorage`, `sessionStorage` ni otro almacenamiento persistente del navegador.
- **RN-03:** la renovación de la sesión usa solo la cookie `HttpOnly` definida por el backend. El frontend no la lee ni la escribe; únicamente envía las credenciales según la configuración aprobada.
- **RN-04:** el formulario público de registro no permite elegir rol ni institución, ni los envía.
- **RN-05:** los mensajes públicos no revelan si una cuenta existe ni en qué estado está. Registro, reenvío, recuperación e inicio de sesión muestran el mismo resultado para cualquier correo.
- **RN-06:** el token de un enlace de correo se obtiene del fragmento de la URL, se retira de la barra de direcciones y se envía solo mediante la solicitud prevista por la API. Abrir el enlace no consume el token: se consume cuando la persona confirma la acción.
- **RN-07:** las pantallas que reciben un token no cargan recursos externos ni envían la URL como referente (`HT-AUTH-01/DEC-18`, DEC-23).
- **RN-08:** las rutas privadas solo se muestran a personas autenticadas con cuenta ACTIVA. Esta restricción visual no sustituye la autorización del backend, que sigue siendo la autoridad.
- **RN-09:** una cuenta en PENDIENTE_APROBACION recibe un mensaje informativo después de verificar su correo y nunca accede a funciones privadas. En el inicio de sesión se conserva el mensaje genérico del backend, con una orientación general, igual para todos, que no revela el estado de ninguna cuenta.
- **RN-10:** la validación del CAPTCHA ocurre en el backend; el frontend solo recoge y transmite la respuesta. Si el desafío no se puede completar, no existe ninguna vía alternativa para iniciar sesión (fallo cerrado, `HT-AUTH-01/DEC-16`).
- **RN-11:** contraseñas, tokens e información sensible no aparecen en consola, registros ni analítica.
- **RN-12:** las renovaciones de sesión se coordinan dentro de cada pestaña y entre pestañas, para que el uso normal no cierre la sesión. Los avisos entre pestañas no llevan tokens ni datos de sesión (`HT-AUTH-01/DEC-23`).
- **RN-13:** el frontend cumple las políticas de CORS, Origin y CSRF de HT-AUTH-01 y no intenta omitirlas.
- **RN-14:** el frontend no ofrece funciones de aprobación, administración de usuarios ni gestión de invitaciones.
- **RN-15:** la activación de cuenta es un flujo propio: tiene su ruta, su solicitud a la API y sus textos, y no se presenta ni se trata como una recuperación de contraseña. Un enlace de activación no válido no remite a la recuperación de contraseña.
- **RN-16:** tras iniciar sesión, el retorno a una ruta solicitada solo admite rutas privadas internas válidas. Cualquier otro valor lleva a `/inicio`; nunca se redirige a otro sitio.

## 6. Flujo funcional
### 6.1 Registro y verificación
1. La persona abre **Registro**, ingresa nombre, correo y contraseña, y envía.
2. Ve **Revisa tu correo**, con el mismo mensaje para cualquier correo y la opción de pedir otro enlace.
3. Abre el enlace del correo: **Verificar correo** retira el token de la URL y muestra la acción «Confirmar mi correo». Nada se consume hasta confirmar.
4. Al confirmar, ve el resultado. Una cuenta de autorregistro queda en PENDIENTE_APROBACION y se le explica que un administrador debe habilitarla.
5. Si el enlace venció, ya se usó o se recargó la página después de retirar el token, ve un mensaje claro y la opción **Reenviar verificación**.

### 6.2 Inicio y cierre de sesión
1. **Inicio de sesión** pide correo y contraseña. Cualquier rechazo muestra el mensaje genérico del backend y una orientación general, igual para todos.
2. Si el backend solicita un desafío, aparece Turnstile; al resolverlo se reenvía el intento con la respuesta.
3. Con sesión iniciada, se consultan los datos de la persona y se abre la ruta privada interna solicitada o, si no la hay, `/inicio`.
4. **Cerrar sesión** invalida la sesión en el backend, limpia el estado y avisa a las demás pestañas.

### 6.3 Sesión al recargar
1. Al abrir o recargar la aplicación, se intenta recuperar la sesión con el mecanismo de renovación. Mientras tanto no se muestra contenido privado.
2. Si no hay sesión válida, una ruta privada lleva a Inicio de sesión.
3. Si el servicio no responde, se informa y se ofrece reintentar, sin tratar a la persona como desconectada.

### 6.4 Recuperación de contraseña
1. **Olvidé mi contraseña** pide el correo y siempre muestra el mismo mensaje.
2. El enlace del correo abre **Crear nueva contraseña**, que retira el token de la URL.
3. Al guardar, se invita a iniciar sesión con la nueva contraseña. Si el enlace no sirve, se ofrece pedir otro.

### 6.5 Experiencia de las pantallas (brief heredado de HT-AUTH-01 §6.4, guía `impeccable`, modo Operate)
- **Público y momento:** docentes, coordinadores y administradores, en la oficina o desde el celular, a menudo justo antes de procesar un lote. Quieren entrar rápido y sin dudas.
- **Resultado:** cada pantalla tiene una sola acción principal y, al enviarla, dice qué pasó y qué sigue. El éxito es llegar a la sesión o saber exactamente qué esperar, sin contactar a soporte.
- **Mensajes genéricos pero accionables:** cumplen RN-05 y siempre indican el siguiente paso.
- **Errores** junto al campo, asociados a él para lectores de pantalla, conservando lo escrito, salvo la contraseña tras un rechazo de credenciales.
- **Contraseña:** se permite pegar y el autocompletado de gestores, se puede mostrar u ocultar, y la política se publica junto al campo antes del primer error.
- **Estados explícitos:** en reposo, enviando (sin doble envío), éxito, error de validación, enlace vencido o usado, demasiados intentos, servicio no disponible y error de red con reintento.
- **Idioma:** español (Colombia), con un mismo término por concepto («correo», «enlace», «contraseña»).
- **Anti-objetivos:** confirmar o negar la existencia de una cuenta; reglas de composición no exigidas; bloquear el pegado; textos técnicos («token», códigos HTTP) visibles para la persona; depender solo del color para comunicar un estado.

| Pantalla | Acción principal | Estados propios además de los comunes |
|---|---|---|
| Registro | Crear cuenta | — |
| Revisa tu correo | Pedir otro enlace (secundaria: volver a Inicio de sesión) | Reenvío limitado |
| Verificar correo | Confirmar mi correo | Pendiente de aprobación; enlace no válido |
| Reenviar verificación | Enviar enlace | — |
| Inicio de sesión | Iniciar sesión | Credenciales rechazadas; desafío; verificación no disponible |
| Olvidé mi contraseña | Enviar enlace | — |
| Crear nueva contraseña | Guardar contraseña | Enlace no válido; contraseña guardada |
| Activar cuenta | Activar mi cuenta | Enlace no válido, sin reenvío; cuenta activada |
| Inicio (privada) | Cerrar sesión | Nombre y rol de la persona; sin datos que `GET /api/v1/auth/me` no entregue |

### 6.6 Activación de cuenta
1. La persona recibe el enlace que genera el backend y abre **Activar cuenta**, que retira el token de la URL. Abrirlo no consume nada.
2. Define su contraseña y confirma. El resultado no inicia sesión: se le invita a hacerlo con la nueva contraseña.
3. Si el enlace no sirve o se recargó la página, ve un mensaje claro que le indica pedir un enlace nuevo a quien opera el sistema. No hay reenvío de autoservicio: el backend lo emite solo por la operación del servidor.

## 7. Estados y situaciones de negocio
| Estado / situación | Significado | Qué ve o puede hacer el usuario |
|---|---|---|
| Comprobando sesión | Se intenta recuperar la sesión al cargar | Indicador de carga; sin contenido privado |
| Sin sesión | No hay sesión válida | Pantallas públicas; una ruta privada lleva a Inicio de sesión |
| ACTIVA con sesión | Autenticada y habilitada | Rutas privadas y cierre de sesión |
| PENDIENTE_VERIFICACION | Correo sin confirmar | Verificar o pedir otro enlace; si intenta iniciar sesión, error genérico |
| PENDIENTE_APROBACION | Correo verificado, sin aprobación | Mensaje informativo tras verificar; si intenta iniciar sesión, mensaje genérico y orientación general |
| Cuenta de activación pendiente | Primer administrador sin contraseña definida | Activar con el enlace; si intenta iniciar sesión, mensaje genérico |
| BLOQUEADA o DESACTIVADA | Sin acceso | Error genérico |
| Desafío requerido | El backend pide una verificación adicional | Resolver Turnstile y reintentar |
| Enlace no válido | Token vencido, usado, reemplazado o ausente | Mensaje claro y opción de pedir otro |
| Demasiados intentos | Límite atribuible a la persona | Mensaje con cuándo reintentar, si la información está disponible |
| Servicio no disponible | Saturación o dependencia caída | Mensaje para reintentar más tarde |
| Sesión perdida | Vencida o revocada | Vuelve a Inicio de sesión con un aviso |

## 8. Roles y permisos (nivel negocio)
| Rol | Puede |
|---|---|
| Visitante (sin sesión) | Registrarse, verificar el correo, pedir reenvío, iniciar sesión y recuperar la contraseña |
| Persona con enlace de activación | Definir su contraseña y activar su cuenta |
| ADMIN, COORDINADOR o DOCENTE con cuenta ACTIVA | Ver sus datos de sesión, entrar a las rutas privadas y cerrar sesión. Sus permisos específicos los definen otras historias |

Esta historia no define permisos por rol: cualquier cuenta ACTIVA pasa la protección de rutas, y cada ruta futura aplicará los suyos.

## 9. Datos de negocio involucrados
- **Formularios:** nombre (**personal**), correo (**personal**), contraseña (**secreto**), respuesta del desafío (**secreto**). Viven en memoria y solo mientras se usan.
- **Sesión en memoria:** token de acceso (**secreto**); nombre (**personal**), identificador, estado, rol e identificador de institución.
- **Token del enlace** (**secreto**): solo en memoria, entre obtenerlo y confirmarlo.
- El frontend no guarda ningún dato personal de forma persistente.

## 10. Criterios de aceptación
CA-01..CA-13 transcriben CA-AUTH-02-01..13 aportados, en formato Dado/Cuando/Entonces. CA-14 y CA-15 provienen de las decisiones del desarrollador del 2026-11-05 (§14).

### CA-01 — Pantalla de inicio de sesión
**Dado** la pantalla de inicio de sesión con correo electrónico y contraseña
**Cuando** la persona envía el formulario
**Entonces** la solicitud se hace al endpoint de autenticación de HT-AUTH-01 y la interfaz refleja su respuesta real.

### CA-02 — Pantalla de registro sin privilegios
**Dado** la pantalla de registro con nombre, correo electrónico y contraseña
**Cuando** la persona la usa y la envía
**Entonces** no puede seleccionar roles privilegiados ni asignar instituciones, y la solicitud no incluye esos datos.

### CA-03 — Confirmación después del registro
**Dado** un registro enviado y aceptado por el backend
**Cuando** se recibe la respuesta
**Entonces** se presenta una pantalla de confirmación que informa que debe revisar su correo electrónico para continuar con la verificación.

### CA-04 — Verificación y reenvío
**Dado** un enlace de verificación recibido por correo
**Cuando** la persona lo abre y confirma
**Entonces** el correo queda verificado mediante el servicio real.
**Y** la persona puede solicitar nuevamente el correo de verificación, también cuando el enlace venció o ya se usó.

### CA-05 — Cuenta pendiente de aprobación
**Dado** una cuenta que queda en estado PENDIENTE_APROBACION al verificar su correo
**Cuando** la verificación termina
**Entonces** la interfaz presenta un mensaje informativo y no permite acceder a las funcionalidades privadas.
**Y dado** que esa cuenta intenta iniciar sesión, **entonces** ve el mensaje genérico del backend y una orientación general, idénticos a los de cualquier otro rechazo de credenciales.

### CA-06 — Recuperación de contraseña
**Dado** la pantalla para solicitar la recuperación y la pantalla para establecer una nueva contraseña
**Cuando** la persona solicita el enlace y lo abre desde su correo
**Entonces** puede establecer una nueva contraseña con el token del enlace, mediante los servicios reales.

### CA-07 — Inicio y cierre de sesión reales
**Dado** una cuenta habilitada
**Cuando** inicia o cierra sesión
**Entonces** ambas acciones se realizan mediante los servicios reales del backend, y tras cerrar sesión las rutas privadas dejan de estar disponibles.

### CA-08 — Estado y recuperación de la sesión
**Dado** una sesión iniciada
**Cuando** se recarga el navegador
**Entonces** la aplicación recupera la sesión mediante el mecanismo de renovación de HT-AUTH-01 y mantiene el estado de autenticación.

### CA-09 — Rutas privadas protegidas
**Dado** una ruta privada
**Cuando** intenta entrar una persona sin autenticar o una cuenta que no está ACTIVA
**Entonces** no se le da acceso; únicamente pueden entrar usuarios autenticados con cuenta ACTIVA.

### CA-10 — Validaciones, errores y carga
**Dado** cualquier formulario del módulo
**Cuando** se ingresan datos inválidos, se está enviando o el backend responde con un error HTTP
**Entonces** presenta validaciones, mensajes de error y estados de carga, y gestiona adecuadamente la respuesta.

### CA-11 — Desafío CAPTCHA
**Dado** que el backend solicita un desafío CAPTCHA
**Cuando** se presenta el intento de inicio de sesión
**Entonces** la interfaz presenta el componente de Cloudflare Turnstile y envía la respuesta según el contrato establecido.

### CA-12 — Adaptación y teclado
**Dado** cualquier pantalla del módulo
**Cuando** se usa en un dispositivo móvil o de escritorio, o solo con teclado
**Entonces** la interfaz se adapta correctamente y permite la navegación completa.

### CA-13 — Pruebas automatizadas
**Dado** los flujos principales del módulo
**Cuando** se ejecutan las pruebas automatizadas
**Entonces** verifican su funcionamiento y su integración con el backend.

### CA-14 — Activación de cuenta
**Dado** un enlace de activación generado por el backend hacia `/activar-cuenta`
**Cuando** la persona lo abre, define una contraseña que cumple la política y confirma
**Entonces** la cuenta se activa mediante el endpoint real de activación y se le invita a iniciar sesión.
**Y** abrir el enlace no consume el token, y el flujo no usa el endpoint ni los textos de recuperación de contraseña.
**Y dado** un enlace no válido, **entonces** ve un mensaje que le indica pedir un enlace nuevo, sin remitirlo a la recuperación de contraseña.

### CA-15 — Destino tras iniciar sesión
**Dado** un inicio de sesión exitoso
**Cuando** no había una ruta privada solicitada, o la solicitada no es una ruta interna válida
**Entonces** la persona llega a la vista básica `/inicio`.
**Y dado** que había solicitado una ruta privada interna válida, **entonces** regresa a esa ruta.

## 11. Requisitos no funcionales
- **RNF-01:** accesibilidad básica: los cambios de estado se anuncian, el foco se mueve al resultado o al primer campo con error, el texto es legible al 200 % de zoom y ningún estado depende solo del color. Respaldo: requisito «comprobar la accesibilidad básica» (§14), HT-AUTH-01 §6.4 y `PRODUCT.md`.
- **RNF-02:** política de contraseña publicada: de 12 a 128 caracteres, sin reglas de composición, con pegado y gestores permitidos. Respaldo: HT-AUTH-01 (política de contraseña y `password-policy.ts`).
- **RNF-03:** la interfaz está en español (Colombia). Respaldo: `PRODUCT.md`, compromisos de marca.
- **RNF-04:** el comportamiento de la conexión de mismo origen y de la cookie de renovación en `localhost` está verificado, con pruebas de compatibilidad entre navegadores y su resultado documentado. Respaldo: correcciones del desarrollador del 2026-11-05 (§14).

## 12. OPEN QUESTIONS
- [x] ~~**Identidad visual.**~~ **Resuelta (2026-11-05):** dirección visual sencilla y consistente para este módulo y `DESIGN.md` limitado a él, sin inventar una identidad corporativa global.
- [x] ~~**PENDIENTE_APROBACION (CA-05).**~~ **Resuelta (2026-11-05):** se muestra después de la verificación del correo. En el inicio de sesión se conserva el mensaje genérico del backend, con una orientación general que no revela el estado de ninguna cuenta (RN-09).
- [x] ~~**Correo en los datos de sesión.**~~ **Resuelta (2026-11-05):** se respeta el contrato de `GET /api/v1/auth/me`; la interfaz no depende del correo ni del nombre de la institución.
- [x] ~~**Activación del primer administrador.**~~ **Resuelta (2026-11-05):** se incorpora `/activar-cuenta` con el endpoint real, como flujo propio y distinto de la recuperación (CA-14, RN-15).
- [x] ~~**Ruta tras iniciar sesión.**~~ **Resuelta (2026-11-05):** vista básica `/inicio` como destino predeterminado (CA-15).
- [x] ~~**Retorno tras iniciar sesión.**~~ **Resuelta (2026-11-05):** se permite regresar únicamente a rutas internas válidas (CA-15, RN-16).
- [x] ~~**Rutas públicas.**~~ **Resuelta (2026-11-05):** `/iniciar-sesion`, `/registro`, `/revisa-tu-correo`, `/reenviar-verificacion`, `/olvide-contrasena` y `/activar-cuenta`, además de `/verificar-correo` y `/restablecer-contrasena`, que fija el backend.

Sin OPEN QUESTIONS abiertas.

## 13. Checklist de spec lista (`status: ready`)
- [x] Objetivo, alcance y fuera de alcance claros.
- [x] Reglas de negocio numeradas (RN-NN).
- [x] Criterios de aceptación verificables (CA-NN).
- [x] Sin OPEN QUESTIONS que cambien el comportamiento observable (o resueltas con el responsable funcional y registradas en §14).
- [x] Todo requisito respaldado por `docs/requisitos/` o una decisión registrada.

## 14. Registro de cambios y aclaraciones
Mantener los IDs `RN`/`CA`/`RNF` estables: no renumerar. Un criterio retirado se marca `~~CA-NN~~ (retirado: motivo)`.

**Requisitos aportados por JulianD27-ia, 2026-11-05 (resumen de lo que no está en otras secciones):**
- **Definition of Done:** todas las pantallas implementadas; formularios conectados con el backend real; registro, verificación, login, logout y recuperación funcionando; renovación y restauración según HT-AUTH-01; rutas privadas protegidas; CAPTCHA según el contrato de Turnstile; errores y carga correctos; tokens y credenciales seguros; escritorio y móvil; pruebas principales en verde; configuración y ejecución documentadas.
- **Tareas aportadas (ajustadas el 2026-11-05):** T-01 preparación e integración; T-02 servicio API y gestión de sesión; T-03 registro y verificación; T-04 inicio de sesión y protección de rutas; T-05 recuperación y activación de cuenta; T-06 pruebas y ajustes finales. Son las únicas tareas de `tasks.md`; las actividades se agrupan dentro de ellas.
- **Restricciones de ejecución:** no modificar HT-AUTH-01; no crear endpoints; no implementar aprobación ni administración; no inventar DTO, rutas, variables ni configuraciones; sin commits, push ni PR; no cambiar de rama sin autorización; no implementar antes de aprobar spec y plan.

| Fecha | Cambio / aclaración | Fuente o persona consultada |
|---|---|---|
| 2026-11-05 | Creación con `/sdd-spec`. CA-01..CA-13 transcriben CA-AUTH-02-01..13. RN-01..RN-14 provienen de la sección de seguridad y las restricciones aportadas y de los controles heredados por `HT-AUTH-01/DEC-23`. §6.5 hereda el brief de HT-AUTH-01 §6.4. Diferencias con el código registradas en §2 y §12. | Requisitos aportados por JulianD27-ia, 2026-11-05 |
| 2026-11-05 | **Decisiones del desarrollador tras la primera revisión.** Identidad visual limitada al módulo; PENDIENTE_APROBACION tras verificar y orientación general en el inicio de sesión (RN-09 y CA-05 ajustados); contrato de `GET /api/v1/auth/me` respetado; **nueva** activación de cuenta (§6.6, CA-14, RN-15); **nueva** vista `/inicio` y retorno solo a rutas internas (CA-15, RN-16); **nuevo** RNF-04 por la verificación de proxy y cookies en `localhost`. Seis OPEN QUESTIONS cerradas. Ningún ID cambia de número. El brief ya no reutiliza «Crear nueva contraseña» para activar. | Decisiones y correcciones de JulianD27-ia, 2026-11-05 |
| 2026-11-05 | **Segunda ronda de aprobaciones.** Rutas públicas aprobadas; despliegue de producción fuera de alcance, solo documentado; `CAPTCHA_SITE_KEY` se conserva en la plantilla de HT-AUTH-01. §2 y §3: HT-AUTH-01 ya está en `develop` (PR #4). §12 sin preguntas abiertas y §13 completo. **El estado sigue en `draft`** hasta la confirmación del desarrollador. Sin cambios en CA, RN ni RNF. | Aprobaciones de JulianD27-ia, 2026-11-05 |
| 2026-11-05 | **draft → ready**, autorizado de forma expresa por el desarrollador tras revisar el checklist §13 | Confirmación de JulianD27-ia, 2026-11-05 |
| 2026-11-07 | **in-progress → in-review**, autorizado por el desarrollador para el cierre de la historia. Revisión de completitud: 15 CA, 16 RN y 4 RNF definidos; §12 sin preguntas abiertas; §13 completo. El rediseño visual (plan §2.7) no cambia CA, RN, RNF, textos ni flujos de esta spec. `plan.md` sigue en `draft` hasta la aprobación expresa del desarrollador | Autorización de JulianD27-ia, 2026-11-07 |
