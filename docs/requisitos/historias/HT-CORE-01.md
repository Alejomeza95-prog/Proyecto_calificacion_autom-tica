# HT-CORE-01 — Base técnica, configuración y servicios locales (documento fuente)

| Campo | Valor |
|---|---|
| Origen | Texto entregado por el responsable en una sesión de Claude Code (`/sdd-spec`), transcrito sin cambios de contenido |
| Fecha de registro | 2026-10-10 |
| Responsable | Diego Alejandro Narvaez Meza |
| Tipo | Historia técnica transversal |
| Datos personales / secretos | Ninguno |

---

**Historia relacionada:** Transversal a todas las historias

## Objetivo técnico
Dejar una base local reproducible y segura para que el equipo pueda desarrollar e integrar API, persistencia, colas, frontend y OMR.

## Criterios de aceptación
- Docker Compose puede validar su configuración y arrancar MongoDB y Redis.
- Las variables locales se obtienen desde la plantilla sin publicar secretos.
- El estado de los servicios puede verificarse con `docker compose ps` y logs.
- El flujo y las convenciones de SDD del repositorio están identificados.

## Tareas — Backend / servicios
- Revisar `README_SETUP.md`, `docs/onboarding/03-flujo-sdd.md`, `docs/onboarding/02-variables-entorno.md` y `.claude/skills/`.
- Crear `.env` desde `.env.docker.example` si no existe; mantener secretos fuera de Git.
- Validar `.gitignore` y comprobar `git check-ignore -v .env`.
- Validar `docker compose config --quiet` y arrancar mongo/redis cuando Docker Engine esté operativo.
- Documentar comandos de inicio, comprobación y apagado seguro.

## Tareas — Frontend
- Confirmar la estructura real de `apps/api` y `apps/web` antes de crear scaffolding.
- Definir con el equipo convenciones de lint, formato, pruebas y variables públicas/privadas del frontend.
- Crear instrucciones breves para configurar el entorno local.

## Modelo de datos / endpoints / contratos
- Configuración de entorno local y ejemplo sin secretos.
- Comandos: `docker compose config --quiet`; `docker compose up -d mongo redis`; `docker compose ps`.
- No aplica endpoints funcionales; el health check de servicios se definirá según implementación.

## Definition of Done (DoD)
- El equipo puede arrancar los servicios sin exponer secretos.
- Las variables de entorno están documentadas y `.env` permanece ignorado por Git.
- El procedimiento se puede repetir en una máquina de desarrollo compatible.

## Seguridad
- No ejecutar `docker compose down -v` en entornos con datos que deban conservarse.
- No registrar URI de conexión completa ni contraseñas en logs.

## Dependencias
- Acceso a Docker Desktop/WSL configurado; archivos setup del repositorio disponibles.

## Decisiones pendientes
- ¿Cuál es la estructura final del monorepo?
- ¿Qué comandos de test/lint exige CI?

---

# Bloque B — Registro, verificación, acceso y recuperación de cuenta (RBAC)

| Campo | Valor |
|---|---|
| Origen | Texto entregado por JulianD27-ia en una sesión de Claude Code (`/sdd-spec`) como «HT-AUTH-01»; transcrito sin cambios de contenido. Por decisión del responsable se fusionó en HT-CORE-01 como Bloque B |
| Fecha de registro | 2026-10-22 |
| Responsable | JulianD27-ia |
| Datos personales / secretos | Ninguno (describe el tratamiento de nombre y correo, sin datos reales) |

**Historia relacionada:** HU-AUTH-001 — Como persona que necesita acceder a OMR-PreICFES, quiero crear una cuenta, verificar mi correo, iniciar/cerrar sesión y recuperar mi contraseña, para utilizar de forma segura las funciones autorizadas.

## Objetivo técnico
Implementar el ciclo de vida de la cuenta antes de exponer información académica. Incluye creación de cuenta, contraseña, verificación de correo, inicio/cierre de sesión, recuperación de contraseña y autorización RBAC. La estrategia de sesión, el proveedor de correo y la integración deben alinearse con la arquitectura canónica sin presuponer un framework no confirmado.

