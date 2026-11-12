# Operación de la autenticación (backend) — HT-AUTH-01

> **Alcance (DEC-23, aprobada el 2026-11-05):** este documento describe **solo el backend** (API NestJS en `apps/backend`). Las pantallas (registro, verificación, restablecimiento, activación), la coordinación de renovaciones entre pestañas y las cabeceras de las páginas pertenecen a la **historia posterior de frontend (ID por asignar)** y **no están implementadas**. Donde se mencionan pantallas, es solo como destino de los enlaces que genera la API.
>
> Fuentes: `specs/HT-AUTH-01/spec.md`, `specs/HT-AUTH-01/plan.md` (decisiones DEC-NN) y el código de `apps/backend/src`. Este documento no contiene secretos: los valores reales viven en `.env` (ignorado por Git) o en el gestor de secretos del despliegue. Variables: `docs/onboarding/02-variables-entorno.md` y `.env.docker.example`.

## 0. Pendientes que bloquean producción

| Pendiente | Efecto hoy | Referencia |
|---|---|---|
| **Proveedor de correo de producción** sin elegir | El código usa un adaptador SMTP genérico (Nodemailer) con TLS obligatorio fuera de local y tiempos máximos finitos (DEC-26); falta elegir proveedor, credenciales y dominio remitente (requisitos en §5). Con `NODE_ENV=production`, la API no arranca si `SMTP_HOST` es Mailpit o `localhost` | spec §12, DEC-05, DEC-09, DEC-26 |
| **CAPTCHA: credenciales y dominios de Cloudflare Turnstile** (T-41) | Proveedor aprobado: Cloudflare Turnstile Managed (DEC-24) y adaptador backend implementado. Falta crear el widget en Cloudflare con los dominios autorizados, guardar `CAPTCHA_SECRET` en el gestor de secretos y configurar `CAPTCHA_PROVIDER=turnstile`; el widget, la sitekey y la CSP son de la historia de frontend. **La integración productiva no está finalizada** | DEC-16, DEC-24, T-41 |
| **Valores de producción** de `RATE_LIMIT_AUTH_GLOBAL`, `ARGON2_*`, `UV_THREADPOOL_SIZE` y `maxmemory` de Redis | Los de `.env.docker.example` son provisionales; salen del informe de carga de T-43. La herramienta sigue siendo k6 (DEC-17), **condicionada a que la política del equipo apruebe su licencia AGPL-3.0**; no se instala ni se ejecuta hasta entonces | DEC-17, DEC-27, T-43 |
| Demás umbrales de límites (DEC-15) | Provisionales (dev y pruebas), salvo los de `/auth/activate`, aprobados (5 por enlace y 30 por IP cada 15 min). Se validan antes del release | DEC-15 |
| Retención de `auditoria_auth` | Sin TTL ni borrados hasta que el responsable apruebe plazos y grupos de eventos. Alternativas: **A**, índice TTL único sobre `creado_en`; **B**, índices TTL con filtro parcial por grupos de `evento`. Ambas por migración (DEC-12); no se proponen plazos | plan §4, §15 |
| Alertas de plan §13 y DEC-27 | Métricas, logs JSON y `correlationId` implementados (T-47, ver §10). Las **alertas** (picos de fallos, Redis al 70 % y 85 %, OOM, `LIMITADOR_NO_DISPONIBLE`) dependen de la plataforma de monitoreo del despliegue | plan §13, DEC-25, DEC-27 |

## 1. Estados de cuenta y transiciones

Definidos en `src/users/account-status.ts` (spec §7, RN-01).

| Estado | Significado | ¿Puede iniciar sesión? | ¿Recuperación de contraseña? (DEC-19) |
|---|---|---|---|
| `PENDIENTE_VERIFICACION` | Correo sin confirmar | No | No (debe pedir un nuevo enlace de verificación) |
| `PENDIENTE_APROBACION` | Correo confirmado; espera aprobación administrativa | No | Sí |
| `ACTIVA` | Habilitada | Sí | Sí |
| `BLOQUEADA` | Bloqueada por una operación administrativa | No | No |
| `DESACTIVADA` | Desactivada | No | No |

Transiciones permitidas por el código (`canTransition`):

| Desde | Hacia | Cómo |
|---|---|---|
| `PENDIENTE_VERIFICACION` | `PENDIENTE_APROBACION` | `POST /auth/verify-email` de un autorregistro (DEC-07) |
| `PENDIENTE_VERIFICACION` | `ACTIVA` | Verificación de una invitación con rol asignado (DEC-07; **hoy no hay invitaciones**: `NoInvitationResolver`, DEC-22) o `POST /auth/activate` de la cuenta inicial (DEC-08) |
| `PENDIENTE_APROBACION` | `ACTIVA` | Aprobación administrativa: **operación de una historia posterior**; no existe ruta en esta historia |
| `ACTIVA` | `BLOQUEADA` / `DESACTIVADA` | Operación administrativa de una historia posterior |

