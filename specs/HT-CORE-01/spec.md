---
id: HT-CORE-01
title: Base técnica, servicios locales y gestión de cuentas (RBAC)
status: in-progress            # draft | ready | in-progress | in-review | done
owner: JulianD27-ia
branch: feature/HT-CORE-01
updated: 2026-10-22
---

# HT-CORE-01 — Base técnica, servicios locales y gestión de cuentas (RBAC)

> **spec.md describe QUÉ se construye y POR QUÉ.** El CÓMO (archivos, scripts, colecciones, índices, endpoints, contratos y pruebas) va en `plan.md`.
> Fuente: requisitos aportados por JulianD27-ia el 2026-10-22 (ver §14). No inventar requisitos ni criterios.
> Historia única con dos bloques: **A** (base técnica y entorno local) y **B** (cuentas, acceso y RBAC; antes HT-AUTH-01).
> Generado por `/sdd-spec` junto con `plan.md` y `tasks.md`, en estado `draft`. Solo el desarrollador responsable cambia el estado a `ready`, tras revisar el checklist §13.

## 1. Objetivo
- **Bloque A:** como integrante del equipo de desarrollo, quiero una base local reproducible y segura con MongoDB, Redis, variables de entorno documentadas y el flujo SDD identificado, para desarrollar e integrar API, persistencia, colas, frontend y OMR sin exponer secretos.
- **Bloque B:** como persona que necesita acceder a OMR-PreICFES, quiero crear una cuenta, verificar mi correo, iniciar y cerrar sesión y recuperar mi contraseña, para utilizar de forma segura las funciones que tengo autorizadas (HU-AUTH-001).

Ambos bloques forman una sola historia por decisión del responsable (ver §14). El Bloque A es prerrequisito del Bloque B.

## 2. Contexto y fuentes
**Bloque A — Base técnica y entorno local**

- **Tipo:** historia técnica transversal. Habilita a todas las historias del [roadmap](../roadmap.md).
- **Fuente:** «Requisitos aportados por JulianD27-ia el 2026-10-22» (objetivo, criterios, tareas de backend/servicios y frontend, contratos, DoD, seguridad, dependencias y decisiones pendientes). Ver §14.
- **Situación del repositorio en `develop` (verificada el 2026-10-22):**
  - `docker-compose.yml` define `mongo` (MongoDB 7 standalone, con healthcheck) y `redis` (Redis 7 con AOF, **sin healthcheck**). Ambos publican sus puertos solo en `127.0.0.1` y usan volúmenes con nombre. `api`, `omr` y `web` están detrás del perfil `app`.
  - `.env.docker.example` solo contiene marcadores `cambiar_*`. `.gitignore` excluye `.env`, `.env.*` y `*.env`.
  - Existen `README_SETUP.md`, `docs/onboarding/00..05`, `scripts/docker-up.ps1`, `docker-down.ps1`, `docker-reset.ps1` y `sdd-validate.ps1`.
  - **`apps/api`, `apps/web` y `apps/omr` no existen**. Su creación es la decisión transversal DT-01. Hay plantillas en `docker/templates/`.
- **Antecedente:** existe la rama remota `origin/feature/HT-CORE-01` (otro responsable, 2026-10-10), sin fusionar en `develop`. Esta spec se generó de nuevo por decisión del responsable actual. El equipo debe conciliar ambas ramas antes del PR (ver §12).
- Esta historia **consolida y verifica** la base existente. No rediseña la infraestructura.

**Bloque B — Cuentas, acceso y RBAC (antes HT-AUTH-01)**

