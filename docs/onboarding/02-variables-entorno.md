# 2. Variables de entorno

Plantilla versionada: `.env.docker.example` (solo marcadores). Archivo real: `.env` (ignorado por Git; cada desarrollador tiene el suyo).

| Variable | Secreta | Consumida por | Descripción |
|---|---|---|---|
| `MONGO_ROOT_USER` | Sí | `mongo`, URI de `api` | Usuario root de MongoDB local. |
| `MONGO_ROOT_PASSWORD` | Sí | `mongo` | Contraseña real del usuario root. |
| `MONGO_ROOT_PASSWORD_URLENCODED` | Sí | URI de `api` en Compose | La misma contraseña codificada para URL. Obligatoria: Compose falla si falta. |
| `MONGO_DB` | No | `mongo`, URI de `api` | Nombre de la base de datos (`omr_preicfes`). |
| `MONGO_PORT` | No | `mongo` | Puerto local publicado (por defecto 27017). |
| `REDIS_PORT` | No | `redis` | Puerto local publicado (por defecto 6379). |
| `MONGODB_URI` | Sí | NestJS en el host | URI completa con `localhost`; la contraseña va codificada para URL. |
| `REDIS_URL` | No | NestJS en el host | URI de Redis con `localhost`. |

Redis local no tiene contraseña: solo escucha en `127.0.0.1`. Si se necesita en entornos compartidos se decide en DT-06.

Dentro de Docker, `docker-compose.yml` sobrescribe `MONGODB_URI` y `REDIS_URL` del servicio `api` con los hostnames `mongo` y `redis`.

## Contraseña codificada para URL
Si la contraseña contiene caracteres como `% @ : / ? # $` y espacios, en una URI deben codificarse (`%` → `%25`, `@` → `%40`, etc.). Generarla localmente, sin pegarla en servicios externos:

```powershell
# Pide la contraseña sin mostrarla y escribe solo el valor codificado
$p = Read-Host -AsSecureString "Contraseña"
[uri]::EscapeDataString([Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($p)))
```
Copiar el resultado en `MONGO_ROOT_PASSWORD_URLENCODED` y dentro de `MONGODB_URI`. Si la contraseña cambia, regenerar ambas.

## Autenticación (HT-AUTH-01, plan §9.4)
La API valida estas variables al arrancar: si falta una o tiene formato inválido, **no arranca** y el mensaje nombra la variable (nunca su valor). Formatos: duración `<entero><ms|s|m|h|d>` (p. ej. `15m`); límite `<máximo>/<ventana>` (p. ej. `60/15m`). Los valores de la plantilla son los propuestos en DEC-15; los de DEC-17 son **solo locales y no validados** hasta las pruebas de carga (T-43).

