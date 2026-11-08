---
id: HT-AUTH-02
spec: ./spec.md
status: ready            # draft | ready  (solo el desarrollador marca ready)
owner: JulianD27-ia
updated: 2026-11-07
---

# HT-AUTH-02 — Plan técnico

> **plan.md describe CÓMO se construye lo definido en `spec.md`.** Respeta `specs/000-architecture/architecture.md`. Esta historia no añade persistencia.
> Generado por `/sdd-spec` y actualizado con `/sdd-plan` (`draft`). §14 indica qué decisiones aprobó el desarrollador y cuáles siguen como propuesta. Los contratos de §8 y §9 no son propuesta: se verificaron contra el código de `apps/backend` el 2026-11-05.
> Las referencias a HT-AUTH-01 se hacen por `DEC` y sección para no confundir sus criterios con los de esta historia.

## 1. Resumen técnico
Se construye el módulo `apps/frontend/src/features/auth` sobre el esqueleto React + Vite + TypeScript strict: enrutado, cliente HTTP, sesión en memoria con renovación coordinada, pantallas, widget de Turnstile y pruebas. No se modifica la lógica de `apps/backend` (código, contratos, configuración ni pruebas de `apps/backend/src`). El único cambio en esa carpeta es operativo: el script `start:local` de `apps/backend/package.json`, autorizado por el desarrollador, para ejecutar el backend en el host con variables de `.env` y `apps/backend/.env.local` (documentado en `docs/onboarding/02-variables-entorno.md`). `start:dev` no cambia.

Las tres piezas delicadas son: la **rotación estricta** del token de renovación (dos renovaciones simultáneas cierran la sesión, porque no hay período de gracia); la **captura del token del fragmento** antes de renderizar; y la **conexión de mismo origen** con la API, necesaria para leer `Retry-After` (DEC-01).

## 2. Arquitectura
### 2.1 Componentes afectados
| Componente | Ruta | Cambio |
|---|---|---|
| API NestJS | `apps/backend/src/` | **Ninguno** (RN-01; restricción aportada): sin cambios de lógica, contratos, configuración ni pruebas |
| Scripts del backend | `apps/backend/package.json` | Script operativo `start:local` (`node --env-file-if-exists=../../.env --env-file-if-exists=.env.local … nest start --watch`), autorizado por el desarrollador. No cambia `start:dev` ni el comportamiento de la API |
| Worker BullMQ | — | No aplica |
| Frontend React | `apps/frontend/src/features/auth/`, `src/app/`, `src/main.tsx`, `src/App.tsx` | Módulo nuevo y enrutado |
| Configuración frontend | `apps/frontend/vite.config.ts`, `index.html`, `package.json` | Proxy, política de referente y dependencias |
| Compose | `docker-compose.yml` (solo servicio `frontend`) | Variables explícitas `API_PROXY_TARGET` y `VITE_CAPTCHA_SITE_KEY`, sin `env_file` |
| Plantilla de variables | `.env.docker.example` | Bloque de frontend **antes** del bloque de autenticación (§9.4) |
| Diseño | `DESIGN.md` y `.impeccable/design.json` en la raíz | Dirección visual con alcance limitado a este módulo (§2.7) |
| Pruebas | `apps/frontend/e2e/` | Playwright + axe |
| Documentación | `docs/onboarding/02-variables-entorno.md`, `docs/operacion/` | Configuración, ejecución y resultado de compatibilidad |
| Motor OMR | — | No aplica |

### 2.2 Flujo técnico
```
Navegador (origen del frontend)
  main.tsx ── captura #token y limpia la URL ──► memoria
  React ── /api/v1/auth/* (mismo origen) ──► proxy de Vite (dev) / proxy inverso (despliegue, por definir) ──► NestJS
     ├─ Authorization: Bearer <JWT en memoria>    solo en /me y /logout
     └─ cookie omr_refresh (HttpOnly)             la adjunta el navegador en /auth/*
  Turnstile (challenges.cloudflare.com) ── solo en Inicio de sesión y solo tras 401 desafio-requerido
```

### 2.3 Módulos y responsabilidades
| Módulo / clase | Responsabilidad | Reglas (RN) que implementa |
|---|---|---|
| `app/router.tsx` | Rutas públicas y privadas; carga diferida de pantallas | RN-08, RN-14 |
| `features/auth/api/http-client.ts` | `fetch` con mismo origen, JSON, `credentials: 'same-origin'`; sin cabeceras propias; un reintento tras renovar ante `no-autenticado` en rutas protegidas | RN-01, RN-03, RN-13 |
| `features/auth/api/problem.ts` | Interpreta `application/problem+json`, `Retry-After` y fallos de red a un error tipado | RN-05, RN-11 |
| `features/auth/api/auth-api.ts`, `types.ts` | Una función por endpoint; copia de los contratos | RN-01, RN-04 |
| `features/auth/session/session-controller.ts` | Token en una variable privada de módulo; renovación de un solo vuelo y con Web Locks; aviso de cierre por `BroadcastChannel` | RN-02, RN-03, RN-12 |
| `features/auth/session/SessionProvider.tsx` | Estado `comprobando` / `anonima` / `autenticada` / `no-disponible`; restauración inicial y `/me` | RN-08, RN-09 |
| `features/auth/session/RequireAuth.tsx` | Protege rutas: sesión y `estado === 'ACTIVA'`; conserva en memoria la ruta solicitada | RN-08, RN-09, RN-16 |
| `features/auth/session/safe-return.ts` | Valida la ruta de retorno: solo rutas privadas internas; si no, `/inicio` | RN-16 |
| `features/auth/link-token/capture.ts` | Lee `#token=`, ejecuta `history.replaceState` y lo guarda en memoria, antes de `createRoot` | RN-06, RN-07 |
| `features/auth/captcha/` | Carga diferida de Turnstile y su widget | RN-07, RN-10 |
| `features/auth/pages/*`, `components/*`, `validation.ts`, `messages.ts` | Pantallas, campos accesibles y textos | RN-04, RN-05, RN-09, RN-11, RN-14 |
| `features/auth/pages/ActivateAccountPage.tsx` | Pantalla propia de activación; comparte con el restablecimiento solo el campo de contraseña | RN-06, RN-07, RN-15 |

**Rutas aprobadas el 2026-11-05 (las tres primeras las fija `mail/link-builder.ts`):**

| Ruta | Pantalla | Acceso |
|---|---|---|
| `/verificar-correo` | Verificar correo | Pública, con token |
| `/restablecer-contrasena` | Crear nueva contraseña | Pública, con token |
| `/activar-cuenta` | Activar cuenta | Pública, con token |
| `/iniciar-sesion` | Inicio de sesión | Pública; con sesión redirige a `/inicio` |
| `/registro` | Registro | Pública |
| `/revisa-tu-correo` | Confirmación | Pública |
| `/reenviar-verificacion` | Reenvío | Pública |
| `/olvide-contrasena` | Solicitud de recuperación | Pública |
| `/inicio` | Vista básica: `nombre`, `rol` y cierre de sesión | Privada; destino predeterminado |

**Retorno (CA-15, RN-16):** `RequireAuth` guarda la ruta solicitada en memoria, sin parámetros en la URL. Al iniciar sesión, `safe-return` solo la acepta si empieza por una única `/`, no contiene esquema ni `//`, y coincide con una ruta privada registrada. Cualquier otro valor lleva a `/inicio`.