## Criterios de aceptación
- CA-AUTH-01. El formulario de registro solicita nombre, correo y contraseña; el backend valida los datos, normaliza el correo y crea una cuenta en estado PENDIENTE_VERIFICACION sin asignar privilegios desde el cliente.
- CA-AUTH-02. El correo normalizado es único. Una solicitud repetida no crea cuentas duplicadas y las respuestas públicas no permiten enumerar cuentas existentes.
- CA-AUTH-03. La contraseña cumple la política publicada y se almacena solo como hash adaptativo seguro (Argon2id o equivalente aprobado); nunca se guarda ni se registra en texto plano.
- CA-AUTH-04. El sistema envía un enlace/código de verificación de un solo uso, con token aleatorio de alta entropía, hash almacenado y expiración configurable (valor inicial propuesto: 24 horas). El token vencido o utilizado no sirve otra vez.
- CA-AUTH-05. Una cuenta no puede iniciar sesión ni consultar datos protegidos mientras el correo no esté verificado o el estado de la cuenta no sea ACTIVA. Una cuenta de autorregistro pasa a PENDIENTE_APROBACION tras verificar el correo hasta que un administrador asigne institución/rol; las invitaciones autorizadas obtienen el rol desde el servidor.
- CA-AUTH-06. El usuario puede solicitar un nuevo correo de verificación con limitación de frecuencia; se invalida el token anterior y la respuesta no revela si una cuenta existe.
- CA-AUTH-07. El inicio de sesión acepta correo y contraseña válidos solo para cuenta verificada, activa y no bloqueada. Los errores por correo inexistente, contraseña incorrecta o cuenta no habilitada son genéricos.
- CA-AUTH-08. «Olvidé mi contraseña» siempre responde con un mensaje genérico. Si la cuenta es elegible, el backend envía un enlace de restablecimiento de un solo uso (valor inicial propuesto: 30 minutos); el token se guarda como hash y no aparece en logs.
- CA-AUTH-09. El restablecimiento solo funciona con token válido, vigente y no usado. Al cambiar la contraseña, el token se consume, se revocan las sesiones existentes y se permite iniciar sesión con la nueva contraseña.
- CA-AUTH-10. Un token de verificación o recuperación no puede usarse más de una vez. Los nuevos tokens invalidan los anteriores del mismo propósito; los intentos están limitados por cuenta, IP y tiempo.
- CA-AUTH-11. Las rutas privadas validan autenticación y permiso en el backend según rol, institución y alcance del recurso. Ocultar opciones en la interfaz no sustituye esa validación.
- CA-AUTH-12. Cerrar sesión revoca/invalida la sesión o token según la estrategia aprobada. Los eventos se auditan sin guardar contraseñas, tokens crudos ni datos personales innecesarios.

## Tareas — Backend / servicios
- Definir modelo de usuario y estados PENDIENTE_VERIFICACION, PENDIENTE_APROBACION, ACTIVA, BLOQUEADA y DESACTIVADA; impedir asignar rol/institución desde el formulario público.
- Implementar registro, normalización de correo, índice único, hash de contraseña y protección ante carreras de creación.
- Implementar generación criptográficamente segura de tokens para VERIFICAR_CORREO y RESTABLECER_PASSWORD; almacenar solo token_hash, propósito, usuario, expiración y used_at. Aplicar expiración también en la validación lógica; TTL, si se usa, sirve solo para limpieza.
- Integrar un servicio de correo con plantillas para verificación, reenvío, restablecimiento y avisos de cambio de contraseña. Configurar SMTP/API mediante secretos de entorno; nunca registrar el enlace completo.
- Implementar POST /auth/register, POST /auth/verify-email, POST /auth/resend-verification, POST /auth/login, GET /auth/me, POST /auth/logout, POST /auth/password/forgot y POST /auth/password/reset. Ajustar paths definitivos a las convenciones de NestJS/repo.
- Aplicar rate limiting, respuestas genéricas, defensa de fuerza bruta, política de sesiones, invalidación tras reset, auditoría y autorización RBAC a nivel de servicio/controlador.
- Crear pruebas unitarias, de integración y E2E de registro, correo, expiración/reuso de token, login, logout, reset y permisos por rol.