- Reactivar una cuenta `BLOQUEADA` o `DESACTIVADA` **no está definido** por la spec.
- Ningún límite de intentos cambia el estado de una cuenta ni su `version_credenciales` (RN-09): no hay bloqueo automático.
- Una cuenta que deja de estar `ACTIVA` pierde el acceso en la siguiente solicitud: los guards rechazan el JWT (401) y `/auth/refresh` revoca la sesión (`CUENTA_NO_ACTIVA`).
- En las pruebas, la aprobación se simula escribiendo en la base (no hay ruta).

## 2. Catálogo de roles y alcance

Definido en un único lugar: `src/authz/role.ts` (spec §8.1, DEC-11, DEC-14).

| Rol | Alcance | Institución | Lo que permite esta historia | Permisos fuera de esta historia |
|---|---|---|---|---|
| `ADMIN` | Global | No tiene | `GET /auth/me`, logout | Previstos en historias posteriores (aprobar cuentas, asignar institución y rol, entre otros; spec §8.1) |
| `COORDINADOR` | Solo su institución | Obligatoria | `GET /auth/me`, logout | **Pendientes de definición funcional** (OPEN QUESTION de spec §12) |
| `DOCENTE` | Solo su institución | Obligatoria | `GET /auth/me`, logout | Previstos en historias posteriores (spec §8.1) |

Reglas aplicadas por el backend:

- Una cuenta `ACTIVA` exige un rol; un rol institucional `ACTIVO` exige institución; `ADMIN` no tiene institución (RN-15). Una cuenta incoherente recibe 403 en toda ruta protegida.
- Recurso de otra institución → **404**, igual que uno inexistente; permiso insuficiente dentro del alcance → **403** (DEC-14). El filtro de institución se aplica en la propia consulta a MongoDB (`InstitutionScopePolicy`).
- Nadie se asigna ni cambia su propio rol (RN-18): ninguna de las 10 rutas de `/api/v1/auth` recibe `rol` ni `institucion` (enviarlos al login → 400). El rol y la institución solo salen del servidor.
- El rol y la institución se leen de `usuarios` en cada solicitud (no del JWT); un cambio en la base aplica en la siguiente solicitud.

## 3. Responsables de aprobación

- **Quién aprueba cuentas:** un `ADMIN` `ACTIVO` aprueba las cuentas `PENDIENTE_APROBACION` y les asigna institución y rol (spec §8.1). La operación **no existe todavía**: corresponde a una historia posterior.
- **COORDINADOR:** que apruebe dentro de su institución **no** forma parte de DEC-11 y sigue abierto (spec §12).
- **Primer administrador:** se obtiene con el comando `bootstrap:admin` (§4), ejecutado por quien opera el servidor.
- La colección de instituciones (DT-09) no existe aún: el backend compara identificadores de institución pero no valida que la institución exista.

## 4. Comando `bootstrap:admin` (primer administrador)

DEC-08 (aprobada el 2026-11-03). Código: `src/bootstrap/bootstrap-admin.service.ts`, `src/cli/bootstrap-admin-cli.ts`, `src/cli/bootstrap-admin.ts`.

**Uso** (requiere `pnpm build`; usa las mismas variables de entorno que la API y se conecta a MongoDB, Redis y SMTP):

```
pnpm bootstrap:admin --nombre "<nombre>" --correo <correo>
```

Con pnpm **no** se escribe `--` antes de los argumentos: pnpm lo pasa tal cual al comando, que lo rechaza como argumento no válido (código 2). Alternativa equivalente: `node dist/cli/bootstrap-admin.js --nombre "<nombre>" --correo <correo>`.

En Compose, se ejecuta dentro del contenedor del backend con sus variables (perfil `app`).

**Comportamiento:**

| Situación | Resultado | Código de salida |
|---|---|---|
| No hay cuenta inicial ni ADMIN `ACTIVO` | Crea un `ADMIN` sin institución en `PENDIENTE_VERIFICACION`, con un hash de 256 bits aleatorios descartados (no hay contraseña utilizable), y envía un enlace de activación (`ACTIVAR_CUENTA`) | 0 |
| Cuenta inicial pendiente con el **mismo correo** | Reemite el enlace e invalida el anterior | 0 |
| Ya existe un ADMIN `ACTIVO` | No cambia nada | 1 |
| Cuenta inicial con otro correo u otro estado | No cambia nada | 1 |
| El correo pertenece a otra cuenta | No cambia nada | 1 |
| Otra ejecución simultánea | Una sola gana (índice único parcial `ux_usuarios_bootstrap`) | 1 para la perdedora |
| Falla el envío SMTP | La cuenta queda creada; se audita `CORREO_NO_ENVIADO`; volver a ejecutar el comando reemite el enlace | 1 |
| Argumentos inválidos, `--password` u otra opción, o una variable `ADMIN_*PASS*`/`BOOTSTRAP_*PASS*` | No ejecuta nada y no repite el valor | 2 |