### 2.4 Sesión y renovación
- **Inicio:** salvo en las rutas con token, la aplicación llama una vez a `POST /auth/refresh` y luego a `GET /auth/me`. Se omite en las rutas con token porque no la necesitan.
- **Resultado inicial:** 200 → autenticada; 401 → anónima; red, 5xx o 503 → `no-disponible`, con reintento y sin redirigir como si no hubiera sesión. El 401 esperado de un visitante sin cookie no se trata como error.
- **Renovación reactiva:** solo ante 401 `no-autenticado` de `/me` o `/logout`; un reintento y, si falla, sesión perdida. Nunca ante `credenciales-invalidas` o `desafio-requerido`. No se programa por temporizador para no gastar rotaciones (el tope es `SESSION_MAX_ROTATIONS`).
- **Coordinación (obligatoria, `HT-AUTH-01/DEC-01` y plan §5):** una promesa compartida dentro de la pestaña y `navigator.locks.request('omr-auth-refresh', …)` entre pestañas. La promesa vive fuera de React, para que los efectos dobles de `StrictMode` no generen dos renovaciones. Cada pestaña obtiene su propio token con su propia renovación; **ningún token viaja entre pestañas**.
- **Reparto de mecanismos:** Web Locks serializa las renovaciones; `BroadcastChannel` solo avisa del cierre de sesión con un mensaje sin datos, como exige `HT-AUTH-01/DEC-23`.
- **Si no están disponibles:** sin Web Locks se renueva sin coordinar (riesgo aceptado en HT-AUTH-01). Sin `BroadcastChannel`, las demás pestañas detectan el cierre en su siguiente solicitud. Ambas ausencias se comprueban con detección de la API y no rompen la aplicación.
- **Cierre:** con JWT vencido, se renueva primero y luego se llama a `/logout`, porque la ruta exige `Bearer`. Si la renovación da 401, la sesión ya no existe y se limpia el estado. Si falla la red, **no se afirma que se cerró**: se informa y se ofrece reintentar. Tras un 204, se avisa por `BroadcastChannel` con un mensaje sin datos.
- **Pérdida de sesión en otra pestaña:** se detecta en la siguiente solicitud (401 y renovación fallida).

### 2.5 Enlaces con token
La captura ocurre en `main.tsx`, antes de renderizar, solo en `/verificar-correo`, `/restablecer-contrasena` y `/activar-cuenta`. Recargar después de limpiar la URL deja la pantalla sin token: se muestra «abre de nuevo el enlace del correo» y la opción que corresponda a cada flujo. La confirmación es siempre una acción de la persona; ningún efecto de React hace el `POST`, de modo que `StrictMode` y los escáneres de correo no consumen el token.

| Flujo | Solicitud | Éxito | Enlace no válido |
|---|---|---|---|
| Verificar correo | `verify-email` | 200 con `estado` | Reenviar verificación |
| Restablecer contraseña | `password/reset` | 204; ir a Inicio de sesión | Pedir otro en Olvidé mi contraseña |
| Activar cuenta | `activate` | 204; ir a Inicio de sesión | Pedir un enlace nuevo a quien opera el sistema; **sin enlace a recuperación** (RN-15) |

El token de un flujo solo se entrega a la pantalla de su ruta. La activación tampoco inicia sesión: el backend no emite credenciales en esa respuesta.

### 2.6 Inicio de sesión con desafío (contrato `HT-AUTH-01/DEC-16` y `DEC-24`)
1. El primer envío va sin `captchaToken`. El frontend no adivina si habrá desafío.
2. Ante 401 `desafio-requerido`: se carga `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit`, se dibuja el widget con **`action: 'login'`** (el backend rechaza otra acción) y la sitekey pública. El correo y la contraseña se conservan en memoria.
3. Con la respuesta del widget, se reenvía con `captchaToken`.
4. El token es de un solo uso: tras **cada** intento se ejecuta `turnstile.reset()` y el widget sigue visible hasta que se inicie sesión.
5. `credenciales-invalidas`: error genérico; se borra la contraseña. Un `desafio-requerido` con token enviado indica respuesta rechazada: se pide resolver de nuevo. 503 `verificacion-no-disponible`: mensaje y reintento.
6. Sin sitekey, con script bloqueado o con `error-callback`: mensaje de verificación no disponible y **ningún** camino alternativo (RN-10). `expired-callback` y `timeout-callback` vacían el token y piden resolver otra vez.

### 2.7 Diseño (guía `impeccable`)
El modo de la guía es **Operate**. Al iniciar T-01 había `PRODUCT.md`, pero ni `DESIGN.md` ni implementación visual. Hoy la implementación visual existe, y `DESIGN.md` y `.impeccable/design.json` describen la dirección vigente tras el rediseño del 2026-11-07 (abajo).

**Dirección aprobada (DEC-10):** sencilla y consistente, limitada al módulo de autenticación y sin identidad corporativa global.

- **Restricciones fijas:** sin logo ni marca inventados (el nombre «OMR-PreICFES» va como texto); fuentes del sistema y ningún recurso externo (RN-07); estilos con variables CSS y CSS Modules de Vite, sin librería de componentes; contraste y estados que no dependen solo del color (RNF-01).
- **Compuerta en T-01:** la dirección concreta se define con el flujo de la guía y se presenta al desarrollador **antes de escribir pantallas**. Como superficie Operate, el desarrollo es guiado por código.
- **`DESIGN.md`:** se genera en la raíz, donde la guía lo busca, con un primer apartado que declara su alcance: solo este módulo, y HU-UX-001 podrá adoptarlo o reemplazarlo.
- **Cierre en T-06:** pasadas `audit` y `harden` de la guía, con una inspección conjunta de escritorio y móvil.
- **Rediseño (2026-11-07, pedido por el desarrollador):** la dirección «Manual con separadores» de T-01 se reemplaza por «Panel institucional + tarjeta». DEC-10 no cambia: sigue limitada a este módulo, con las mismas restricciones fijas.
  - **Visual:** un único azul institucional y fondos claros neutros, sin color por trámite. En escritorio, panel institucional con el nombre, la declaración del producto y una hoja de respuestas OMR dibujada en SVG en línea; a la derecha, una tarjeta blanca con el formulario. En tableta el panel es una franja; en móvil, una barra con el nombre.
  - **Navegación:** se elimina la barra lateral de trámites, y con ella la propiedad `showFlows` de `AuthPage`. Cada pantalla enlaza sus trámites relacionados al pie de la tarjeta; Iniciar sesión gana «Crear cuenta» y Crear cuenta gana «Iniciar sesión», para conservar la navegación que antes daba la barra. Las pantallas privadas y la activación siguen sin enlaces públicos (RN-15).
  - **Sin cambios:** lógica, contratos, sesión, rutas, textos de las pantallas, foco en el `h1`, `aria-*`, ni los criterios de aceptación. El botón de envío muestra además un indicador de carga, solo visual.
  - **Pruebas:** se reescriben, sin quitar aserciones de comportamiento, las que dependían de la barra: `components.test.tsx` (plantilla), `e2e/compatibilidad-flujos.spec.ts` (navegación entre pantallas) y el orden de teclado de `e2e/componentes-base.spec.ts`, `e2e/inicio-sesion.spec.ts` y `e2e/registro-verificacion.spec.ts`.
  - `DESIGN.md`, `.impeccable/design.json` y la ficha de superficie se reescriben con la nueva dirección.
  - **Ajustes de la revisión final (2026-11-07):** solo CSS de `AuthPage.module.css` y la ilustración `OmrSheetIllustration.tsx`; sin cambios de lógica, textos ni contratos.
    - **Distribución del panel (escritorio):** nombre y declaración arriba, hoja OMR en el centro y el principio del producto («Lee las hojas de respuesta…») al pie, en una rejilla de cuatro filas.
    - **Proporción de columnas (escritorio, desde 64rem):** `0.72fr / 1fr`, con el panel cerca del 42 % del ancho.
    - **Alineación:** en tableta (desde 40rem), el texto del panel arranca en el mismo borde que el contenido de la tarjeta; la tarjeta usa en todos los anchos el radio `--radius-card`.
    - **Responsive:** sin cambios en los cortes: celular con barra y tarjeta, tableta con franja sin ilustración, escritorio a dos columnas. Comprobado a 375, 800, 1024 y 1440 px, sin desbordes horizontales.
    - **Validación sin saltos:** en escritorio la tarjeta se alinea arriba, con un margen superior de `clamp(2.5rem, 15vh, 9rem)`, en lugar de centrarse en vertical; un mensaje de validación ya no la desplaza hacia arriba.
    - **Animación de la ilustración:** el anillo y el rótulo «Revisión» aparecen después de la última marca de la hoja, y el anillo se traza; el rótulo queda dentro del borde de la hoja. Sin animación con movimiento reducido.
    - **Pruebas tras los ajustes:** `lint`, `typecheck`, `build`, Vitest 324 de 324 y `pnpm test:e2e` con 231 superadas y 3 omitidas a propósito (DEC-12). Se corrigió además el orden de teclado de `e2e/recuperacion-contrasena.spec.ts`, que aún contaba la barra eliminada.

