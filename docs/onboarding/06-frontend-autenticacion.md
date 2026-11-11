# Frontend de autenticación (HT-AUTH-02)

Pantallas de registro, verificación, inicio de sesión, recuperación y activación de `apps/frontend`, sobre la API de HT-AUTH-01. El diseño está en [`specs/HT-AUTH-02/plan.md`](../../specs/HT-AUTH-02/plan.md) y la dirección visual en [`DESIGN.md`](../../DESIGN.md).

## Configuración
| Variable | Quién la usa | Valor |
|---|---|---|
| `API_PROXY_TARGET` | Servidor de desarrollo de Vite | Destino del proxy de `/api/v1`. Sin definir: `http://localhost:3000` |
| `VITE_CAPTCHA_SITE_KEY` | Navegador (va en el bundle) | Sitekey pública de Turnstile |

Detalle en [Variables de entorno](02-variables-entorno.md). El secreto de CAPTCHA (`CAPTCHA_SECRET`) es solo del backend: nunca lleva el prefijo `VITE_`, y `CAPTCHA_SITE_KEY` no se usa en el frontend.

Sin `VITE_CAPTCHA_SITE_KEY`, la aplicación funciona hasta que el backend pida un desafío. A partir de ahí, Inicio de sesión avisa de que no puede completar la verificación y no envía el intento: no hay vía alternativa (RN-10).

## Ejecución
Desde `apps/frontend`, con Corepack:

```sh
corepack pnpm install
corepack pnpm dev         # http://localhost:5173, con proxy hacia API_PROXY_TARGET
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test        # Vitest
corepack pnpm build
```

## Pruebas E2E
Corren contra un backend real y aislado, con MongoDB, Redis y Mailpit reales. Solo se sustituye el script de Turnstile, salvo en la suite de producción.

```sh
corepack pnpm exec playwright install chromium firefox webkit
corepack pnpm test:e2e --output=test-results/mi-ejecucion
corepack pnpm test:e2e:produccion --output=test-results/mi-produccion
node e2e/support/check-bundle.mjs            # V-6, tras un build
```

Cada ejecución crea y limpia su propio entorno (plan HT-AUTH-02, DEC-14 y DEC-15). No hace falta levantar nada antes, salvo el Compose de desarrollo (MongoDB, Mailpit y la red `omr-preicfes_omr`):

| Recurso | Nombre | Notas |
|---|---|---|
| Identificador | `RUN_ID` = `AAAAMMDDhhmmss_xxxxxx` | Lo crea `e2e/support/global-setup.mjs` y lo heredan las pruebas como `E2E_RUN_ID` |
| Base principal | `omr_test_e2e_<RUN_ID>` | Base nueva en el MongoDB de Compose; se migra con `NODE_ENV=test` (incluye la semilla `admin.seed`) |
| Bases de activación | `omr_test_e2e_<RUN_ID>_act_<n>` | Una por arranque del backend de activación; se migran con `NODE_ENV=production`, sin semilla |
| Usuarios de MongoDB | `u_<base>`, uno por base de la ejecución | Rol `readWrite` solo sobre su base (DEC-15). Contraseña derivada del secreto de la ejecución (`E2E_RUN_SECRET`); no se imprime ni va en los argumentos de las órdenes que se ejecutan desde el host. Dentro de los contenedores hay una exposición temporal: ver más abajo. Backends, migraciones, `bootstrap:admin` y ayudas de las pruebas usan este usuario; la cuenta raíz solo crea y borra usuarios y bases de la ejecución |
| Redis | contenedor `omr-e2e-<RUN_ID>-redis` | Temporal, sin puertos publicados ni persistencia. El Redis de desarrollo no se usa |
| Backends | `omr-e2e-<RUN_ID>-backend` (`127.0.0.1:3200`) y `omr-e2e-<RUN_ID>-backend-act` (`127.0.0.1:3201`) | Etiqueta `omr.e2e.run=<RUN_ID>` en todos los contenedores. No reciben `.env`: su entorno completo lo fija `isolated-backend.mjs` |
| Imagen del backend | `omr-preicfes-backend:e2e-<RUN_ID>` | Con la etiqueta de la ejecución; no se reetiqueta `omr-preicfes-backend:e2e` de DEC-13 |
| Mailpit | el de Compose | Compartido; cada correo va a una dirección única `*@example.test`. No se borra ni modifica |