**Garantías:** no acepta contraseñas por argumento, variable ni entrada estándar; la salida es genérica y nunca incluye el enlace, el token, el correo ni la contraseña; la auditoría (`ADMIN_INICIALIZADO` / `ADMIN_INICIALIZACION_RECHAZADA`) no guarda el correo. La persona activa la cuenta con `POST /api/v1/auth/activate` (token del enlace y nueva contraseña); después puede iniciar sesión y el comando queda rechazado.

> Si el correo de producción todavía no funciona al instalar, el comando falla con código 1 y no hay vía alternativa aprobada (OPEN QUESTION de plan §15; la consola interactiva no está aprobada).

## 5. Plantillas de correo y eventos

Código: `src/mail/mail-templates.ts`, `src/mail/mail.service.ts`, `src/mail/link-builder.ts`. Texto plano y HTML mínimo, sin recursos externos; el nombre se escapa en HTML; la vigencia mostrada se calcula desde la configuración.

| Plantilla | Asunto | Se envía cuando | Enlace |
|---|---|---|---|
| `VERIFICACION` | Confirma tu correo en OMR-PreICFES | `POST /auth/register` crea la cuenta (si el correo ya existe, no se envía nada, RN-04) | `{APP_PUBLIC_URL}/verificar-correo#token=…` |
| `REENVIO_VERIFICACION` | Confirma tu correo en OMR-PreICFES | `POST /auth/resend-verification` para una cuenta `PENDIENTE_VERIFICACION` que no es la inicial | Igual; invalida el anterior |
| `RESTABLECIMIENTO` | Restablece tu contraseña de OMR-PreICFES | `POST /auth/password/forgot` para una cuenta `ACTIVA` o `PENDIENTE_APROBACION` | `{APP_PUBLIC_URL}/restablecer-contrasena#token=…` |
| `AVISO_CAMBIO_PASSWORD` | Tu contraseña de OMR-PreICFES cambió | `POST /auth/password/reset` exitoso | Sin enlace |
| `ACTIVACION` | Activa la cuenta de administración de OMR-PreICFES | `bootstrap:admin` | `{APP_PUBLIC_URL}/activar-cuenta#token=…` |

- Los enlaces se construyen **solo** desde `APP_PUBLIC_URL` (validada contra `AUTH_ALLOWED_ORIGINS`), nunca desde `Host` ni `X-Forwarded-Host` (RN-13). El token va en el fragmento (`#token=`), que el navegador no envía al servidor (DEC-18). Las pantallas de destino son del frontend (no implementadas, DEC-23).
- **Transporte (DEC-26):** `SMTP_SECURE=true` usa TLS implícito y es obligatorio con el puerto 465; con `false`, fuera de local se exige STARTTLS (`requireTLS`): si el servidor no lo ofrece, el envío falla sin transmitir el mensaje. TLS 1.2 o superior con verificación de certificado; tiempos máximos `SMTP_CONNECTION_TIMEOUT_MS`, `SMTP_GREETING_TIMEOUT_MS` y `SMTP_SOCKET_TIMEOUT_MS`.
- **Requisitos del proveedor productivo (sin elegir):** SMTP con TLS (465 o 587 con STARTTLS) y credenciales solo de envío y rotables; dominio propio con SPF, DKIM y DMARC alineados con `MAIL_FROM`; **rastreo de clics y de aperturas desactivado** (reescribir enlaces filtraría la URL con `#token=` al proveedor); retención mínima del contenido de los mensajes; acuerdo de tratamiento de datos que cubra la transferencia internacional (Ley 1581 de 2012); visibilidad de rebotes y listas de supresión; capacidad y disponibilidad acordes; puerto de salida permitido por el hosting.
- Envío (DEC-09): en el mismo proceso, **después** de responder (`setImmediate`); el mensaje solo vive en memoria; sin reintento automático. Un fallo SMTP se registra en el log (solo el nombre de la plantilla) y se audita como `CORREO_NO_ENVIADO`. La persona puede pedir el reenvío o un nuevo enlace de recuperación. Al apagar (`SIGTERM`) se dejan de aceptar envíos y se esperan los pendientes hasta `MAIL_DRAIN_TIMEOUT_MS`; los que no terminen se pierden (riesgo aceptado en DEC-09) y se registra cuántos quedaron.
- Las respuestas de `register`, `resend-verification` y `password/forgot` son idénticas exista o no la cuenta (202 genérico con duración mínima `AUTH_MIN_RESPONSE_MS`, RN-04).

## 6. Sesiones y revocación

Código: `src/sessions/sessions.service.ts`, `src/auth/auth-session.service.ts`, `src/authz/guards.ts` (DEC-01, DEC-10).