## 3. Colecciones y esquemas MongoDB / Mongoose
No aplica: el frontend no accede a la base de datos (RN-01).

## 4. Índices
No aplica: sin colecciones nuevas.

## 5. Consistencia y transacciones
No aplica en el servidor. La consistencia de la renovación entre pestañas se describe en §2.4.

## 6. Archivos (GridFS)
No aplica.

## 7. Scripts de migración y versionado
No aplica. Sin `schemaVersion`, por no haber documentos nuevos.

## 8. Endpoints
Se **consumen**, no se crean. Prefijo real: `/api/v1/auth`. Todos los `POST` exigen un `Origin` permitido (403 `origen-no-permitido`). Errores en `application/problem+json`. Todos los públicos pueden responder además 429 `demasiados-intentos`, 503 `limitador-no-disponible` o `servicio-saturado`, y 400 `solicitud-invalida` con `errores[]`, salvo donde se indica.

| Método | Path | Rol | Request | Response | Códigos propios | Idempotencia | CA |
|---|---|---|---|---|---|---|---|
| POST | `/api/v1/auth/register` | Público | `{ nombre, correo, password }` | 202 `{ mensaje }` | 422 `politica-password` | Respuesta idéntica | CA-02, CA-03, CA-10 |
| POST | `/api/v1/auth/verify-email` | Público | `{ token }` | 200 `{ estado }` | 400 `enlace-invalido` | Un solo uso | CA-04, CA-05 |
| POST | `/api/v1/auth/resend-verification` | Público | `{ correo }` | 202 `{ mensaje }` | — | Invalida el anterior | CA-04 |
| POST | `/api/v1/auth/login` | Público | `{ correo, password, captchaToken? }` | 200 `{ accessToken, expiresIn }` + cookie | 401 `credenciales-invalidas`, 401 `desafio-requerido`, 503 `verificacion-no-disponible` | No | CA-01, CA-07, CA-11 |
| POST | `/api/v1/auth/refresh` | Cookie | Sin cuerpo | 200 `{ accessToken, expiresIn }` + cookie rotada | 401 `no-autenticado` | **No**: rota; reutilizar revoca la sesión | CA-08 |
| GET | `/api/v1/auth/me` | Bearer | — | 200 `{ id, nombre, rol, institucionId, estado }` | 401 `no-autenticado`, 403 `acceso-denegado` | Sí | CA-08, CA-09 |
| POST | `/api/v1/auth/logout` | Bearer | Sin cuerpo | 204 | 401 `no-autenticado` | — | CA-07 |
| POST | `/api/v1/auth/password/forgot` | Público | `{ correo }` | 202 `{ mensaje }` | — | Invalida el anterior | CA-06 |
| POST | `/api/v1/auth/password/reset` | Público | `{ token, password }` | 204 | 400 `enlace-invalido`, 422 `politica-password` | Un solo uso | CA-06 |
| POST | `/api/v1/auth/activate` | Público | `{ token, password }` | 204, sin iniciar sesión | 400 `enlace-invalido`, 422 `politica-password` | Un solo uso | CA-14 |

**Configuración real que condiciona al cliente** (`app.setup.ts`, `refresh-cookie.ts`):
- Cookie `omr_refresh`: `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`. Frontend y API deben ser del mismo sitio, y una reescritura de rutas en un proxy rompería el `Path`.
- CORS: orígenes de `AUTH_ALLOWED_ORIGINS`, con credenciales. `allowedHeaders` solo admite `Content-Type` y `Authorization`, así que **no se pueden enviar cabeceras propias**.
- `exposedHeaders` solo incluye `X-Request-Id`: **`Retry-After` no es legible en una llamada de otro origen**, y el cuerpo no lleva ese dato. Es la razón de DEC-01.
- Con `Origin` obligatorio y proxy: el navegador envía `Origin` en los `POST` de mismo origen, y su valor (`http://localhost:5173`) ya está en la lista local. La validación es exacta: abrir la aplicación en `http://127.0.0.1:5173` daría 403, así que en local se usa siempre `localhost`.

**Verificación del proxy y las cookies (T-01, antes de escribir pantallas).** Lo anterior se dedujo del código; las comprobaciones se ejecutaron en T-01 y T-06 (resultado en la tabla). Se hicieron en el entorno aislado de DEC-13, con origen `http://localhost:5174` y el backend en `127.0.0.1:3100`, no en el `5173` de desarrollo. El proxy del contenedor `frontend` de Compose se comprobó aparte, en T-01, con un contenedor temporal.

| # | Comprobación | Resultado esperado | Si falla | Estado |
|---|---|---|---|---|
| V-1 | `POST` desde la aplicación por el proxy | El backend recibe `Origin: http://localhost:5173`; sin 403 | Detener y revisar la configuración del proxy | **Comprobada** (T-01): en Chromium por el proxy de Vite con el origen aislado; los `POST` llevan `Origin` permitido también en Firefox y WebKit (T-06). Compose: 202 con origen permitido en un contenedor temporal |
| V-2 | `POST` directo a la API con un `Origin` ajeno | 403 `origen-no-permitido`: el proxy no debilita la protección | Detener | **Comprobada** (T-01): 403 con origen ajeno, también por el proxy de Compose en el contenedor temporal |
| V-3 | 429 real desde el navegador | JavaScript lee `Retry-After` | Detener y revisar DEC-01 | **Comprobada** (T-01, Chromium): 429 reales también en T-03 a T-05 |
| V-4 | Inicio de sesión por el proxy | `Set-Cookie` conserva `HttpOnly`, `Secure`, `SameSite=Strict` y `Path=/api/v1/auth`; la cookie queda guardada | Ver V-5 | **Comprobada** (T-01 y T-06) en Chromium, Firefox y WebKit. **Pendiente:** cómo aplica WebKit `SameSite=Strict`, porque informa `None` a Playwright (§15) |
| V-5 | Inicio de sesión, recarga, renovación y logout en Chromium, Firefox y WebKit | Funciona; `document.cookie` no expone la cookie | Chromium: detener. Firefox o WebKit: documentar el límite local (DEC-12), sin cambiar el backend | **Comprobada** (T-06) en Chromium y Firefox sobre `http://localhost`. WebKit: **límite local documentado** (DEC-12); solo funciona sobre HTTPS con el proxy TLS de pruebas. **Pendiente:** Safari real (§15) |
| V-6 | Bundle de `dist/` | Contiene solo `VITE_*`; ni `CAPTCHA_SECRET`, ni `JWT_ACCESS_SECRET`, ni `API_PROXY_TARGET` | Detener | **Comprobada** con `e2e/support/check-bundle.mjs` en T-01 a T-06 |