## Tareas — Frontend
- Crear pantallas Registro, Revisa tu correo, Verificar correo, Reenviar verificación, Login, Olvidé mi contraseña y Crear nueva contraseña.
- Validar campos en cliente para experiencia de usuario, pero repetir todas las validaciones críticas en backend. No solicitar rol privilegiado ni institución como selección confiable del formulario público.
- Mostrar mensajes claros para enlace vencido/usado y ofrecer solicitar uno nuevo sin revelar datos de otras cuentas. Mantener estados de carga/error accesibles.
- Proteger la navegación privada, consultar GET /auth/me y limpiar el estado de sesión tras logout o expiración.

## Modelo de datos / endpoints / contratos
- Modelo propuesto: usuario (id, nombre, correo_normalizado único, password_hash, estado, rol, institucion_id, correo_verificado_en, creado_en, actualizado_en, ultimo_acceso_en, credenciales_actualizadas_en). El rol y la institución solo los define una invitación validada o un administrador autorizado.
- Modelo propuesto de tokens: token_seguridad (usuario_id, proposito, token_hash, expira_en, usado_en, creado_en). Los tokens crudos se envían únicamente por correo y nunca se persisten ni registran. Índices: correo_normalizado único; token_hash único; TTL opcional sobre expira_en para limpieza.
- Contratos propuestos: POST /auth/register; POST /auth/verify-email; POST /auth/resend-verification; POST /auth/login; GET /auth/me; POST /auth/logout; POST /auth/password/forgot; POST /auth/password/reset. Respuestas genéricas 202 para registro/reenvío/solicitud de recuperación cuando convenga evitar enumeración; 400/422 para datos inválidos; 401 para autenticación genérica; 403 para autorización denegada; 429 para límite excedido.

## Definition of Done (DoD)
- Los flujos de registro, verificación, login, logout y recuperación de contraseña funcionan con pruebas automatizadas reproducibles.
- Los tokens son de un solo uso, tienen expiración, se almacenan como hash, y no se acepta una cuenta no verificada/inactiva en rutas privadas.
- Las contraseñas nunca aparecen en base de datos en texto plano, logs, respuestas API ni herramientas de analítica.
- El proveedor de correo, plantillas, variables de entorno, roles y estados están documentados; no hay secretos versionados.
- Las pruebas confirman que un usuario no puede asignarse Admin/Coordinador ni acceder a datos de otra institución modificando el cliente o llamando directamente a la API.

## Seguridad
- HTTPS en despliegues; hash adaptativo aprobado; contraseña mínima propuesta de 12 caracteres con soporte de frases de contraseña y gestores; permitir pegar contraseñas. No imponer reglas arbitrarias de composición si no las exige la política institucional. Limitar intentos de registro/login/verificación/recuperación. Proteger contra CSRF si se eligen cookies; si se eligen tokens, definir almacenamiento, expiración y revocación seguros.
- El registro propio crea cuentas sin permisos institucionales y pendientes de aprobación. Los registros por invitación usan roles e institución predefinidos en el servidor; el cliente no puede modificarlos. El proveedor de correo y los links deben construirse a partir de un dominio permitido configurado, evitando open redirects.

## Dependencias
- HT-CORE-01 (ahora Bloque A); acceso a la arquitectura de usuarios/repositorio; proveedor de correo institucional o servicio SMTP/API; definición de dominios permitidos y ambiente de pruebas.

## Decisiones pendientes
- ¿El autorregistro estará habilitado para todos o solo mediante invitación? Propuesta segura: permitir solicitud propia pendiente de aprobación y mantener la invitación para roles institucionales.
- ¿Qué roles y permisos finales existen y quién aprueba la asignación de institución/rol?
- ¿Qué proveedor de correo se usará y cómo se probará envío local sin distribuir mensajes reales?
- ¿Se usará cookie de sesión segura o token? Resolver según las convenciones oficiales del repositorio y documentar expiración, CSRF, renovación y revocación.
- Confirmar vencimientos iniciales propuestos: verificación 24 h y recuperación 30 min, además de límites por IP/cuenta.