- **Historia de negocio relacionada:** HU-AUTH-001 (texto aportado; aún no existe documento en `docs/requisitos/`).
- **Tipo:** historia técnica. Implementa el ciclo de vida de la cuenta **antes** de exponer información académica.
- **Fuente:** «Requisitos aportados por JulianD27-ia el 2026-10-22» (objetivo técnico, CA-AUTH-01..12, tareas de backend y frontend, modelo propuesto, contratos, DoD, seguridad, dependencias y decisiones pendientes). Ver §14.
- **Relación con decisiones transversales:** materializa DT-04 (Autenticación y RBAC), hoy pendiente. La arquitectura canónica indica «JWT/OIDC, RBAC, logs sin datos personales innecesarios». La estrategia de sesión, el proveedor de correo y la integración deben alinearse con ella sin presuponer un framework no confirmado.
- **Mapeo de IDs:** los criterios aportados como `CA-AUTH-NN` se registran como CA-09 = CA-AUTH-01 … CA-20 = CA-AUTH-12, a continuación de los del Bloque A y por compatibilidad con `scripts/sdd-validate.ps1`. Las RN del Bloque B son RN-07..RN-19 y sus RNF, RNF-02..RNF-07.
- **Situación del repositorio (2026-10-22):** no existen `apps/api` ni `apps/web` (DT-01). No hay colección de usuarios ni roles definidos. HU-EVAL-001 usa los roles DOCENTE y ADMIN; los requisitos de esta historia mencionan Admin y Coordinador.

## 3. Alcance
**Bloque A — Base técnica y entorno local**

### Incluye
- Revisar `README_SETUP.md`, `docs/onboarding/03-flujo-sdd.md`, `docs/onboarding/02-variables-entorno.md` y `.claude/skills/`, y corregir lo que no coincida con el repositorio real.
- Obtener el `.env` local desde la plantilla cuando no exista, manteniendo los secretos fuera de Git.
- Comprobar que Git ignora `.env`.
- Validar la configuración de Docker Compose y arrancar MongoDB y Redis cuando Docker Engine esté operativo.
- Verificar el estado de los servicios con su estado y sus logs.
- Documentar los comandos de inicio, comprobación y apagado seguro.
- Confirmar la estructura real de `apps/api` y `apps/web` antes de cualquier scaffolding.
- Dejar identificadas, para que el equipo las defina, las convenciones de lint, formato, pruebas y variables públicas/privadas del frontend.
- Instrucciones breves para configurar el entorno local.

### Fuera de alcance
- Crear el scaffolding de `apps/api`, `apps/web` o `apps/omr` (DT-01).
- Endpoints funcionales. El health check de las aplicaciones se definirá según la implementación.
- Replica set de MongoDB (DT-02), GridFS (DT-03), colas (DT-06) y migraciones (DT-07).
- Configurar CI y la protección de ramas (DT-08).
- Decidir las convenciones del frontend: esta historia solo las identifica y les asigna responsable.

### Supuestos
- Cada desarrollador tiene Docker Desktop (o Docker sobre WSL) con Compose v2 y el motor en ejecución.
- Cada desarrollador usa credenciales locales propias que no se comparten.
- El sistema de referencia del equipo es Windows con PowerShell (los scripts existentes son `.ps1`).

**Bloque B — Cuentas, acceso y RBAC (antes HT-AUTH-01)**

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

### Fuera de alcance
- Pantallas y operaciones administrativas para aprobar cuentas o asignar institución y rol (ver OPEN QUESTIONS). En las pruebas se usan datos sembrados.
- Creación y envío de invitaciones. Esta historia solo garantiza que, si una invitación validada existe, el rol y la institución provienen del servidor.
- Inicio de sesión con proveedores externos (OIDC/SSO), segundo factor y cambio de contraseña desde el perfil con sesión iniciada.
- Gestión de instituciones.
- Diseño visual del sistema (HU-UX-001). Esta historia define los estados, textos y la accesibilidad de las pantallas de cuenta.

### Supuestos
- El Bloque A deja disponibles MongoDB y Redis en local.
- DT-01 resuelve la creación de `apps/api` y `apps/web` antes de implementar.
- Existe un medio de prueba de correo que no entrega mensajes reales (pendiente de decisión).