**Solo documentado para producción (fuera de esta historia, §15):**
- El proxy inverso, la CSP de §11 y la cabecera `Referrer-Policy` del despliegue están documentados en `docs/onboarding/06-frontend-autenticacion.md`, pero no se han aplicado en ningún servidor real. `test:e2e:produccion` los simula sobre `vite preview` con cabeceras añadidas por la prueba (9 de 9 en los tres motores).
- V-1, V-4 y V-5 no se han comprobado contra un despliegue real con HTTPS y dominio propio.
- **Pendiente de release:** la prueba manual con el widget real de Turnstile y una sitekey con dominios autorizados (§15).

## 9. Contratos de datos
### 9.1 DTOs y validación
```ts
// features/auth/api/types.ts — copia de los contratos reales (HT-AUTH-01 plan §9.3)
type AccountStatus = 'PENDIENTE_VERIFICACION' | 'PENDIENTE_APROBACION' | 'ACTIVA' | 'BLOQUEADA' | 'DESACTIVADA';
type Role = 'ADMIN' | 'COORDINADOR' | 'DOCENTE';
interface AccessTokenResponse { accessToken: string; expiresIn: number }
interface MeResponse { id: string; nombre: string; rol: Role | null; institucionId: string | null; estado: AccountStatus }
interface GenericMessage { mensaje: string }
interface VerifyEmailResponse { estado: AccountStatus }
interface ProblemBody { type: string; title: string; status: number; errores?: { campo: string; reglas: string[] }[] }
```

Validación del cliente: es una ayuda; **el backend es la autoridad**.

| Campo | Regla | Origen |
|---|---|---|
| `nombre` | Con al menos un carácter visible; máximo 120 | `RegisterDto` |
| `correo` (registro, reenvío, recuperación) | Máximo 254; patrón `RAW_EMAIL_PATTERN` | `RegisterDto`, `EmailOnlyDto` |
| `correo` (login) | No vacío; máximo 320. Sin validar formato, igual que el backend | `LoginDto` |
| `password` (nueva) | De 12 a 128 **puntos de código** (`Array.from(valor).length`), sin recortar espacios | `password-policy.ts` |
| `password` (login) | No vacía; máximo 1024 | `LoginDto` |

Traducción de problemas a la interfaz (por `type`, sin mostrar códigos; el `title` del backend solo se muestra donde se indica):

| `urn:omr-preicfes:problema:…` | Tratamiento |
|---|---|
| `solicitud-invalida` | `errores[].campo` marca el campo. `reglas` no se muestra: son nombres internos del validador |
| `credenciales-invalidas` | Muestra el `title` genérico del backend y una orientación general fija, sin condiciones: «¿No puedes entrar? Si acabas de crear tu cuenta, confirma tu correo; algunas cuentas necesitan la aprobación de un administrador». Borra la contraseña (RN-05, RN-09) |
| `desafio-requerido` | §2.6 |
| `politica-password` | Error junto al campo con la política publicada |
| `enlace-invalido` | Estado de enlace no válido, con la acción propia de cada flujo (§2.5) |
| `demasiados-intentos` | Mensaje con `Retry-After`; sin esa cabecera, «intenta más tarde». Botón deshabilitado durante la espera |
| `limitador-no-disponible`, `servicio-saturado`, `verificacion-no-disponible` | «Servicio no disponible», con reintento |
| `no-autenticado` | §2.4 |
| `acceso-denegado` en `/me` | Sin acceso a rutas privadas; mensaje de cuenta no habilitada y cierre de sesión. **Sin reintentos** |
| `origen-no-permitido` | Mensaje genérico; indica un error de configuración |
| `error-interno`, tipo desconocido, fallo de red | Mensaje genérico con reintento; lo escrito se conserva |

Las respuestas 202 muestran el `mensaje` del backend tal como llega (RN-05). El correo de «Revisa tu correo» se conserva solo en memoria, no en `history.state`, y tras recargar se ofrece `/reenviar-verificacion`.

### 9.2 Eventos y jobs
No hay colas. Eventos del navegador: `BroadcastChannel('omr-auth')` con `{ tipo: 'logout' }`, sin más datos, y el candado `omr-auth-refresh` (RN-12).

### 9.3 Tipos compartidos frontend ↔ backend
No hay paquete compartido (sigue abierto en DT-01). Según HT-AUTH-01 plan §9.3: copia en `features/auth/api/types.ts`, verificada por las pruebas E2E contra el backend real.

### 9.4 Variables de entorno
| Variable | Estado | Uso | Decisión |
|---|---|---|---|
| `VITE_CAPTCHA_SITE_KEY` | **Nueva, aprobada** (DEC-09) | Sitekey pública de Turnstile; es la única variable de CAPTCHA que llega al navegador | `envPrefix` queda en el valor por defecto (`VITE_`) |
| `API_PROXY_TARGET` | **Nueva**, parte de DEC-01 | Destino del proxy de Vite: `http://localhost:3000` en el host y `http://backend:3000` en Compose. Solo servidor de desarrollo; sin prefijo `VITE_`, no llega al navegador | DEC-01 |
| `CAPTCHA_SECRET` | Existente | Solo backend. Nunca se pasa al servicio `frontend` ni lleva prefijo `VITE_` | DEC-09 |
| `CAPTCHA_SITE_KEY` | Existente; **el frontend no la usa** | Marcador que documenta HT-AUTH-01; el backend no la lee, pero `env-template.spec.ts` exige que siga en la plantilla | Se conserva; ver §15 |

**Restricciones de la prueba `apps/backend/src/config/env-template.spec.ts` (HT-AUTH-01):**
- Trata como variables de autenticación todo lo que hay **desde** el bloque `# --- Autenticación (HT-AUTH-01` **hasta el final** de `.env.docker.example`, y exige que coincidan con la sección de autenticación de `docs/onboarding/02-variables-entorno.md`.
- Por eso el bloque de frontend va **antes** de ese bloque en la plantilla y se documenta en una sección propia con encabezado `##`. Añadirlo al final rompería esa prueba.
- T-01 ejecuta esa prueba para comprobarlo. No se modifica.

**Carga:** Vite lee `apps/frontend/.env.local` en el host (ignorado por Git). Compose pasa las dos variables con `environment`, sin `env_file`, porque `.env` raíz contiene secretos. `envDir` no apunta a la raíz.

