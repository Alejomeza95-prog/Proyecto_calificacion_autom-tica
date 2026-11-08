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
node e2e/support/isolated-backend.mjs up     # backend en 127.0.0.1:3100, base omr_preicfes_e2e, Redis 1
corepack pnpm exec playwright install chromium firefox webkit
corepack pnpm test:e2e --output=test-results/mi-ejecucion
corepack pnpm test:e2e:produccion --output=test-results/mi-produccion
node e2e/support/check-bundle.mjs            # V-6, tras un build
```

- Usa siempre `--output` con una carpeta propia: sin él, Playwright vacía `test-results/` y borra la evidencia anterior.
- `isolated-backend.mjs down` **elimina** los contenedores aislados. No lo ejecutes si necesitas conservar el entorno.
- Las bases `omr_preicfes_e2e_activacion_*` no se borran solas: se crea una por cada ejecución de la suite de activación.

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