## 4. Dependencias funcionales
**Bloque A — Base técnica y entorno local**

- Ninguna historia previa.
- Acceso a Docker Desktop/WSL configurado y archivos de setup del repositorio disponibles (requisito aportado).
- Es requisito previo de todas las historias (HU-EVAL-*, HU-UX-001, OMR-*).

**Bloque B — Cuentas, acceso y RBAC (antes HT-AUTH-01)**

- Bloque A de esta historia (base local).
- Catálogo de roles y permisos, y responsable de aprobar cuentas (OPEN QUESTION).
- Concepto de institución: al menos un identificador para el alcance (DT-09, entidades base).
- Proveedor de correo institucional o servicio SMTP/API, y dominios permitidos para los enlaces.

## 5. Reglas de negocio e invariantes
**Bloque A — Base técnica y entorno local**

- **RN-01:** `.env` nunca se versiona. La plantilla `.env.docker.example` solo contiene marcadores, sin secretos.
- **RN-02:** si `.env` ya existe, no se sobrescribe: se integran las variables nuevas.
- **RN-03:** no se ejecuta `docker compose down -v` (ni otra eliminación de volúmenes) en entornos con datos que deban conservarse. El apagado habitual conserva los datos.
- **RN-04:** no se registran URI de conexión completas ni contraseñas en logs, documentación, specs, PR ni salidas de consola compartidas.
- **RN-05:** no se crea scaffolding sin confirmar antes la estructura real de `apps/api` y `apps/web`.
- **RN-06:** toda variable nueva se agrega a la plantilla con un marcador y se documenta en `docs/onboarding/02-variables-entorno.md` (regla vigente del repositorio).

**Bloque B — Cuentas, acceso y RBAC (antes HT-AUTH-01)**

- **RN-07:** una cuenta tiene uno de estos estados: PENDIENTE_VERIFICACION, PENDIENTE_APROBACION, ACTIVA, BLOQUEADA o DESACTIVADA. El registro propio crea la cuenta en PENDIENTE_VERIFICACION. Al verificar el correo, una cuenta de registro propio pasa a PENDIENTE_APROBACION hasta que un administrador asigne institución y rol.
- **RN-08:** el rol y la institución nunca se toman del cliente. Solo los define una invitación validada o un administrador autorizado. El registro propio crea cuentas sin permisos institucionales.
- **RN-09:** el correo se normaliza antes de guardarlo y compararlo, y el correo normalizado es único: una solicitud repetida no crea cuentas duplicadas.
- **RN-10:** las respuestas públicas de registro, reenvío de verificación, «olvidé mi contraseña» e inicio de sesión no permiten saber si una cuenta existe ni en qué estado está.
- **RN-11:** la contraseña se guarda solo como hash adaptativo seguro. Nunca aparece en texto plano en la base de datos, los logs, las respuestas de la API ni las herramientas de analítica.
- **RN-12:** los tokens de verificación y de restablecimiento son aleatorios, de alta entropía y de un solo uso, y tienen un propósito y una expiración. Solo se guarda su hash y el token crudo solo viaja por correo. Un token nuevo invalida los anteriores del mismo propósito y usuario. La expiración se comprueba siempre al validar.
- **RN-13:** solo una cuenta con el correo verificado, en estado ACTIVA y no bloqueada puede iniciar sesión y consultar datos protegidos.
- **RN-14:** al restablecer la contraseña se consume el token, se revocan todas las sesiones existentes de la cuenta y se avisa por correo del cambio.
- **RN-15:** los intentos de registro, inicio de sesión, verificación, reenvío y recuperación se limitan por cuenta, IP y ventana de tiempo.
- **RN-16:** las rutas privadas validan en el backend la autenticación y el permiso según rol, institución y alcance del recurso. Ocultar opciones en la interfaz no sustituye esa validación.
- **RN-17:** cerrar sesión revoca o invalida la sesión según la estrategia aprobada.
- **RN-18:** los eventos de seguridad se auditan sin guardar contraseñas, tokens crudos ni datos personales innecesarios.
- **RN-19:** los enlaces de los correos se construyen solo a partir de un dominio permitido configurado. Nunca se toman de la solicitud, para evitar redirecciones abiertas.