## 10. Dependencias
| Tipo | Dependencia | Estado | Impacto si no está lista |
|---|---|---|---|
| Historia | HT-AUTH-01 | En `develop` (PR #4, 2026-11-05); sigue `in-progress` por T-33, T-34, T-41 y T-43, de release | No bloquea. Su T-41 condiciona solo la prueba manual con el widget real |
| Historia | HT-CORE-01 | Fusionada | — |
| Historia | HU-UX-001 | Sin spec | No bloquea: `DESIGN.md` queda limitado a este módulo (DEC-10) |
| Historia | Aprobación de cuentas (sin ID) | Sin crear | Las pruebas pasan cuentas a ACTIVA escribiendo en la base, como en HT-AUTH-01 |
| Técnica transversal | DT-05 | Resuelta por `HT-AUTH-01/DEC-13` | — |
| Técnica transversal | DT-01 (variables públicas y paquete de tipos) | Abierta | Lo resuelven DEC-09 y §9.3 para esta historia; la convención `VITE_*` puede servir de base |
| Técnica transversal | DT-08 (CI) | Pendiente | Pruebas ejecutadas en local |
| Servicio externo | Credenciales de Turnstile | Pendientes en HT-AUTH-01 | Bloquea solo la prueba manual con el widget real (T-06) y el release a producción |
| Librería nueva | `react-router` — enrutado | **Aprobada** (DEC-02) | Necesaria para las rutas |
| Librería nueva | `@playwright/test` y `@axe-core/playwright` — E2E y accesibilidad | Aprobadas por `HT-AUTH-01/DEC-13`; sin instalar | Necesarias para CA-12 y CA-13 |

No se agregan librerías de estado, formularios ni peticiones: `fetch`, Context y validación propia bastan.

## 11. Seguridad
- **JWT solo en memoria** (RN-02): variable privada del módulo de sesión; nunca en React DevTools a través de Context, que solo expone el estado de autenticación y los datos de `/me`.
- **Sin almacenamiento persistente** (RN-02): la prueba E2E inspecciona `localStorage`, `sessionStorage`, IndexedDB y `document.cookie`.
- **Cookie** (RN-03): el frontend no la toca.
- **CSRF, CORS y Origin** (RN-13): sin cabeceras propias ni sustitución de `Origin`; mismo origen por DEC-01.
- **Fragmento** (RN-06): capturado antes de renderizar. El token se envía solo en el cuerpo del `POST`; nunca en query, ruta, estado del enrutador ni `BroadcastChannel`.
- **Pantallas con token** (RN-07): sin recursos externos, comprobado en E2E. `<meta name="referrer" content="no-referrer">` en `index.html`, y cabecera `Referrer-Policy` en el despliegue (§15).
- **CSP** (`HT-AUTH-01/DEC-24` la asigna a esta historia): `script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src 'self'`. Su aplicación depende del servidor del despliegue (§15). Fuentes, imágenes y estilos solo del propio origen.
- **Turnstile** (RN-10): el script se carga solo tras un desafío en Inicio de sesión. Como las pantallas con token se abren desde el correo con una carga completa, el script no llega a ellas.
- **Redirección** (RN-16): el retorno solo admite rutas privadas internas conservadas en memoria; no hay parámetro `redirect`.
- **Secreto de CAPTCHA** (DEC-09): solo en backend; comprobado en el bundle (V-6).
- **Registros** (RN-11): sin `console.*` con datos; regla `no-console` de ESLint en `features/auth`; los errores interpretados no conservan cuerpos ni valores enviados. Sin analítica.
- **Autorización** (RN-08): `RequireAuth` solo decide qué se muestra; toda ruta privada futura sigue dependiendo del backend.
- **PII y auditoría:** el frontend no persiste datos personales; la auditoría es del backend.
- **Archivos subidos:** no aplica.

## 12. Estrategia de pruebas
Herramientas (`HT-AUTH-01/DEC-13`): Vitest + Testing Library; Playwright + `@axe-core/playwright`. Los E2E usan **backend real**, MongoDB, Redis y Mailpit de Compose; el enlace se lee de la API de Mailpit. La única sustitución es el script de terceros de Turnstile (DEC-06); la validación final se hace a mano con el widget real. Cada ejecución usa correos únicos `*@example.test`, sin datos personales reales. Los casos 503 y de red, difíciles de provocar de forma fiable, se cubren en Vitest con `fetch` falso, solo en pruebas.

| CA / RN | Nivel | Caso | Herramienta | Datos de prueba |
|---|---|---|---|---|
| CA-01 | E2E | Inicio de sesión con cuenta ACTIVA contra el endpoint real | Playwright | Cuenta pasada a ACTIVA en la base |
| CA-02 | Componente + E2E | Sin campos de rol o institución; el cuerpo enviado solo lleva `nombre`, `correo`, `password` | Vitest, Playwright | Correo único |
| CA-03 | E2E | Tras 202 se muestra Revisa tu correo | Playwright | Correo único |
| CA-04 | E2E | Enlace de Mailpit → confirmar → verificado; abrir sin confirmar no consume; reenvío; enlace usado → reenviar | Playwright | Correo único |
| CA-05 | E2E | Tras verificar se ve el mensaje de aprobación; el login da error genérico y `/inicio` no abre | Playwright | Cuenta PENDIENTE_APROBACION |
| CA-06 | E2E | Solicitar → enlace → nueva contraseña → login nuevo correcto y anterior rechazado; enlace usado | Playwright | Cuenta ACTIVA |
| CA-07 | E2E | Login y logout reales; tras logout, `/inicio` redirige y recargar no restaura | Playwright | Cuenta ACTIVA |
| CA-08 | E2E + unit | Recargar conserva la sesión; `StrictMode` hace una sola renovación; sin cookie → anónima; 503 → `no-disponible` | Playwright, Vitest | Cuenta ACTIVA |
| CA-09 | Componente + E2E | Sin sesión o con estado distinto de ACTIVA, sin acceso; 403 de `/me` sin bucle | Vitest, Playwright | Estados simulados en Vitest |
| CA-10 | Componente + E2E | Por pantalla: validación, doble envío, cada tipo de problema de §9.1; 422 y 429 reales | Vitest, Playwright | Cuarta solicitud de recuperación para el 429 |
| CA-11 | Componente + E2E + manual | Cinco fallos → widget → intento con `captchaToken`; `action: 'login'`; `reset` tras cada intento; sin sitekey, sin vía alternativa. Validación final manual con el widget real | Vitest, Playwright, manual | Adaptador `test` del backend y script sustituido; credenciales reales para la prueba manual |
| CA-12 | E2E | Las pantallas en 375 px y 1280 px; zoom al 200 %; recorrido con teclado | Playwright | — |
| CA-13 | E2E | La suite completa contra el backend real | Playwright | — |
| CA-14 | E2E + componente | Enlace real de `bootstrap:admin` → definir contraseña → `POST /activate` → login correcto; abrir sin confirmar no consume; recarga sin token; enlace usado sin remitir a recuperación | Playwright, Vitest | Base aislada sin administrador; correo de Mailpit |
| CA-15 | E2E + unit | Sin ruta previa → `/inicio`; ruta privada solicitada → regresa; valores externos o desconocidos → `/inicio` | Playwright, Vitest | `//otro.example`, `https://otro.example`, ruta inexistente |
| RN-01 | Revisión + E2E | Sin datos simulados en `src/`, salvo archivos de prueba; rutas `/api/v1/auth` reales | Playwright | — |
| RN-02 | E2E | Almacenes del navegador sin tokens ni contraseñas tras login y recarga | Playwright | Cuenta ACTIVA |
| RN-03 | E2E | La cookie es `HttpOnly`: `document.cookie` no la expone, y la renovación funciona | Playwright | Cuenta ACTIVA |
| RN-04 | Componente | Igual que CA-02 | Vitest | — |
| RN-05 | E2E | Mismo texto para correo existente e inexistente en registro, reenvío, recuperación y login | Playwright | Dos correos |
| RN-06 | E2E + unit | La URL no conserva `#token`; al recargar no hay token; sin `POST` hasta confirmar | Playwright, Vitest | Enlace de Mailpit |
| RN-07 | E2E | En pantallas con token, ninguna solicitud a otro origen; política de referente presente | Playwright | Enlace de Mailpit |
| RN-08 | Componente + E2E | Igual que CA-09 | Vitest, Playwright | — |
| RN-09 | E2E | Igual que CA-05 | Playwright | — |
| RN-10 | Componente | Fallo o ausencia del widget no permite continuar; 503 mantiene el bloqueo | Vitest | — |
| RN-11 | E2E | La consola durante los flujos no contiene la contraseña, el JWT ni el token del enlace | Playwright | Valores conocidos |
| RN-12 | E2E | Dos pestañas recargan a la vez: la sesión sigue viva. Logout en una: la otra se limpia | Playwright | Cuenta ACTIVA |
| RN-13 | E2E | Los `POST` llevan `Origin` permitido y no hay 403 ni errores de CORS | Playwright | — |
| RN-14 | Revisión | Sin rutas ni acciones de aprobación o administración | Revisión de rutas | — |
| RN-15 | Componente + E2E | La activación solo llama a `/activate` y no a `/password/reset`; sus textos y su enlace no válido no mencionan la recuperación | Vitest, Playwright | Igual que CA-14 |
| RN-16 | Unit | `safe-return` rechaza esquemas, `//`, barras invertidas y rutas no registradas | Vitest | Igual que CA-15 |
| RNF-01 | E2E | `axe` sin violaciones serias en cada pantalla y estado principal; foco y `aria-live` | Playwright + axe | — |
| RNF-02 | Componente + E2E | Pegar funciona; `autocomplete`; 11, 12, 128 y 129 caracteres; emoji cuenta como uno | Vitest, Playwright | — |
| RNF-03 | Revisión | `lang="es"` y textos en español, sin términos técnicos visibles | Vitest | — |
| RNF-04 | E2E de compatibilidad | Comprobaciones V-1 a V-6 de §8; la prueba V-5 corre en Chromium, Firefox y WebKit | Playwright | Cuenta ACTIVA; un 429 real |

Otras comprobaciones: `pnpm lint`, `typecheck`, `test` y `build` en verde; `env-template.spec.ts` del backend sigue en verde tras añadir las variables. Vitest excluye `e2e/`.

## 13. Observabilidad y rendimiento
- El frontend no envía telemetría ni analítica; el rastreo usa `X-Request-Id` del backend, sin mostrarlo en esta versión.
- Pantallas con carga diferida por ruta; Turnstile solo cuando se pide. No hay requisito de volumen.

## 14. Decisiones técnicas
| ID | Decisión | Alternativas consideradas | Motivo | Fecha |
|---|---|---|---|---|
| DEC-01 | **Aprobada (2026-11-05),** con la condición de verificar `Origin` y `Retry-After` (§8). Mismo origen: rutas relativas `/api/v1`; proxy de Vite en desarrollo, con `API_PROXY_TARGET`; proxy inverso en el despliegue | a) Llamadas directas a `http://localhost:3000` con `credentials: 'include'`: sin indicar el tiempo de espera, porque `Retry-After` no está expuesto; b) pedir a HT-AUTH-01 exponerlo: cambio de backend, prohibido aquí | Permite leer `Retry-After` sin tocar el backend, evita CORS y garantiza el mismo sitio de la cookie | 2026-11-05 |
| DEC-02 | **Aprobada (2026-11-05).** `react-router` en modo declarativo | a) Enrutador propio: más código y más riesgo en accesibilidad; b) TanStack Router: más de lo necesario | Dependencia estándar y suficiente; el esqueleto no tiene enrutador | 2026-11-05 |
| DEC-03 | **Aprobada (2026-11-05).** Sesión con Context y un controlador fuera de React; sin librería de estado | Zustand, Redux, TanStack Query | Estado pequeño; el token no debe pasar por el árbol de React | 2026-11-05 |
| DEC-04 | **Aprobada (2026-11-05).** Renovación al cargar y ante un 401 `no-autenticado` de una ruta protegida (no ante los 401 del inicio de sesión, §2.4), sin temporizador | Renovar antes de vencer | Menos rotaciones y menos riesgo de carreras | 2026-11-05 |
| DEC-05 | **Rechazada; reemplazada por DEC-09 (2026-11-05).** Conservar `CAPTCHA_SITE_KEY` y exponerla con `envPrefix: ['VITE_', 'CAPTCHA_SITE_']` | `VITE_TURNSTILE_SITE_KEY`: nombre nuevo y documentación por cambiar | No inventa una variable; el prefijo no coincide con `CAPTCHA_SECRET` | 2026-11-05 |
| DEC-06 | **Aprobada (2026-11-05).** E2E con el backend real, su adaptador `test` y el script de Turnstile sustituido por una intercepción de Playwright que entrega `captcha-de-prueba-valido`, mientras no existan credenciales. Prueba manual con el widget real para la validación final (T-06) | a) Solo el widget real: depende de un tercero y de credenciales ausentes; b) Claves de prueba de Cloudflare con `CAPTCHA_PROVIDER=turnstile`: sin comprobar si pasan la validación de `hostname` y `action` | El backend sigue siendo real; solo se sustituye el script externo. Se documenta como límite de la prueba | 2026-11-05 |
| DEC-07 | **Aprobada (2026-11-05).** Sin paquete compartido: copia de tipos verificada por E2E | Paquete compartido: exige decidir workspaces (DT-01) | Es lo que prevé HT-AUTH-01 plan §9.3 | 2026-11-05 |
| DEC-08 | **Reemplazada por DEC-12 (2026-11-05).** E2E en Chromium, con viewport móvil y de escritorio | Agregar WebKit y Firefox | La cookie `Secure` en `http://localhost` puede no aceptarse en WebKit (sin comprobar); revisar antes de ampliar | 2026-11-05 |
| DEC-09 | **Aprobada (2026-11-05).** `VITE_CAPTCHA_SITE_KEY` como variable pública independiente; `envPrefix` por defecto; `CAPTCHA_SECRET` solo en backend | DEC-05 con `envPrefix`: aunque el prefijo se limite, abre la exposición de variables `CAPTCHA_*` | Separa por completo lo público del secreto | 2026-11-05 |
| DEC-10 | **Aprobada (2026-11-05).** Dirección visual sencilla y `DESIGN.md` limitados a este módulo (§2.7) | a) HTML semántico sin dirección, como preveía HT-AUTH-01; b) Identidad global: es de HU-UX-001 | Da coherencia a las pantallas sin inventar una marca | 2026-11-05 |
| DEC-11 | **Aprobada (2026-11-05).** Activación como pantalla y solicitud propias; comparte con el restablecimiento solo el campo de contraseña | Reutilizar «Crear nueva contraseña», como preveía HT-AUTH-01 | El desarrollador pide no confundirlas; difieren en endpoint, textos y salida ante un enlace no válido | 2026-11-05 |
| DEC-12 | **Aprobada (2026-11-05).** Suite E2E completa en Chromium, con viewport móvil y de escritorio; compatibilidad de sesión (V-5) en Chromium, Firefox y WebKit. Un fallo solo local en Firefox o WebKit se documenta | a) Suite completa en los tres motores: más lenta y sin más riesgo que cubrir; b) Solo Chromium: no cumple la corrección | Comprueba lo que depende del navegador (cookies, Web Locks) con coste acotado. `Secure` en `http://localhost` puede fallar en WebKit, sin afectar a producción con HTTPS | 2026-11-05 |