- Las migraciones solo se aplican a bases de la ejecución en curso y solo si aún no existen.
- Al terminar, aunque fallen pruebas, `e2e/support/global-teardown.mjs` elimina **solo** lo de la ejecución: contenedores cuya etiqueta es exactamente su `RUN_ID` y cuyo nombre lleva su prefijo (inspeccionados con `--type container` y eliminados por ID), sus usuarios y bases de MongoDB, y su imagen. Solo limpia si `e2e/support/global-setup.mjs` de ese mismo proceso generó el `RUN_ID` (marca interna, que no se hereda del entorno): con un `E2E_RUN_ID` ya definido en la terminal, el setup lo rechaza y el teardown no borra nada.
- `E2E_KEEP=1` conserva los recursos para depurar; se limpian después con `node e2e/support/isolated-backend.mjs down <RUN_ID>`.
- Tras una interrupción (por ejemplo, cerrar la terminal), `node e2e/support/isolated-backend.mjs listar` muestra, solo leyendo Docker y MongoDB, los `RUN_ID` con recursos pendientes; `down <RUN_ID>` los limpia. Repetir `down` es seguro.
- Con el primer Ctrl+C, Playwright interrumpe las pruebas y ejecuta el teardown. Un segundo Ctrl+C, más de 1 s después, puede abandonar la limpieza; cerrar la terminal la omite: en ambos casos, `listar` y `down`.
- `corepack pnpm test:e2e:aislamiento` verifica estas protecciones sin Docker ni MongoDB reales (`e2e/support/aislamiento/`). Simula Docker y mongosh y comprueba la lógica de los módulos de `e2e/support/`: qué se crea y qué se limpia, que no se toquen recursos ajenos ni señuelos, el rechazo de un `RUN_ID` manipulado, F6, F7 y DEC-15 (rol `readWrite` propio, `MONGODB_URI` sin raíz ni `.env`, archivo temporal borrado y contraseña ausente de los argumentos de las órdenes del host), la propiedad del `RUN_ID` en el teardown y que `bootstrap:admin` reciba el nombre y el correo como argumentos literales, sin shell, también con `$`, `$(...)`, acentos graves, comillas o barras. No ejecuta nada dentro de los contenedores, así que no demuestra que no haya ninguna otra exposición.
- **Exposición temporal de la contraseña del usuario de la ejecución** (riesgo residual aceptado, plan HT-AUTH-02 §15). Es local y dura lo que la ejecución; la credencial solo da `readWrite` sobre una base que se borra al terminar:
  - dentro del contenedor `mongo`, `sh` expande `-p "$E2E_DB_PASSWORD"`, así que la contraseña está en los argumentos de `mongosh` mientras dura cada llamada y la ve quien liste los procesos de ese contenedor, igual que antes ocurría con la cuenta raíz;
  - `MONGODB_URI`, con la contraseña, forma parte del entorno del backend de la ejecución y se ve con `docker inspect` mientras existe el contenedor;
  - el archivo temporal de entorno se crea con `mode: 0o600`, que Windows no aplica: hasta que se borra, justo después de arrancar el contenedor, tiene los permisos de la carpeta temporal del usuario.
- No se tocan los contenedores `omr-e2e-backend*` ni las bases `omr_preicfes_e2e` y `omr_preicfes_e2e_activacion_*` del aislamiento anterior (DEC-13). Retirarlos requiere autorización aparte.
- Dos ejecuciones simultáneas no están admitidas: comparten los puertos 3200, 3201, 5174, 5175 y 5443.
- Usa siempre `--output` con una carpeta propia: sin él, Playwright vacía `test-results/` y borra la evidencia anterior.