- **Token de acceso:** JWT firmado con `JWT_ACCESS_SECRET`, vigencia `JWT_ACCESS_TTL` (15 min), enviado como `Authorization: Bearer`. Cada solicitud protegida comprueba firma y vencimiento, que la sesión (`sid`) siga vigente, que la cuenta esté `ACTIVA` y que `version_credenciales` coincida.
- **Token de renovación:** 256 bits aleatorios, solo en la cookie `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`; en `sesiones` solo se guarda su SHA-256. Nunca aparece en el cuerpo de una respuesta.
- **Rotación** en cada `POST /auth/refresh`, atómica. Reutilizar **cualquier** token ya rotado revoca la sesión completa (`REUTILIZACION`, evento `REUTILIZACION_DETECTADA`). Los hashes anteriores se conservan en `refresh_hashes_previos`.
- **Duración absoluta** `SESSION_REFRESH_TTL` (7 días) desde el login: rotar no la extiende. Al llegar a `SESSION_MAX_ROTATIONS` (1.000) la sesión se revoca (`LIMITE_ROTACIONES`). El índice TTL `ttl_sesiones_expira` elimina las sesiones vencidas.
- **Motivos de revocación** (`motivo_revocacion`): `LOGOUT`, `RESET_PASSWORD` (todas las sesiones de la cuenta), `REUTILIZACION`, `CUENTA_NO_ACTIVA`, `LIMITE_ROTACIONES` y `ADMIN` (reservado; **ninguna operación de esta historia lo usa**).
- Un restablecimiento de contraseña incrementa `version_credenciales`: los JWT y renovaciones previos dejan de valer aunque falle la revocación masiva (DEC-10).
- `/auth/refresh` y `/auth/logout` exigen un `Origin` permitido (protección CSRF junto con `SameSite=Strict`, DEC-20).
- **No hay** una operación administrativa para revocar sesiones en esta historia. Si hiciera falta en una emergencia, la vía con efecto inmediato es incrementar `version_credenciales` de la cuenta. Es una intervención manual sobre la base, fuera de los procedimientos aprobados: debe autorizarla el responsable del proyecto.

## 7. Tokens de verificación, recuperación y activación

Código: `src/security-tokens/security-tokens.service.ts` (DEC-03).

| Propósito | Vigencia (variable) | Valor inicial | Se consume en |
|---|---|---|---|
| `VERIFICAR_CORREO` | `VERIFY_TOKEN_TTL` | 24 h | `POST /auth/verify-email` |
| `RESTABLECER_PASSWORD` | `RESET_TOKEN_TTL` | 30 min | `POST /auth/password/reset` |
| `ACTIVAR_CUENTA` | `ACTIVATION_TOKEN_TTL` | 24 h | `POST /auth/activate` |

- 256 bits aleatorios en base64url; en `tokens_seguridad` solo se guarda el SHA-256 (`token_hash`, índice único). El token crudo no se guarda en MongoDB, Redis, logs ni auditoría.
- Emitir un token nuevo invalida los vigentes del mismo usuario y propósito (no los de otro propósito).
- Consumo atómico y de un solo uso; el vencimiento se comprueba siempre en la consulta. El índice `ttl_tokens_expira` borra los documentos 24 h después de vencer (limpieza; no afecta la validez).
- Si la cuenta cambió de estado después de emitir el enlace y ya no es elegible, el consumo se rechaza sin cambios (RN-19).
- Cualquier enlace inválido, vencido, usado, invalidado o de otro propósito responde el mismo **400** `enlace-invalido` («El enlace no es válido o ya venció. Solicita uno nuevo»).

## 8. Límites de intentos y fallos de Redis

Código: `src/common/rate-limit/auth-rate-limit.service.ts`, `src/common/rate-limit/redis-rate-limiter.ts`, `src/auth/password/argon2-gate.ts` (DEC-06, DEC-15, DEC-16, DEC-17).

**Mecanismo:** ventana fija en Redis (`INCR` + `PEXPIRE` atómicos con Lua); las claves expiran solas. Claves `rl:{operación}:{dimensión}:{id}`: la IP y el correo como HMAC con `RATE_LIMIT_KEY_PEPPER`; los enlaces por el `_id` de un registro **existente** (un token inventado solo cuenta la IP); `rl:auth:global` compartida por todas las instancias. Ninguna clave contiene IP, correo, token ni hash del token.

| Operación | Límites (variables) | Valores iniciales (DEC-15) |
|---|---|---|
| Login | `LOGIN_IP_FAILURE` (credenciales incorrectas por IP), `LOGIN_CHALLENGE_IP` (CAPTCHA ausente o inválido por IP), `LOGIN_CHALLENGE_ACCOUNT` (fallos por correo que activan el CAPTCHA) | 60/15 min, 60/15 min, 5/15 min |
| Registro | `REGISTER_EMAIL`, `REGISTER_IP` | 3/1 h, 20/1 h |
| Reenvío de verificación | `RESEND_ACCOUNT`, `RESEND_IP` | 3/1 h, 30/1 h |
| Verificación | `VERIFY_TOKEN` (por enlace), `VERIFY_IP` | 10/15 min, 30/15 min |
| Olvido de contraseña | `FORGOT_ACCOUNT`, `FORGOT_IP` | 3/1 h, 30/1 h |
| Restablecimiento | `RESET_TOKEN`, `RESET_IP` | 5/15 min, 30/15 min |
| Activación | `ACTIVATE_TOKEN`, `ACTIVATE_IP` | 5/15 min, 30/15 min (**aprobados**) |
| Global (todas) | `RATE_LIMIT_AUTH_GLOBAL` | Provisional (T-43) |