## 6. Flujo funcional
**Bloque A — Base técnica y entorno local**

1. El desarrollador clona el repositorio y trabaja en su rama según el flujo SDD.
2. Si no tiene `.env`, lo crea desde la plantilla y reemplaza los marcadores por valores propios (RN-01, RN-02).
3. Comprueba que Git ignora `.env`.
4. Valida la configuración de Compose sin arrancar nada.
5. Arranca MongoDB y Redis.
6. Comprueba el estado de los servicios y revisa sus logs sin exponer credenciales (RN-04).
7. Trabaja con los servicios.
8. Apaga los servicios conservando los datos (RN-03).

**Bloque B — Cuentas, acceso y RBAC (antes HT-AUTH-01)**

### 6.1 Registro y verificación
1. La persona abre **Registro**, ingresa nombre, correo y contraseña, y envía el formulario.
2. El sistema valida los datos y responde siempre con el mismo mensaje: «Si el correo puede registrarse, te enviamos un enlace de verificación». Muestra **Revisa tu correo** (RN-10).
3. Si el correo no estaba registrado, se crea la cuenta en PENDIENTE_VERIFICACION y se envía el enlace (RN-07, RN-12).
4. La persona abre el enlace: **Verificar correo** consume el token. Una cuenta de registro propio queda en PENDIENTE_APROBACION y ve un mensaje que explica que un administrador debe habilitarla.
5. Si el enlace venció o ya se usó, ve un mensaje claro y la opción **Reenviar verificación** (RN-12).

### 6.2 Inicio y cierre de sesión
1. **Login** pide correo y contraseña. Solo una cuenta verificada, ACTIVA y no bloqueada entra (RN-13). Cualquier otro caso recibe el mismo error genérico.
2. Con la sesión iniciada, la aplicación consulta la identidad de la sesión para decidir la navegación privada. Las rutas privadas sin sesión válida llevan a Login.
3. **Cerrar sesión** invalida la sesión y limpia el estado del cliente (RN-17).

### 6.3 Recuperación de contraseña
1. **Olvidé mi contraseña** pide el correo y siempre muestra el mismo mensaje genérico (RN-10).
2. Si la cuenta es elegible, recibe un enlace de restablecimiento de un solo uso.
3. **Crear nueva contraseña** valida el token y la nueva contraseña. Al guardar, revoca todas las sesiones, envía el aviso de cambio y permite iniciar sesión con la nueva contraseña (RN-14).
4. Si el enlace venció o ya se usó, ve un mensaje claro y la opción de pedir uno nuevo.

### 6.4 Experiencia de las pantallas (aplicando la guía `impeccable`: harden y clarify)
- **Mensajes genéricos pero accionables:** la seguridad exige no revelar si la cuenta existe (RN-10), pero cada mensaje dice qué hacer después. Por ejemplo: «Revisa tu bandeja de entrada y spam. Si no llega en unos minutos, puedes pedir otro enlace».
- **Errores de validación en línea**, junto al campo, asociados al campo para lectores de pantalla, y **conservando lo escrito** (salvo la contraseña tras un envío fallido).
- **Contraseña:** permitir pegar y el autocompletado de gestores, mostrar u ocultar la contraseña, y publicar la política junto al campo antes del primer error (RNF-03).
- **Estados explícitos** en cada pantalla: en reposo, enviando (botón deshabilitado con indicador y sin doble envío), éxito, error de validación, enlace vencido o usado, demasiados intentos (429, con indicación de cuándo reintentar) y error de red (con opción de reintentar).
- **Accesibilidad:** los cambios de estado se anuncian, el foco se mueve al mensaje de resultado o al primer campo con error, todo funciona con teclado y el texto es legible al 200 % de zoom (RNF-06).
- **Sin selección de rol ni institución** en el formulario público (RN-08).