| Proyecto | Origen | Qué corre |
|---|---|---|
| `chromium` | `http://localhost:5174` y `:5175` | Toda la suite |
| `firefox` | `http://localhost:5174` | `compatibilidad-sesion` y `compatibilidad-flujos` |
| `webkit` | `http://localhost:5174` | `compatibilidad-sesion`, con el límite descrito abajo |
| `webkit-https` | `https://localhost:5443` | `compatibilidad-flujos`, por el proxy TLS de pruebas |

`test:e2e:produccion` compila el bundle, lo sirve con `vite preview` y lo prueba en los tres motores con la CSP y `Referrer-Policy` que se piden al despliegue. Pide el script real de `challenges.cloudflare.com` con la sitekey de prueba de Cloudflare, así que necesita red. El backend sigue con su adaptador `test`: rechaza ese token, y eso es lo esperado. No sustituye a la prueba manual con un widget autorizado.

### WebKit en local
WebKit (Playwright en Windows, no Safari) guarda la cookie `Secure` pero no la envía sobre `http://localhost`: tras iniciar sesión, la renovación responde 401. En desarrollo con ese motor, cada recarga pide entrar otra vez. Sobre HTTPS funciona, y por eso `webkit-https` usa un proxy TLS de pruebas (`e2e/support/tls-proxy.mjs`) con certificado autofirmado que reescribe `Origin` hacia el origen permitido del backend aislado. Ese proxy existe solo para pruebas. Safari real no está comprobado.

## Requisitos para el despliegue
El despliegue y su configuración definitiva están **pendientes de definición**, fuera de HT-AUTH-02. Cualquier servidor que se elija debe cumplir lo siguiente.

### Proxy inverso
- Sirve el frontend y `/api/v1` en el **mismo origen**: el cliente usa rutas relativas.
- Sirve la aplicación con HTTPS: la cookie de renovación es `Secure`.
- Transmite sin cambios `Origin` y `Set-Cookie`, con `HttpOnly`, `Secure`, `SameSite=Strict` y `Path=/api/v1/auth`.
- Expone `Retry-After` en las respuestas 429.
- El origen público está en `AUTH_ALLOWED_ORIGINS`, coincide con `APP_PUBLIC_URL`, y `TRUST_PROXY_HOPS` refleja la topología real.
- Devuelve `index.html` en las rutas de la aplicación, también al recargar.
- No registra el fragmento de la URL (los navegadores no lo envían) ni los cuerpos de `/api/v1/auth/*`, que llevan tokens y contraseñas.

### Cabeceras del documento
```
Content-Security-Policy: default-src 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'; frame-ancestors 'none'
Referrer-Policy: no-referrer
```

La parte de `script-src`, `frame-src` y `connect-src` es la del plan §11. Las demás directivas concretan «fuentes, imágenes y estilos solo del propio origen» y añaden protecciones habituales. El resultado de probarla está en `specs/HT-AUTH-02/tasks.md` (T-06). Cloudflare documenta qué permitir en su [referencia de CSP](https://developers.cloudflare.com/turnstile/reference/content-security-policy/).

`index.html` ya lleva `<meta name="referrer" content="no-referrer">`, y la cabecera refuerza esa política. Los `POST` conservan `Origin` con esta política, así que la validación de origen del backend sigue funcionando.

### Turnstile
- Crea el widget en Cloudflare con los dominios autorizados, y define `VITE_CAPTCHA_SITE_KEY` al compilar y `CAPTCHA_SECRET` solo en el backend.
- Si el script no carga en 15 segundos, Inicio de sesión avisa y la persona puede reintentar. No se envía el intento sin la respuesta del desafío.
- **Antes de publicar:** prueba manual con el widget real y con la política `no-referrer`. Está pendiente mientras no haya credenciales autorizadas.

## Riesgos conocidos
Lista completa en `specs/HT-AUTH-02/plan.md` §15. Los que afectan al uso diario:
- **Recarga interrumpida:** la renovación rota la cookie sin período de gracia. Si se navega o recarga mientras hay una renovación en curso, la respuesta puede perderse, la siguiente renovación reutiliza la cookie anterior y el backend revoca la sesión. La persona debe volver a entrar.
- **403 al cerrar sesión:** una cuenta sin rol o institución coherentes no puede revocar su sesión desde el frontend. Pendiente de una tarea futura de backend.