Todas las variables llevan el prefijo `RATE_LIMIT_` y el formato `<máximo>/<ventana>`.

**Respuestas:**

- **429** `demasiados-intentos` con `Retry-After`: solo por límites atribuibles al cliente. `LIMITE_EXCEDIDO` se audita una vez por clave y ventana.
- En el login, la cuenta **nunca** recibe 429: al llegar a `LOGIN_CHALLENGE_ACCOUNT` se exige CAPTCHA (401 `desafio-requerido`, igual exista o no la cuenta) antes de ejecutar Argon2id. Un login correcto no consume el contador por cuenta y devuelve la reserva de IP.
- **503** con `Retry-After` por capacidad o disponibilidad, sin consumir los contadores del cliente:

  | Causa | Tipo de problema |
  |---|---|
  | Límite global | `servicio-saturado` |
  | Cola de `Argon2Gate` llena o espera vencida | `servicio-saturado` |
  | Proveedor de CAPTCHA sin respuesta o con error | `verificacion-no-disponible` (fallo cerrado, sin vía alternativa) |

- Los límites nunca bloquean la cuenta ni cambian su estado.

**Redis no disponible (fallo cerrado, DEC-06):** si Redis no responde en `RATE_LIMIT_REDIS_TIMEOUT_MS`:

- las 7 operaciones públicas responden **503** `limitador-no-disponible` con `Retry-After` (`login`, `register`, `resend-verification`, `verify-email`, `password/forgot`, `password/reset`, `activate`);
- no tienen efectos y se audita `LIMITADOR_NO_DISPONIBLE`;
- `/auth/me` y las rutas que solo validan el JWT siguen funcionando.

Al volver Redis, todo se recupera sin intervención; los contadores perdidos simplemente vuelven a empezar.

**IP real:** se toma con `trust proxy` = `TRUST_PROXY_HOPS`. Con `0` se ignora `X-Forwarded-For`. Si no coincide con la topología, o todos los clientes comparten la IP del proxy (el límite por IP se agota para todos), o un cliente puede falsificar su IP.

**Redes compartidas (riesgo aceptado, plan §15):** usuarios de una misma institución detrás de una misma IP pública comparten los límites por IP.

**Escalado (DEC-17):** `RATE_LIMIT_AUTH_GLOBAL` es un **total del despliegue** compartido en Redis y debe recalcularse al cambiar el número de instancias. `Argon2Gate` es **por proceso** (`ARGON2_MAX_CONCURRENCY` ≤ `UV_THREADPOOL_SIZE`, validado al arrancar). La fórmula y los valores salen del informe de T-43 (**pendiente**).

## 9. Despliegue y seguridad — checklist (T-33)

Las comprobaciones **«Código»** están verificadas en el repositorio con las pruebas indicadas. Las **«Entorno»** solo pueden comprobarse en el entorno desplegado y se registran en el PR. **Ninguna** de ellas tiene evidencia todavía.

### 9.1 Comprobaciones de código (verificadas)