## 7. Estados y situaciones de negocio
**Bloque A — Base técnica y entorno local**

| Estado / situación | Significado | Qué ve o puede hacer el desarrollador |
|---|---|---|
| Docker no operativo | El motor de Docker no está en ejecución | Los comandos de Compose fallan. Debe iniciar Docker Desktop y repetir. |
| Sin `.env` | Primera configuración | Crea `.env` desde la plantilla. |
| Configuración inválida | Falta una variable obligatoria o hay un error de sintaxis | La validación de Compose falla e indica la causa, sin mostrar valores secretos. |
| Servicios en arranque | Los contenedores existen, pero aún no responden | Espera a que el estado indique disponibilidad. |
| Servicios disponibles | MongoDB y Redis responden | Puede desarrollar e integrar. |
| Servicios detenidos | Apagado seguro | Los datos se conservan en los volúmenes. |

**Bloque B — Cuentas, acceso y RBAC (antes HT-AUTH-01)**

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
**Bloque A — Base técnica y entorno local**

| Rol | Puede |
|---|---|
| Desarrollador del equipo | Configurar su `.env`, arrancar, verificar y apagar los servicios locales. |
| Equipo (decisión colectiva) | Definir la estructura del monorepo, las convenciones de frontend y los comandos que exige CI. |

**Bloque B — Cuentas, acceso y RBAC (antes HT-AUTH-01)**

| Rol | Puede |
|---|---|
| Visitante (sin sesión) | Registrarse, verificar el correo, pedir reenvío, iniciar sesión, pedir y completar la recuperación. |
| Usuario autenticado (cualquier rol ACTIVO) | Consultar su propia identidad de sesión y cerrar sesión. |
| Administrador | Aprobar cuentas y asignar institución y rol (operación fuera de alcance; ver §12). |
| Roles institucionales (p. ej. Coordinador, Docente) | Lo que defina el catálogo de permisos, siempre dentro de su institución (catálogo pendiente). |

## 9. Datos de negocio involucrados
**Bloque A — Base técnica y entorno local**

- Credenciales locales de MongoDB (usuario y contraseña): **secretas**. Solo viven en `.env`.
- Nombre de base de datos, puertos y URIs con marcadores: no secretos en la plantilla.
- No se manejan datos personales de estudiantes ni de usuarios.

**Bloque B — Cuentas, acceso y RBAC (antes HT-AUTH-01)**

- **Cuenta:** nombre (**personal**), correo (**personal**), estado, rol, institución, fecha de verificación del correo, fechas de creación, actualización, último acceso y último cambio de credenciales.
- **Credencial:** solo el hash de la contraseña (secreto).
- **Token de seguridad:** propósito (VERIFICAR_CORREO o RESTABLECER_PASSWORD), hash del token, expiración y uso (secreto; nunca crudo).
- **Sesión:** identificador revocable y vigencia (depende de la estrategia aprobada).
- **Evento de auditoría:** tipo de evento, cuenta (por identificador), fecha, resultado y origen técnico mínimo (sin contraseñas, tokens ni datos personales innecesarios).

## 10. Criterios de aceptación
**Bloque A — Base técnica y entorno local**

### CA-01 — La configuración de Compose se valida
**Dado** un `.env` creado desde la plantilla  
**Cuando** el desarrollador valida la configuración de Docker Compose  
**Entonces** la validación termina sin errores y sin imprimir valores secretos.

### CA-02 — MongoDB y Redis arrancan
**Dado** Docker Engine operativo y la configuración válida  
**Cuando** el desarrollador arranca los servicios base  
**Entonces** se inician solo MongoDB y Redis, y ambos quedan disponibles.