| DEC-13 | **Aprobada (2026-11-05).** Entorno aislado para T-01 y E2E: imagen propia del backend en `127.0.0.1:3100`, base `omr_preicfes_e2e`, Redis 1 y Vite en `http://localhost:5174`, con ese origen permitido. No se tocan los contenedores, la base ni el puerto 5173 de desarrollo | Reconstruir Compose y migrar la base de desarrollo; detener el contenedor `frontend` | Las imágenes de Compose son del 2026-10-29, sin HT-AUTH-01. Las comprobaciones V-1 a V-6 valen igual con este origen | 2026-11-05 |

## 15. Riesgos y OPEN QUESTIONS técnicas
- [x] ~~**DEC-01: ¿mismo origen?**~~ **Resuelta (2026-11-05):** aprobada, sujeta a las comprobaciones de §8.
- [x] ~~**Compose.**~~ **Resuelta (2026-11-05):** `environment` con `API_PROXY_TARGET` y `VITE_CAPTCHA_SITE_KEY`, sin `env_file` (§9.4).
- [x] ~~**Servidor de producción del frontend.**~~ **Resuelta (2026-11-05):** T-06 documenta los requisitos de proxy inverso, CSP y `Referrer-Policy`, con la `meta` de referente en `index.html`. El despliegue y la configuración definitiva quedan fuera de esta historia, pendientes de definición.
- [x] ~~**`CAPTCHA_SITE_KEY` queda sin uso.**~~ **Resuelta (2026-11-05):** se conserva en la plantilla de HT-AUTH-01, que no se modifica. La documentación del frontend indica que no se use.
- [x] ~~**Decisiones aún en propuesta.**~~ **Resuelta (2026-11-05):** DEC-03, DEC-04, DEC-07 y DEC-12 aprobadas.
- [x] ~~**`specs/HT-AUTH-02/` fuera del backend.**~~ **Cumplida:** el PR #4 no incluye la carpeta; sigue sin confirmar en el árbol de trabajo.
- [ ] **Credenciales de Turnstile:** faltan el widget en Cloudflare y los dominios autorizados. Sin ellos no se puede hacer la prueba manual de T-06, que quedaría como pendiente de release. No bloquea el desarrollo. **T-06 (2026-11-06):** no se aportaron credenciales: la prueba manual queda **pendiente de release**, sin ejecutar.
- [x] ~~**Rama.**~~ **Resuelta (2026-11-05):** `feature/HT-AUTH-02` creada desde `develop` (`d1b5eeb`).
- [x] ~~**Datos E2E:** escribir en Mongo requiere un cliente solo de pruebas. Los límites de intentos pueden acumularse entre ejecuciones por compartir IP: usar una base y un Redis aislados, con límites locales propios.~~ **Resuelta en T-01, T-04 y T-06:** entorno aislado de DEC-13 y `e2e/support/test-db.mjs`.
- [ ] **Riesgo: sesión cerrada por reutilización.** Una respuesta de `/refresh` perdida, o un navegador sin Web Locks, puede cerrar la sesión. Riesgo aceptado en HT-AUTH-01; la interfaz muestra un aviso y lleva a Inicio de sesión. **Reproducido en T-06 (2026-11-06), sin modificar nada:** dos recargas seguidas, con la primera renovación en curso, revocan la sesión: 2 de 3 intentos en Chromium, 3 de 3 en Firefox y 0 de 3 en WebKit sobre HTTPS, donde la renovación interrumpida no se perdió. También al navegar con carga completa antes de que termine la renovación (2 de 3 en Chromium, 1 de 3 en Firefox). El backend procesa la primera renovación y rota la cookie, el navegador descarta la respuesta y la siguiente reutiliza la anterior. **Matiz sobre el aviso:** en este caso no hay aviso, porque tras una recarga aún no hay token de acceso y un 401 no se distingue de no tener sesión; la persona llega a Inicio de sesión sin explicación. Esperando a que termine la renovación no ocurre (9 de 9 sin pérdida). **Pendiente de decisión del desarrollador.**
- [x] ~~**Riesgo: prueba existente.** `App.test.tsx` comprueba el título del esqueleto de HT-CORE-01; se adapta sin perder lo que verifica.~~ **Resuelto en T-01.**
- [ ] **Riesgo: `no-referrer` y Turnstile (2026-11-06, sin comprobar).** La `meta` de referente aplica a todo el documento, también a Inicio de sesión. Falta comprobar si el widget real funciona sin referente; hasta tener credenciales no se puede saber. Se revisa en la prueba manual de T-06. Con `fetch` en modo `cors`, el `Origin` de los `POST` no cambia: comprobado solo en Chromium (`e2e/registro-verificacion.spec.ts`). **Comprobado en T-06 (2026-11-06), sin credenciales:** con el bundle de producción, la CSP de §11 y `Referrer-Policy: no-referrer`, en los tres motores, el script real de Cloudflare carga sin `Referer`, crea su iframe, entrega un token con la sitekey de prueba de Cloudflare y ese token llega al backend, sin violaciones de CSP. Los `POST` llevan `Origin` y no `Referer`. **Sigue sin comprobar:** una sitekey real valida los dominios autorizados, y la de prueba no sirve para saber si esa validación acepta la ausencia de referente. El adaptador `test` del backend rechaza el token, de modo que tampoco se verificó la validación real con Cloudflare. Se resuelve en la prueba manual, antes de publicar.
- [ ] **Límite: WebKit en `http://localhost` (T-06, 2026-11-06).** WebKit de Playwright en Windows guarda la cookie `Secure` pero no la envía sobre `http://localhost`: tras iniciar sesión, `/refresh` responde 401. Es el límite local previsto en DEC-12; no se cambió el backend. Sobre HTTPS, por un proxy TLS de pruebas que reescribe `Origin`, el ciclo completo funciona. Efecto: en desarrollo con ese motor, cada recarga pide entrar otra vez. **Sin verificar:** Safari real; cómo aplica `SameSite=Strict` ese motor, que informa `None` a Playwright aunque la cabecera recibida dice `Strict`.
- [ ] **Compatibilidad, alcance real (DEC-12).** La suite completa corre solo en Chromium. Firefox y WebKit corren la compatibilidad de sesión, enlaces, dos pestañas y desafío; `axe` y las medidas de adaptación son solo de Chromium.
- [ ] **Límite: 403 `acceso-denegado` sin cierre en el servidor.** `/logout` pasa por el mismo guard que `/me`, de modo que una cuenta sin rol o institución coherentes no puede revocar su sesión desde el frontend: solo se limpia el estado local y la cookie sigue vigente hasta su vencimiento. Cada recarga vuelve a dar 403, sin bucle. Corregirlo exigiría cambiar el backend, fuera de esta historia. **Aceptado por el desarrollador como riesgo conocido (2026-11-06): no se modifica HT-AUTH-01 ni se intenta resolver desde el frontend; queda pendiente de una futura tarea de backend, sin ID asignado.**