| # | Tema | Comprobación | Evidencia |
|---|---|---|---|
| C-01 | Cookies | La cookie de renovación siempre se emite con `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth` (también en local) y nunca va en el cuerpo | `src/auth/refresh-cookie.ts`; `test/auth-session.e2e-spec.ts`, `test/security.e2e-spec.ts` |
| C-02 | HTTPS en configuración | Con `NODE_ENV` distinto de `development`/`test`, `APP_PUBLIC_URL` y cada entrada de `AUTH_ALLOWED_ORIGINS` deben ser `https`; si no, la API no arranca | `src/config/auth-config.ts`; `src/config/auth-config.spec.ts` |
| C-03 | Origin | Las 9 rutas `POST` de autenticación exigen un `Origin` exactamente igual a una entrada de `AUTH_ALLOWED_ORIGINS`; si no, 403 sin efectos | `OriginGuard`; `test/security.e2e-spec.ts` |
| C-04 | CORS | Lista explícita de `AUTH_ALLOWED_ORIGINS` con credenciales, nunca `*`; `APP_PUBLIC_URL` debe estar en la lista | `src/app.setup.ts`; `test/authz.e2e-spec.ts` |
| C-05 | Proxy | `trust proxy` = `TRUST_PROXY_HOPS`; con `0` se ignora `X-Forwarded-For` | `src/app.setup.ts`; `test/auth-session.e2e-spec.ts` (`X-Forwarded-For` falso no cambia la IP) |
| C-06 | Cabeceras | `X-Powered-By` desactivado; respuestas de autenticación con `Cache-Control: no-store` | `src/app.setup.ts`, `src/auth/auth.controller.ts`; `Cache-Control` probado en `test/security.e2e-spec.ts`; `X-Powered-By` **sin prueba específica** |
| C-07 | SMTP | Con `NODE_ENV=production`, `SMTP_HOST` no puede ser `mailpit`, `localhost`, `127.0.0.1` ni `::1`. DEC-26: 465 exige `SMTP_SECURE=true`; fuera de local, STARTTLS obligatorio; TLS ≥ 1.2; tiempos máximos finitos y validados | `src/config/auth-config.ts`, `src/mail/mail-sender.ts`; `auth-config.spec.ts`, `test/integration/smtp-tls.int-spec.ts` (servidor sin STARTTLS → envío rechazado sin transmitir el mensaje; TLS implícito contra servidor sin TLS → rechazo; saludo y socket sin respuesta → error en tiempo finito) |
| C-08 | CAPTCHA | El adaptador `test` se rechaza fuera de local; `CAPTCHA_PROVIDER` es obligatoria; con `turnstile`, `CAPTCHA_SECRET` es obligatoria. Turnstile: endpoint fijo, sin `remoteip`, sin reintentos, valida `success`, `hostname` y `action`, falla cerrado | `src/config/auth-config.ts`, `src/captcha/turnstile-captcha-verifier.ts`; `auth-config.spec.ts`, `turnstile-captcha-verifier.spec.ts`, `test/integration/turnstile.int-spec.ts` |
| C-09 | Secretos | `JWT_ACCESS_SECRET`, `RATE_LIMIT_KEY_PEPPER` y `AUDIT_IP_PEPPER` obligatorios y de al menos 32 caracteres; cualquier variable ausente o inválida impide el arranque | `src/config/auth-config.ts` (`EnvReader.secret`). Prueba: solo que el mensaje no repite el valor (`auth-config.spec.ts`); la longitud mínima **no tiene prueba específica** |
| C-10 | MongoDB | Índices solo por migración (`001-auth-indices`, nombres fijos, idempotente y reversible); el seed `002-seed-roles-dev` solo se aplica con `NODE_ENV=development` o `test` y se omite con cualquier otro valor; `migrate:*` falla sin `NODE_ENV`; si el seed ya consta aplicado fuera de esa lista, `migrate:up` y `migrate:status` advierten sin modificar datos (DEC-28); el runner aborta si cambió el checksum de un script aplicado | `migrations/`, `src/database/migration-runner.ts`; `test/integration/migrations.int-spec.ts` |
| C-11 | Redis | Fallo cerrado con 503 en las 7 operaciones (sin cola offline, sin reintentos, `commandTimeout` = `RATE_LIMIT_REDIS_TIMEOUT_MS`) | `src/auth/auth-core.module.ts`; `test/rate-limits.e2e-spec.ts` |
| C-12 | Bootstrap | `bootstrap:admin` sin contraseña por ninguna vía y con salida genérica | `src/cli/`; `bootstrap-admin-cli.spec.ts`, `test/integration/bootstrap-admin-process.int-spec.ts` |
| C-13 | Logs | Logger con redacción (contraseñas, tokens, cookies, `Authorization`, correos, hashes, JWT, enlaces con `#token=`, credenciales en URI); los errores no previstos responden un 500 genérico | `src/audit/redact.ts`, `redacting-logger.ts`; `test/log-redaction.e2e-spec.ts`, `test/security.e2e-spec.ts` |
| C-14 | Auditoría | Sin correo, contraseña, token ni hash; IP como HMAC con `AUDIT_IP_PEPPER`; `correlation_id` de la solicitud (también en envíos diferidos) | `src/audit/audit.service.ts`; `test/security.e2e-spec.ts`, `test/observability.e2e-spec.ts` |
| C-15 | Observabilidad | `X-Request-Id` generado en el servidor (los valores del cliente se ignoran); logs JSON con `correlationId`; métricas con etiquetas acotadas sin datos personales ni secretos; la API pública no expone métricas | `src/observability/`; `observability.spec.ts`, `test/observability.e2e-spec.ts` |

### 9.2 Comprobaciones en el entorno desplegado (pendientes)