### CA-03 — Variables desde la plantilla sin publicar secretos
**Dado** un repositorio recién clonado  
**Cuando** el desarrollador obtiene sus variables locales desde la plantilla  
**Entonces** `.env` existe solo en su máquina, Git lo ignora y ningún archivo versionado contiene secretos reales.

### CA-04 — Estado verificable con estado y logs
**Dado** los servicios arrancados  
**Cuando** el desarrollador consulta el estado de los servicios y sus logs  
**Entonces** puede confirmar que MongoDB y Redis están disponibles, y los logs no muestran contraseñas ni URIs completas.

### CA-05 — Flujo y convenciones SDD identificados
**Dado** un desarrollador nuevo en el equipo  
**Cuando** consulta las instrucciones de configuración local  
**Entonces** encuentra enlazados el flujo SDD, las plantillas, las skills del proyecto y las convenciones de Git, y todos los enlaces abren documentos existentes.

### CA-06 — Apagado seguro documentado
**Dado** servicios con datos que deben conservarse  
**Cuando** el desarrollador sigue el procedimiento de apagado documentado  
**Entonces** los servicios se detienen sin eliminar los volúmenes, y la documentación advierte sobre la eliminación de datos.

### CA-07 — Procedimiento repetible
**Dado** una máquina de desarrollo compatible (Docker Desktop/WSL)  
**Cuando** otro integrante sigue las instrucciones documentadas desde cero  
**Entonces** obtiene los servicios disponibles sin pasos no documentados y sin exponer secretos.

### CA-08 — Estructura de apps y convenciones de frontend identificadas
**Dado** que se va a crear scaffolding de aplicaciones  
**Cuando** se consulta la documentación del proyecto  
**Entonces** queda registrada la estructura real de `apps/api` y `apps/web`, y las convenciones de frontend pendientes (lint, formato, pruebas y variables públicas/privadas) figuran como decisiones de equipo con su dependencia técnica asociada.

**Bloque B — Cuentas, acceso y RBAC (antes HT-AUTH-01)**

### CA-09 — Registro crea cuenta pendiente sin privilegios (CA-AUTH-01)
**Dado** el formulario de registro con nombre, correo y contraseña válidos  
**Cuando** la persona lo envía, aunque incluya en la solicitud campos de rol o institución  
**Entonces** el backend valida los datos, normaliza el correo y crea la cuenta en PENDIENTE_VERIFICACION sin rol privilegiado ni institución.

### CA-10 — Correo único y sin enumeración (CA-AUTH-02)
**Dado** un correo ya registrado (incluso con distintas mayúsculas o espacios)  
**Cuando** se repite el registro, incluso en solicitudes simultáneas  
**Entonces** no se crea una cuenta duplicada y la respuesta pública es idéntica a la de un correo nuevo.

### CA-11 — Política y hash de contraseña (CA-AUTH-03)
**Dado** una contraseña que cumple la política publicada  
**Cuando** se registra o se restablece  
**Entonces** se guarda solo como hash adaptativo seguro (Argon2id o equivalente aprobado), y la contraseña en texto plano no aparece en la base de datos, los logs ni las respuestas.  
**Y dado** una contraseña que no cumple la política, **entonces** se rechaza con un mensaje que indica la política.

### CA-12 — Verificación de un solo uso con expiración (CA-AUTH-04)
**Dado** una cuenta recién registrada  
**Cuando** el sistema envía la verificación  
**Entonces** el enlace o código contiene un token aleatorio de alta entropía, solo se guarda su hash y vence según la configuración (valor inicial propuesto: 24 horas).  
**Y** un token vencido o ya usado es rechazado.