**Decisiones pendientes de los requisitos aportados que el código ya resuelve:**

| Pendiente | Resultado |
|---|---|
| Endpoints, prefijos y DTO | §8 y §9 |
| Renovación y CSRF | Cookie rotada de un solo uso, `SameSite=Strict` y validación de `Origin`; sin token CSRF |
| Formato de los enlaces | `{APP_PUBLIC_URL}/verificar-correo#token=…`, `/restablecer-contrasena#token=…` |
| Variable de la sitekey | `VITE_CAPTCHA_SITE_KEY` (DEC-09) |
| Formato del enlace de activación | `{APP_PUBLIC_URL}/activar-cuenta#token=…` |

## 16. Checklist de plan listo (`status: ready`)
- [x] Cada CA y RN de la spec tiene diseño y estrategia de prueba.
- [x] Colecciones con `collection:` explícito, validaciones y `schemaVersion`. *(No aplica: sin colecciones.)*
- [x] Cada índice justificado por una consulta o regla. *(No aplica.)*
- [x] Decisión de transacciones coherente con replica set (DT-02). *(No aplica.)*
- [x] Endpoints y contratos completos.
- [x] Sin tecnologías fuera de la arquitectura aprobada. *(`react-router` aprobado, DEC-02.)*
- [x] Ningún ID (`RN`/`CA`/`RNF`) citado aquí falta en la spec (el validador informa 15 CA, 16 RN y 4 RNF, sin IDs huérfanos).
- [x] `scripts/sdd-validate.ps1 -Id HT-AUTH-02` sin `[FALLA]`. **Superada (2026-11-07)** tras la aprobación de `plan.md`: «trazabilidad válida (0 avisos)», con spec `in-review`, plan `ready` y tasks `in-review`.
- [x] `spec.md` en `ready` o posterior. **Estado real (2026-11-07): `in-review`.** Pasó por `ready` (2026-11-05) e `in-progress`, y el desarrollador la movió a `in-review` para el cierre; el validador acepta `in-review` como posterior a `ready`.