| # | Tema | Comprobación | Cómo observarla | Estado |
|---|---|---|---|---|
| E-01 | HTTPS | El proxy termina TLS y **redirige HTTP → HTTPS**; la API no se expone directamente por HTTP | `curl -sI http://<dominio>/api/v1/health` → 301/308 a `https://` | Pendiente |
| E-02 | HSTS | El proxy envía `Strict-Transport-Security` (la API no lo envía: es configuración del proxy, RNF-03) | `curl -sI https://<dominio>/api/v1/health` | Pendiente |
| E-03 | Cookies | El proxy no altera `HttpOnly`, `Secure`, `SameSite=Strict` ni `Path=/api/v1/auth` | Cabecera `Set-Cookie` de un login real, copiada (sin el valor) en el PR | Pendiente |
| E-04 | Origin | `APP_PUBLIC_URL` es el origen HTTPS real del frontend y está en `AUTH_ALLOWED_ORIGINS`; un `Origin` ajeno → 403 | `curl -si -X POST https://<dominio>/api/v1/auth/refresh -H 'Origin: https://ajeno.example'` → 403 `origen-no-permitido` | Pendiente |
| E-05 | CORS | La preflight solo acepta los orígenes de la lista | `OPTIONS` con un origen permitido y otro ajeno | Pendiente |
| E-06 | Proxy | `TRUST_PROXY_HOPS` igual al número de proxies confiables delante de la API (condición de DEC-01) | Revisar la topología; comprobar en la auditoría que dos clientes distintos producen HMAC de IP distintos y que un `X-Forwarded-For` falso no cambia el resultado | Pendiente |
| E-07 | MongoDB | URI con credenciales del gestor de secretos y TLS si sale de la red privada; la instancia sigue standalone (DT-02); copias de seguridad | `pnpm migrate:status` | Pendiente |
| E-08 | Migraciones | `pnpm migrate:up` aplicado con `NODE_ENV` explícito; `002-seed-roles-dev` **omitida** fuera de `development`/`test` (DEC-28) y sin advertencia de seed aplicado | `pnpm migrate:status` (adjuntar la salida) | Pendiente |
| E-09 | Redis | Accesible solo desde la red privada, con autenticación; `maxmemory-policy noeviction`; instancia dedicada al limitador, separada de las colas OMR cuando el despliegue lo permita; `maxmemory` según T-43; alertas al 70 % y 85 %, OOM y `LIMITADOR_NO_DISPONIBLE` (DEC-27) | `redis-cli CONFIG GET maxmemory-policy`; configuración de alertas | Pendiente (objetivo aprobado; `maxmemory` bloqueado por T-43) |
| E-10 | SMTP | Proveedor de producción elegido, credenciales en el gestor de secretos, `SMTP_SECURE` según el proveedor, `MAIL_FROM` del dominio con SPF/DKIM | Envío real de un correo de verificación a una cuenta de prueba | **Bloqueado**: proveedor sin elegir |
| E-11 | CAPTCHA | `CAPTCHA_PROVIDER=turnstile`, `CAPTCHA_SECRET` en el gestor de secretos, widget de Cloudflare con los dominios de `AUTH_ALLOWED_ORIGINS` | Login en desafío con Turnstile real | Pendiente: credenciales y dominios (y widget de la historia de frontend) |
| E-12 | Capacidad | `RATE_LIMIT_AUTH_GLOBAL`, `ARGON2_*` y `UV_THREADPOOL_SIZE` según el informe de T-43 y el número de instancias | Informe de T-43 | **Bloqueado**: T-43 |
| E-13 | Límites | Umbrales de DEC-15 validados para producción | Registro de la validación en el PR | Pendiente |
| E-14 | Bootstrap | `bootstrap:admin` ejecutado una vez; activación completada; una nueva ejecución → rechazada (código 1) | Salida del comando (genérica) y `ADMIN_INICIALIZADO` en la auditoría | Pendiente (requiere E-10) |
| E-15 | Logs | Los logs del entorno no contienen correos, tokens, cookies ni enlaces con `#token=` | Revisión de una muestra tras el flujo completo | Pendiente |
| E-16 | Observabilidad | `METRICS_PORT` distinto del de la API y **no publicado** fuera de la red interna; el sistema de monitoreo recolecta `GET /metrics`; alertas de plan §13 y DEC-27 configuradas | `curl` a `/metrics` desde la red interna (200) y desde fuera (sin acceso) | Pendiente |
| E-17 | Secretos | `.env` no versionado; secretos distintos por entorno; `NODE_ENV=production` | Revisión del despliegue | Pendiente |

## 10. Diagnóstico y operación

**Salud:** `GET /api/v1/health` → `{"status":"ok"}`. Solo indica que el proceso responde; **no** consulta MongoDB ni Redis.

**Arranque fallido:** si falta una variable o su formato es inválido, la API no arranca y el mensaje nombra la variable (nunca su valor). Causas frecuentes fuera de local:

- `APP_PUBLIC_URL` o `AUTH_ALLOWED_ORIGINS` sin `https`;
- `CAPTCHA_PROVIDER=test`;
- `SMTP_HOST` local;
- secretos de menos de 32 caracteres;
- `ARGON2_MAX_CONCURRENCY` mayor que `UV_THREADPOOL_SIZE`;
- `CAPTCHA_PROVIDER=turnstile` sin `CAPTCHA_SECRET`;
- `SMTP_PORT=465` con `SMTP_SECURE=false`, `SMTP_USER` sin `SMTP_PASSWORD` o tiempos SMTP ausentes;
- `METRICS_HOST` que no es una IP o `METRICS_PORT` igual al de la API.

**Tabla de síntomas:**