### CA-13 — Acceso solo para cuentas habilitadas (CA-AUTH-05)
**Dado** una cuenta con el correo sin verificar o en un estado distinto de ACTIVA  
**Cuando** intenta iniciar sesión o consultar datos protegidos  
**Entonces** se le niega el acceso.  
**Y dado** una cuenta de registro propio que verifica su correo, **entonces** pasa a PENDIENTE_APROBACION hasta que un administrador asigne institución y rol.  
**Y dado** un registro con una invitación autorizada, **entonces** el rol y la institución se toman de la invitación en el servidor.

### CA-14 — Reenvío de verificación limitado y sin enumeración (CA-AUTH-06)
**Dado** una persona que pide un nuevo correo de verificación  
**Cuando** lo solicita  
**Entonces** se invalida el token anterior y se envía uno nuevo si corresponde. La respuesta es la misma exista o no la cuenta, y se aplica un límite de frecuencia.

### CA-15 — Inicio de sesión con errores genéricos (CA-AUTH-07)
**Dado** un correo y una contraseña  
**Cuando** se intenta iniciar sesión  
**Entonces** solo se acepta si las credenciales son válidas y la cuenta está verificada, ACTIVA y no bloqueada. Los casos de correo inexistente, contraseña incorrecta o cuenta no habilitada reciben la misma respuesta genérica.

### CA-16 — Solicitud de recuperación genérica (CA-AUTH-08)
**Dado** cualquier correo  
**Cuando** se usa «Olvidé mi contraseña»  
**Entonces** la respuesta es siempre el mismo mensaje genérico. Si la cuenta es elegible, se envía un enlace de restablecimiento de un solo uso (valor inicial propuesto: 30 minutos), con el token guardado como hash y sin aparecer en los logs.

### CA-17 — Restablecimiento revoca sesiones (CA-AUTH-09)
**Dado** un token de restablecimiento válido, vigente y no usado  
**Cuando** se crea una nueva contraseña  
**Entonces** el token se consume, se revocan las sesiones existentes de la cuenta y es posible iniciar sesión con la nueva contraseña (y no con la anterior).  
**Y dado** un token inválido, vencido o usado, **entonces** el restablecimiento se rechaza.

### CA-18 — Tokens de un solo uso y límites de intentos (CA-AUTH-10)
**Dado** un token de verificación o recuperación  
**Cuando** se intenta usar por segunda vez, o después de emitir otro del mismo propósito  
**Entonces** se rechaza.  
**Y** los intentos se limitan por cuenta, IP y ventana de tiempo, y el exceso recibe una respuesta de límite excedido.

### CA-19 — Autorización en backend (CA-AUTH-11)
**Dado** un usuario autenticado  
**Cuando** llama directamente a una ruta privada para la que su rol, su institución o el alcance del recurso no lo autorizan  
**Entonces** el backend deniega el acceso, aunque la interfaz no muestre esa opción. Sin sesión válida, la respuesta es de no autenticado.

### CA-20 — Cierre de sesión y auditoría (CA-AUTH-12)
**Dado** una sesión activa  
**Cuando** el usuario cierra sesión  
**Entonces** la sesión o el token queda invalidado y ya no sirve para rutas privadas.  
**Y** los eventos de registro, verificación, inicio y cierre de sesión, recuperación y restablecimiento se auditan sin contraseñas, tokens crudos ni datos personales innecesarios.

## 11. Requisitos no funcionales
**Bloque A — Base técnica y entorno local**

- **RNF-01:** el procedimiento es repetible en una máquina de desarrollo compatible con Docker Desktop o WSL (DoD aportado).

**Bloque B — Cuentas, acceso y RBAC (antes HT-AUTH-01)**