| Variable | Secreta | Consumida por | Descripción |
|---|---|---|---|
| `NODE_ENV` | No | NestJS | `development`, `test` o `production`. Fuera de `development`/`test` se exige https y se rechazan Mailpit y el CAPTCHA de prueba. |
| `APP_PUBLIC_URL` | No | NestJS (`LinkBuilder`) | Origen del frontend para los enlaces de correo (RN-13). Debe estar en `AUTH_ALLOWED_ORIGINS`. |
| `AUTH_ALLOWED_ORIGINS` | No | NestJS (`Origin` y CORS) | Orígenes completos separados por coma, sin ruta, sin `*` y sin `null` (DEC-20). |
| `JWT_ACCESS_SECRET` | Sí | NestJS | Firma del JWT de acceso. Mínimo 32 caracteres aleatorios. |
| `JWT_ACCESS_TTL` | No | NestJS | Vigencia del JWT de acceso (`15m`). |
| `SESSION_REFRESH_TTL` | No | NestJS | Duración absoluta de la sesión desde el login (`7d`); renovar no la extiende. |
| `VERIFY_TOKEN_TTL` | No | NestJS | Vigencia del enlace de verificación (`24h`). |
| `RESET_TOKEN_TTL` | No | NestJS | Vigencia del enlace de restablecimiento (`30m`). |
| `ACTIVATION_TOKEN_TTL` | No | NestJS | Vigencia del enlace de activación del primer administrador (`24h`, DEC-08). |
| `AUTH_MIN_RESPONSE_MS` | No | NestJS | Tiempo mínimo de respuesta de registro, reenvío y recuperación, para no revelar si la cuenta existe (RN-04). |
| `RATE_LIMIT_LOGIN_IP_FAILURE` | No | NestJS | Credenciales incorrectas comprobadas por IP (`60/15m`); al superarlo, 429. |
| `RATE_LIMIT_LOGIN_CHALLENGE_IP` | No | NestJS | CAPTCHA ausentes o inválidos por IP (`60/15m`); al superarlo, 429. |
| `RATE_LIMIT_LOGIN_CHALLENGE_ACCOUNT` | No | NestJS | Fallos por correo que activan el CAPTCHA (`5/15m`). Nunca responde 429. |
| `RATE_LIMIT_REGISTER_EMAIL` / `_IP` | No | NestJS | Registro por correo (`3/1h`) y por IP (`20/1h`). |
| `RATE_LIMIT_RESEND_ACCOUNT` / `_IP` | No | NestJS | Reenvío de verificación por cuenta (`3/1h`) y por IP (`30/1h`). |
| `RATE_LIMIT_VERIFY_TOKEN` / `_IP` | No | NestJS | Verificación por enlace existente (`10/15m`) y por IP (`30/15m`). |
| `RATE_LIMIT_FORGOT_ACCOUNT` / `_IP` | No | NestJS | Recuperación por cuenta (`3/1h`) y por IP (`30/1h`). |
| `RATE_LIMIT_RESET_TOKEN` / `_IP` | No | NestJS | Restablecimiento por enlace existente (`5/15m`) y por IP (`30/15m`). |
| `RATE_LIMIT_ACTIVATE_TOKEN` / `_IP` | No | NestJS | Activación por enlace existente (`5/15m`) y por IP (`30/15m`). |
| `RATE_LIMIT_AUTH_GLOBAL` | No | NestJS | Límite global compartido por todas las instancias (DEC-17); superado → 503. **Recalcular al cambiar el número de instancias.** |
| `RATE_LIMIT_KEY_PEPPER` | Sí | NestJS | Secreto del HMAC de IP y correo en las claves de Redis. Mínimo 32 caracteres. |
| `RATE_LIMIT_REDIS_TIMEOUT_MS` | No | NestJS | Espera máxima a Redis; sin respuesta, las operaciones sensibles responden 503 (DEC-06). |
| `TRUST_PROXY_HOPS` | No | NestJS | Saltos de proxy confiables para obtener la IP real (`0` en local). Debe coincidir con la topología del despliegue. |
| `SESSION_MAX_ROTATIONS` | No | NestJS | Tope de rotaciones del token de renovación por sesión (`1000`). |
| `CAPTCHA_PROVIDER` | No | NestJS | Proveedor de CAPTCHA (DEC-16): `turnstile` (Cloudflare Turnstile Managed, DEC-24) o `test`, admitido únicamente en local. |
| `CAPTCHA_SITE_KEY` | No | Frontend | Clave pública del widget de Turnstile (historia de frontend); el backend no la lee. |
| `CAPTCHA_SECRET` | Sí | NestJS | Secreto de Turnstile; obligatorio con `CAPTCHA_PROVIDER=turnstile`. Los hostnames aceptados salen de `AUTH_ALLOWED_ORIGINS`. |
| `CAPTCHA_VERIFY_TIMEOUT_MS` | No | NestJS | Espera máxima al proveedor; sin respuesta, 503. |
| `ARGON2_MAX_CONCURRENCY` | No | NestJS | Verificaciones Argon2id simultáneas **por proceso**; no mayor que `UV_THREADPOOL_SIZE` (DEC-17). |
| `ARGON2_QUEUE_MAX` | No | NestJS | Tope de la cola de `Argon2Gate`. |
| `ARGON2_QUEUE_TIMEOUT_MS` | No | NestJS | Espera máxima en la cola; vencida → 503. |
| `UV_THREADPOOL_SIZE` | No | Node.js | Hilos del pool de libuv (por defecto 4). |
| `AUTH_OVERLOAD_RETRY_AFTER_S` | No | NestJS | `Retry-After` de los 503 por saturación o indisponibilidad. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | No | NestJS | Servidor SMTP. En local, Mailpit (`localhost:1025`, perfil `mail-dev`); con `NODE_ENV=production`, `mailpit` o `localhost` impiden arrancar (DEC-05). `SMTP_SECURE=true` = TLS implícito, obligatorio con el puerto 465; con `false`, fuera de local se exige STARTTLS (DEC-26). |
| `SMTP_CONNECTION_TIMEOUT_MS` / `SMTP_GREETING_TIMEOUT_MS` / `SMTP_SOCKET_TIMEOUT_MS` | No | NestJS | Tiempos máximos de conexión, saludo e inactividad del socket SMTP (enteros positivos, DEC-26). |
| `SMTP_USER` / `SMTP_PASSWORD` | Sí | NestJS | Credenciales SMTP; vacías en local. Proveedor de producción pendiente. |
| `MAIL_FROM` | No | NestJS | Remitente de los correos. |
| `MAIL_DRAIN_TIMEOUT_MS` | No | NestJS | Espera máxima para enviar correos pendientes al apagar (DEC-09). |
| `METRICS_PORT` | No | NestJS | Puerto del servidor **interno** de métricas (`GET /metrics`, T-47, DEC-25); `0` lo deshabilita. Distinto del de la API; nunca publicarlo fuera de la red interna. |
| `METRICS_HOST` | No | NestJS | Dirección IP en la que escucha el servidor de métricas (`127.0.0.1` en el host). |
| `AUDIT_IP_PEPPER` | Sí | NestJS | Secreto del HMAC de la IP en `auditoria_auth`. Mínimo 32 caracteres. |
| `SEED_DEV_PASSWORD` | Sí | `pnpm migrate:up` (seed `002`) | Solo desarrollo y pruebas: contraseña de las cuentas semilla (mínimo 12 caracteres). Nunca se versiona. |

Generar un secreto aleatorio localmente, sin pegarlo en servicios externos:

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
```

**Pruebas:** `pnpm test:int` y `pnpm test:e2e` cargan `../../.env` con `--env-file-if-exists` solo para `MONGODB_URI` y `REDIS_URL`; el resto de la configuración de prueba se genera en `test/support/test-env.ts`. Las pruebas usan bases y prefijos de Redis aislados y nunca imprimen los valores.

## Reglas
- Nunca commitear `.env` ni pegar credenciales en issues, PR, chats o specs.
- Agregar una variable nueva implica: actualizar `.env.docker.example` con un marcador, esta tabla y la spec que la requiere.
- Claude Code tiene denegada la lectura de `.env` en `.claude/settings.json`.