| Síntoma | Causa probable | Qué revisar |
|---|---|---|
| 503 `limitador-no-disponible` en login, registro y enlaces | Redis caído o lento | Estado de Redis y `RATE_LIMIT_REDIS_TIMEOUT_MS`; eventos `LIMITADOR_NO_DISPONIBLE` |
| 503 `servicio-saturado` | Límite global o cola de `Argon2Gate` llena | Carga, número de instancias, `RATE_LIMIT_AUTH_GLOBAL`, `ARGON2_*` |
| 503 `verificacion-no-disponible` | Proveedor de CAPTCHA sin respuesta | Estado del proveedor y `CAPTCHA_VERIFY_TIMEOUT_MS`. Afecta solo a los correos en desafío hasta que vence su ventana |
| 429 para muchos usuarios a la vez | `TRUST_PROXY_HOPS` incorrecto (todos con la IP del proxy) o red compartida | Topología del proxy |
| 403 `origen-no-permitido` desde el frontend real | `AUTH_ALLOWED_ORIGINS` no incluye el origen exacto (esquema, host y puerto) | Variable y cabecera `Origin` |
| Correos que no llegan | Fallo SMTP | Log «Correo no enviado (plantilla …)»; eventos `CORREO_NO_ENVIADO`; la persona puede pedir el reenvío o un nuevo enlace |
| Una sesión se cierra inesperadamente | Reutilización de un token rotado (respuesta de `/refresh` perdida o pestañas simultáneas), cuenta no `ACTIVA`, restablecimiento o vencimiento absoluto | `motivo_revocacion` en `sesiones`; eventos `REUTILIZACION_DETECTADA` / `RENOVACION_RECHAZADA` |

**Auditoría** (`auditoria_auth`, consultas por `usuario_id` y `creado_en`):

- **Eventos:** `REGISTRO`, `VERIFICACION`, `REENVIO`, `LOGIN_OK`, `LOGIN_FALLIDO`, `LOGOUT`, `RECUPERACION_SOLICITADA`, `PASSWORD_RESTABLECIDO`, `LIMITE_EXCEDIDO`, `ACCESO_DENEGADO`, `SESION_RENOVADA`, `RENOVACION_RECHAZADA`, `REUTILIZACION_DETECTADA`, `ADMIN_INICIALIZADO`, `ADMIN_INICIALIZACION_RECHAZADA`, `CUENTA_ACTIVADA`, `CORREO_NO_ENVIADO` y `LIMITADOR_NO_DISPONIBLE`.
- **Resultados:** `OK` o `RECHAZADO`.
- La IP aparece como HMAC: para relacionar eventos de una misma IP se compara el HMAC, no la IP.
- Si una escritura de auditoría falla en un camino ya decidido, se registra «No se pudo auditar el evento …» en el log.

**Migraciones:** `pnpm build`, luego `pnpm migrate:status`, `pnpm migrate:up` y, si hiciera falta, `pnpm migrate:down [--to <id>]`. `down` revierte solo índices o los documentos sembrados (`seed: true`); no borra colecciones.

**Apagado:** con `SIGTERM`, la API deja de aceptar envíos de correo, espera los pendientes hasta `MAIL_DRAIN_TIMEOUT_MS` y cierra Redis.

**Observabilidad (T-47, DEC-25):**

- **`X-Request-Id`:** cada respuesta lleva un UUID generado por el servidor; el mismo valor aparece en los logs (`correlationId`) y en `auditoria_auth.correlation_id`, incluidos los envíos de correo diferidos. Para investigar un error reportado, pedir ese identificador y buscarlo en logs y auditoría. Un `X-Request-Id` enviado por el cliente se ignora.
- **Logs:** una línea JSON por registro (`level`, `context`, `message`, `timestamp`, `correlationId`), con redacción previa.
- **Métricas:** servidor interno `GET http://<METRICS_HOST>:<METRICS_PORT>/metrics` (formato Prometheus; `METRICS_PORT=0` lo deshabilita):

  | Métrica | Etiquetas | Uso |
  |---|---|---|
  | `omr_auth_solicitudes_total` | `ruta`, `resultado` (`exito`, `error_cliente`, `error_servidor`), `problema` | Login OK y fallido (`credenciales-invalidas`), desafíos (`desafio-requerido`), 429 (`demasiados-intentos`) y 503 (`limitador-no-disponible`, `servicio-saturado`, `verificacion-no-disponible`) |
  | `omr_auth_captcha_verificaciones_total` | `resultado` (`valido`, `invalido`, `no_disponible`) | Fallos del proveedor de CAPTCHA |
  | `omr_auth_correos_total` | `resultado` (`enviado`, `fallido`, `descartado`) | Correos enviados y fallidos |
  | `omr_auth_argon2_en_curso`, `_en_cola`, `_rechazadas`, `_max_en_curso` | — | Cola de `Argon2Gate` |
  | `omr_auth_proceso_*` | — | CPU, memoria y event loop del proceso |

  Las etiquetas nunca llevan correo, IP, identificadores, tokens ni plantillas. Las rutas inexistentes se agrupan en `ruta="desconocida"`.
- **Alertas — pendientes de la plataforma de monitoreo:** picos de `credenciales-invalidas` o `demasiados-intentos`; aumento de `verificacion-no-disponible` o `captcha …no_disponible`; `limitador-no-disponible`; Redis al 70 % y 85 % y errores OOM (DEC-27).