## 17. Registro de cambios
No borrar decisiones ni contenido aprobado: las decisiones superadas se marcan «reemplazada por DEC-NN»; lo obsoleto se tacha con su motivo.

| Fecha | Cambio | Motivo (CA/RN/spec §14) | Estado previo → nuevo |
|---|---|---|---|
| 2026-11-05 | Creación con `/sdd-spec` | Requisitos aportados (spec §14) | — → draft |
| 2026-11-05 | Decisiones del desarrollador. Aprobadas DEC-01, DEC-02 y DEC-06; DEC-05 reemplazada por DEC-09; DEC-08 reemplazada por DEC-12. Nuevas DEC-09, DEC-10, DEC-11 y DEC-12. Activación propia (§2.5, §8), retorno seguro (§2.3), mensajes de inicio de sesión (§9.1), verificación del proxy y las cookies (§8, V-1 a V-6), variables y restricciones de `env-template.spec.ts` (§9.4), dirección visual (§2.7) y pruebas de CA-14, CA-15, RN-15, RN-16 y RNF-04 (§12) | Spec §14 | draft → draft |
| 2026-11-05 | Aprobadas DEC-03, DEC-04, DEC-07 y DEC-12 y las rutas públicas; producción solo documentada (§15). HT-AUTH-01 ya en `develop` (§10). Queda abierto solo «`spec.md` en `ready`» en §16 | Spec §14 | draft → draft |
| 2026-11-05 | Autorización expresa del desarrollador tras revisar el checklist §16 | Spec §14 | draft → ready |
| 2026-11-05 | DEC-13: T-01 se ejecuta en entorno aislado, por instrucción del desarrollador, tras detectar imágenes de Compose desactualizadas | Verificación del entorno de T-01; no cambia comportamiento | ready → ready |
| 2026-11-05 | T-01: V-1 a V-4 y V-6 superadas; dirección de §2.7 concretada como «Manual con separadores» (elección del desarrollador), documentada en `DESIGN.md`. Sin cambios de diseño técnico | Compuerta de §2.7 | ready → ready |
| 2026-11-06 | T-02, detalles de implementación que no cambian contratos ni comportamiento aprobado: el contexto de sesión va en `session/session-context.ts`; `anonima` lleva un `motivo` (`sesion-perdida`, `cuenta-no-habilitada` o ninguno) para los avisos de §2.4 y §9.1; tras omitirse en una ruta con token, la restauración ocurre al salir de ella. Límite del 403 registrado en §15 | Implementación de T-02 | ready → ready |
| 2026-11-06 | T-03, detalles que no cambian contratos: un token mal formado (400 `solicitud-invalida`) se trata como enlace no válido; los formularios comparten `forms/use-api-action.ts`; al navegar dentro de la aplicación, `AuthPage` mueve el foco al título y actualiza `document.title` (RNF-01). Riesgo de `no-referrer` con Turnstile registrado en §15 | Implementación de T-03 | ready → ready |
| 2026-11-06 | T-04, detalles que no cambian contratos: nuevo motivo de fin de sesión `cierre-de-sesion`, para no recordar la ruta tras un cierre voluntario; tras `desafio-requerido` el reenvío lo hace la persona, sin envío automático; una cuenta autenticada que no esté ACTIVA va a iniciar sesión con aviso y no se redirige de vuelta; la ruta de retorno se guarda en memoria, sin parámetro `redirect`. Pruebas: `e2e/support/test-db.mjs` cambia cuentas solo en `omr_preicfes_e2e` (§10, §15), y el entorno aislado sube a `600/15m` `RATE_LIMIT_LOGIN_IP_FAILURE` y `RATE_LIMIT_LOGIN_CHALLENGE_IP`, porque todas las pruebas comparten IP; el límite por cuenta sigue en `5/15m` | Implementación de T-04 | ready → ready |
| 2026-11-06 | T-05, detalles que no cambian contratos: restablecer y activar comparten `forms/use-link-password-form.ts`, sin textos ni solicitudes, que siguen en cada pantalla (DEC-11); la activación oculta la barra de trámites porque ofrece la recuperación (RN-15); tras restablecer, «Ir a Iniciar sesión» recarga la aplicación, porque el backend ya revocó la sesión de ese navegador; un enlace abierto en una pestaña que ya está en su ruta solo cambia el fragmento, así que se recarga para pasar por la captura normal (RN-06, corrige T-03). Pruebas: un segundo backend aislado (puerto 3101, Vite 5175, Redis 2) usa una base nueva `omr_preicfes_e2e_activacion_<marca>` en cada ejecución, porque `bootstrap:admin` exige que no haya administrador activo; migra con `NODE_ENV=production` para omitir el seed. Amplía §10 y §15: además de cambiar cuentas, las pruebas adelantan `expira_en` en `tokens_seguridad`, solo en bases aisladas. Las bases de activación no se borran; limpiarlas requiere autorización | Implementación de T-05 | ready → ready |
| 2026-11-06 | T-06, ajustes que no cambian contratos ni arquitectura: el cargador de Turnstile agota el plazo a los 15 s, retira el script y permite reintentar, sin vía alternativa (RN-10); `lang="es-CO"` (RNF-03); el saludo no desborda con nombres largos y los enlaces secundarios miden 44 px. Pruebas: proyectos `firefox`, `webkit` y `webkit-https` con `e2e/compatibilidad-flujos.spec.ts`; proxy TLS solo de pruebas (`e2e/support/tls-proxy.mjs`); `playwright.produccion.config.ts` y `e2e/manual/produccion-csp.spec.ts`, con el bundle y las cabeceras de `docs/onboarding/06-frontend-autenticacion.md`, que concreta la CSP de §11 con `style-src`, `img-src`, `font-src`, `default-src`, `base-uri`, `form-action`, `object-src` y `frame-ancestors`. El entorno aislado sube a `5000/...` los límites por IP, porque tres navegadores comparten IP (por cuenta y por token no cambian), y al reemplazar un contenedor lo detiene y renombra en vez de eliminarlo. Riesgos y resultados en §15 | Implementación de T-06 | ready → ready |
| 2026-11-07 | Rediseño visual pedido por el desarrollador (§2.7): «Panel institucional + tarjeta» reemplaza a «Manual con separadores»; se elimina la barra de trámites y `showFlows`, y los enlaces relacionados pasan a cada pantalla. Sin cambios de lógica, contratos, sesión, rutas ni criterios. DEC-10 sin cambios | Pedido del desarrollador | ready → draft, a la espera de revisión |
| 2026-11-07 | Ajustes visuales de la revisión final documentados en §2.7: distribución del panel, columnas `0.72fr / 1fr`, alineación en tableta, radio de la tarjeta, validación sin saltos y orden de la animación de la hoja OMR. `DESIGN.md` y `.impeccable/design.json` reescritos desde lo implementado. Sin cambios de lógica, contratos, sesión, rutas ni criterios. DEC-10 sin cambios | Autorización del desarrollador | draft → draft, a la espera de revisión |
| 2026-11-07 | Correcciones documentales pedidas por el desarrollador antes de aprobar: §1 y §2.1 registran el script operativo `start:local` de `apps/backend/package.json`, sin cambios en `apps/backend/src`; §2.7 actualiza la descripción inicial; §8 distingue V-1 a V-6 comprobadas, pendientes y solo documentadas para producción; §16 refleja `spec.md` en `in-review` y el validador sin superar. Sin cambios de contratos, decisiones ni criterios | Revisión del desarrollador | draft → draft, a la espera de aprobación |
| 2026-11-07 | Aprobación expresa del desarrollador tras revisar el contenido completo, incluido el rediseño (§2.7) y las correcciones de §1, §2.1, §8 y §16 | Aprobación de JulianD27-ia, 2026-11-07 | draft → ready |