- **RNF-02:** hash adaptativo aprobado: Argon2id o un equivalente aprobado.
- **RNF-03:** política de contraseña propuesta: mínimo 12 caracteres, con soporte para frases de contraseña y gestores. Se permite pegar. No se imponen reglas arbitrarias de composición salvo que lo exija la política institucional.
- **RNF-04:** HTTPS en todos los despliegues.
- **RNF-05:** los vencimientos son configurables (valores iniciales propuestos: verificación 24 h y recuperación 30 min), así como los límites por IP y por cuenta.
- **RNF-06:** las pantallas de cuenta tienen estados de carga y error accesibles (anuncio de cambios, gestión del foco y uso con teclado).
- **RNF-07:** si se eligen cookies, hay protección contra CSRF; si se eligen tokens, su almacenamiento, expiración y revocación son seguros y están documentados.

## 12. OPEN QUESTIONS
**Bloque A — Base técnica y entorno local**

- [ ] ¿Cuál es la estructura final del monorepo (pnpm workspaces o carpetas independientes, paquete de tipos compartidos)? → DT-01.
- [ ] ¿Qué comandos de test y lint exige CI? → DT-08.
- [ ] ¿Quién define las convenciones de frontend (lint, formato, pruebas, variables públicas/privadas) y en qué historia se implementan?
- [ ] ¿Cómo se concilia esta rama con `origin/feature/HT-CORE-01` (implementación previa de otro responsable): se sustituye, se fusiona o se renombra esta rama?

**Bloque B — Cuentas, acceso y RBAC (antes HT-AUTH-01)**

- [ ] ¿El registro propio estará habilitado para todos o solo mediante invitación? Propuesta aportada: permitir la solicitud propia pendiente de aprobación y mantener la invitación para roles institucionales.
- [ ] ¿Qué roles y permisos finales existen (ADMIN, COORDINADOR, DOCENTE…)? ¿Quién aprueba la asignación de institución y rol? ¿En qué historia se construyen la aprobación y las invitaciones?
- [ ] ¿Qué proveedor de correo se usará y cómo se probará el envío local sin distribuir mensajes reales?
- [ ] ¿Cookie de sesión segura o token? Documentar la expiración, CSRF, renovación y revocación (ver plan DEC-05).
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

| Fecha | Cambio / aclaración | Fuente o persona consultada |
|---|---|---|
| 2026-10-22 | Creación con `/sdd-spec`. CA-01 y CA-02 provienen del criterio «Docker Compose puede validar su configuración y arrancar MongoDB y Redis»; CA-03 del criterio de variables y del DoD (`.env` ignorado); CA-04 del criterio de `ps` y logs, más la regla de seguridad sobre logs; CA-05 del criterio SDD; CA-06 de la tarea «documentar apagado seguro» y la regla de seguridad sobre `down -v`; CA-07 y RNF-01 del DoD «repetible»; CA-08 de las tareas de frontend. | Requisitos aportados por JulianD27-ia, 2026-10-22 (guardado en `docs/requisitos/historias/HT-CORE-01.md`) |
| 2026-10-22 | El responsable decidió generar de nuevo la historia aunque existe `origin/feature/HT-CORE-01`. | JulianD27-ia |
| 2026-10-22 | Creación con `/sdd-spec`. CA-09..CA-20 transcriben CA-AUTH-01..12. Las RN provienen de los criterios, las tareas de backend y la sección de seguridad aportadas. RNF-02..04 y RNF-07 provienen de la sección de seguridad; RNF-06 de las tareas de frontend. §6.4 aplica la guía `impeccable` (harden y clarify) sin agregar comportamiento de negocio. | Requisitos aportados por JulianD27-ia, 2026-10-22 (guardado en `docs/requisitos/historias/HT-CORE-01.md`) |
| 2026-10-22 | Fusión de HT-AUTH-01 en HT-CORE-01 como Bloque B. Los IDs del Bloque B se renumeraron una sola vez, antes de cualquier aprobación: CA +8, RN +6, RNF +1, T +12, DEC +4. Se eliminan `specs/HT-AUTH-01/` y la rama `feature/HT-AUTH-01`. | JulianD27-ia |
| 2026-10-22 | Spec revisada y aprobada por el responsable; inicio de implementación (Fase 0). | JulianD27-ia |
