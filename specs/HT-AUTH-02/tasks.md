---
id: HT-AUTH-02
spec: ./spec.md
plan: ./plan.md
status: in-review        # draft | ready | in-progress | in-review | done
updated: 2026-11-07
---

# HT-AUTH-02 — Tasks

Rama de implementación: `feature/HT-AUTH-02`, creada desde `develop` (`d1b5eeb`), que ya incluye HT-AUTH-01 (PR #4). Estos documentos están sin confirmar en esa rama.

Reglas:
- Generado por `/sdd-spec` y actualizado con `/sdd-tasks`. Pasa a `ready` solo cuando spec y plan están en `ready` y la trazabilidad se valida (`scripts/sdd-validate.ps1 -Id HT-AUTH-02`).
- No se implementa con este archivo en `draft`.
- Por decisión del desarrollador, la historia tiene **seis tareas**. Las actividades de cada una se agrupan en su sección y no llevan ID propio. Una tarea puede abarcar varios commits.
- Una tarea solo se marca `[x]` cuando pasa toda su verificación; registrar evidencia y commits.
- Si durante la implementación el plan resulta incorrecto, actualizar primero `plan.md` y luego estas tareas.
- Al actualizar: nunca borrar ni desmarcar tareas `[x]` ni su evidencia; no renumerar.

Fases de la plantilla sin tareas: datos, dominio y servicios, y API o jobs **no aplican**, porque el frontend no tiene persistencia ni servicios propios (plan §3 y §8).

## Tareas
| ID | Tarea | Cubre | Plan § | Verificación | Estado | Evidencia |
|---|---|---|---|---|---|---|
| T-01 | Preparación e integración | CA-10, CA-12, RN-01, RN-13, RN-14, RNF-01, RNF-03, RNF-04 | §2.1, §2.3, §2.7, §8, §9.4, §10, §14 | Comprobaciones V-1 a V-4 y V-6 de plan §8; dirección visual confirmada; `lint`, `typecheck`, `test` y `build`; `env-template.spec.ts` en verde | [x] | 2026-11-05, modo aislado (DEC-13). `apps/frontend/`: proxy, rutas, `src/features/auth/components/`, `e2e/`; `DESIGN.md`. Playwright en Chromium: 21 de 21, con V-1 a V-4, V-5 solo en Chromium, y `axe` a 375, 640 y 1280 px en los cuatro flujos. V-6 con `e2e/support/check-bundle.mjs`: OK. Vitest: 24 de 24. `lint`, `typecheck`, `build` y `env-template.spec.ts` (5 de 5): OK. Compose: `config --quiet` con salida 0; proxy en contenedor temporal con `200`, `202` con origen permitido y `403` con origen ajeno. Dirección «Manual con separadores» confirmada por el desarrollador |
| T-02 | Servicio API y gestión de sesión | CA-08, CA-10, RN-01, RN-02, RN-03, RN-09, RN-11, RN-12, RN-13 | §2.3, §2.4, §8, §9.1, §9.2, §9.3, §11 | Vitest: tipos de problema, `Retry-After`, renovación única en `StrictMode`, estados de sesión, sin APIs de coordinación | [x] | 2026-11-06. `src/features/auth/api/` (`types`, `problem`, `http-client`, `auth-api`), `src/features/auth/session/` (`session-controller`, `session-context`, `SessionProvider`), `src/test/fake-auth-api.ts`, `no-console` en `eslint.config.js`; montado en `App.tsx`. Vitest: 125 de 125, con los 14 tipos de problema, `Retry-After`, una renovación en `StrictMode`, los cuatro estados y funcionamiento sin Web Locks ni `BroadcastChannel`. Mutaciones de un solo vuelo, candado y descarte de resultados antiguos: detectadas por las pruebas (ver el informe de T-02). `lint`, `typecheck`, `build` y V-6: OK. Playwright en Chromium contra el backend aislado: 21 de 21; V-5 ahora espera la restauración real y comprueba una sola renovación en `StrictMode` |
| T-03 | Registro y verificación | CA-02, CA-03, CA-04, CA-05, CA-10, RN-04, RN-05, RN-06, RN-07, RN-09, RNF-02 | §2.3, §2.5, §8, §9.1, §11 | Vitest: captura y limpieza del token, cuerpo sin rol ni institución, sin `POST` hasta confirmar, `estado` PENDIENTE_APROBACION | [x] | 2026-11-06. `src/features/auth/link-token/capture.ts`, `pages/` (`RegisterPage`, `CheckEmailPage`, `ResendVerificationPage`, `VerifyEmailPage`), `forms/`, `registration/pending-verification.ts`, `validation.ts`, `messages.ts`, `components/ActionLink.tsx`; carga diferida en `app/router.tsx`; captura en `main.tsx`; `meta` de referente en `index.html`. Vitest: 201 de 201. Playwright en Chromium contra el backend aislado y Mailpit: 64 de 64 (`e2e/registro-verificacion.spec.ts` agrega 43), con enlace real, 422 y 429 reales, consola y almacenes sin secretos, y `axe` sin violaciones en 9 estados a 375, 640 y 1280 px. `lint`, `typecheck`, `build` y V-6: OK. Inspección visual a 375 y 1280 px. Falta comprobar con `/inicio` privada que la cuenta pendiente no entra (T-04) |
| T-04 | Inicio de sesión y protección de rutas | CA-01, CA-05, CA-07, CA-09, CA-10, CA-11, CA-15, RN-05, RN-07, RN-08, RN-09, RN-10, RN-14, RN-16 | §2.3, §2.4, §2.6, §8, §9.1, §11 | Vitest: mensajes de rechazo idénticos, flujo de Turnstile sin vía alternativa, `RequireAuth`, `safe-return` y cierre con JWT vencido | [x] | 2026-11-06. `pages/LoginPage.tsx`, `pages/HomePage.tsx`, `session/RequireAuth.tsx`, `session/safe-return.ts`, `captcha/` (`turnstile-loader`, `site-key`, `TurnstileWidget`), `app/router.tsx`, `app/routes.ts`; motivo `cierre-de-sesion` en `session-controller.ts`. Vitest: 270 de 270 (`pages/login-and-guard.test.tsx`, `session/safe-return.test.ts`). Playwright en Chromium contra el backend aislado y Mailpit: 113 de 113 (`e2e/inicio-sesion.spec.ts` agrega 49): login y cierre reales, recarga con una renovación, cuenta PENDIENTE_APROBACION por el flujo real rechazada sin acceso a `/inicio`, rechazo idéntico para pendiente, bloqueada, desactivada, clave errónea e inexistente, 403 real de cuenta ACTIVA sin rol con aviso y sin bucle, 401 y 503 con solicitudes acotadas, desafío real con script sustituido, y `axe` sin violaciones en 8 estados a 375, 640 y 1280 px. `lint`, `typecheck`, `build` y V-6: OK. Inspección visual a 375 y 1280 px. Cierra la comprobación pendiente de T-03. El widget real de Turnstile, Firefox y WebKit quedan para T-06; el retorno a una ruta distinta de `/inicio` solo se prueba en Vitest, porque hoy `/inicio` es la única ruta privada |
| T-05 | Recuperación y activación de cuenta | CA-06, CA-10, CA-14, RN-05, RN-06, RN-07, RN-15, RNF-02 | §2.3, §2.5, §8, §9.1 | Vitest: 204, 422 y `enlace-invalido`; la activación solo llama a `/activate` y no remite a recuperación | [x] | 2026-11-06. `pages/ForgotPasswordPage.tsx`, `pages/ResetPasswordPage.tsx`, `pages/ActivateAccountPage.tsx`, `forms/use-link-password-form.ts`, `app/router.tsx`, `components/ActionLink.tsx`; `reloadOnLinkOpenedInPlace` en `link-token/capture.ts` y `main.tsx`. Vitest: 317 de 317 (`pages/recovery-activation-pages.test.tsx` agrega 47). Playwright en Chromium: 182 de 182 (`e2e/recuperacion-contrasena.spec.ts` agrega 42 y `e2e/activacion-cuenta.spec.ts` 27). **Con backend y Mailpit reales:** enlace válido, inventado, reutilizado, reemplazado y vencido en ambos flujos; activación con el comando real `bootstrap:admin` en una base nueva, seguida de inicio de sesión; 429 reales; revocación de sesiones al restablecer; mensaje idéntico para cualquier correo. **Con ayuda de la prueba:** el vencimiento adelanta `expira_en` solo en bases aisladas, y el 422 cambia la contraseña en tránsito; en ambos casos responde el backend real. **Solo simulado:** fallo de red (`page.route`) y aspecto de «Cuenta activada» a 375, 640 y 1280 px; 500, 503 y 403 de origen, solo en Vitest. `axe` sin violaciones en 13 estados a 375, 640 y 1280 px, y sobre la activación real a 1280 px. `lint`, `typecheck`, `build`, V-6 y validador: OK. Inspección visual a 375 y 1280 px. El widget real de Turnstile, Firefox, WebKit, dos pestañas reales y la matriz de cobertura quedan para T-06 |
| T-06 | Pruebas y ajustes finales | CA-01..CA-15, RN-01..RN-16, RNF-01..RNF-04 | §2.7, §11, §12, §15 | `pnpm test:e2e` en verde; V-5 con resultado documentado; `axe` sin violaciones serias; prueba manual del widget real o su pendiente registrado; checklist de `/sdd-release` | [x] | 2026-11-06. `captcha/turnstile-loader.ts` (plazo de 15 s y reintento) y su prueba; `e2e/compatibilidad-flujos.spec.ts`; `e2e/manual/produccion-csp.spec.ts`; `e2e/support/tls-proxy.mjs`; `playwright.produccion.config.ts`; scripts `test:e2e` y `test:e2e:produccion`; `docs/onboarding/06-frontend-autenticacion.md`. **`pnpm test:e2e`, backend y Mailpit reales:** 231 superadas y 3 omitidas a propósito (las variantes de V-5 que no corresponden a cada motor), de 234: Chromium 200 (199 y 1 omitida), Firefox 17 (16 y 1 omitida), WebKit sobre `http` 3 (2 y 1 omitida), WebKit sobre HTTPS 14. **`pnpm test:e2e:produccion`, bundle y script real de Cloudflare con su sitekey de prueba:** 9 de 9 en los tres motores. Vitest: 324 de 324. `lint`, `typecheck`, `build`, V-6 y validador: OK. `impeccable detect`: sin hallazgos; inspección visual a 375 y 1280 px. Tres defectos locales corregidos: nombre largo desbordaba `/inicio`, enlaces secundarios bajo 44 px, `lang` sin región. **V-5:** Chromium y Firefox superan sobre `http://localhost`; WebKit solo sobre HTTPS con proxy de pruebas (límite de DEC-12, plan §15). **Manual con widget autorizado: pendiente de release, sin credenciales.** Riesgo sin resolver: la recarga interrumpida revoca la sesión (plan §15). Lo real y lo simulado, por criterio, en la matriz |

## Actividades
### T-01 — Preparación e integración
- **Primera actividad:** en `feature/HT-AUTH-02`, confirmar que los contratos de plan §8 y §9 coinciden con el código de `develop`, y levantar la API local con MongoDB, Redis y Mailpit.
- Agregar `react-router` y Playwright con axe; crear las rutas de plan §2.3 con pantallas vacías; adaptar `App.test.tsx`.
- Configurar el proxy de Vite y `API_PROXY_TARGET`; declarar `VITE_CAPTCHA_SITE_KEY`; ajustar el servicio `frontend` de Compose.
- Añadir el bloque de frontend en `.env.docker.example` **antes** del bloque de autenticación, y documentarlo en una sección propia (plan §9.4).
- Ejecutar V-1 a V-4 y V-6 de plan §8 **antes de escribir pantallas**. Si algo falla, actualizar el plan.
- Definir la dirección visual con la guía `impeccable`, confirmarla con el desarrollador y generar `DESIGN.md` con alcance limitado al módulo.
- Crear los componentes base accesibles: campos, botón con estado de envío, mensajes de estado y plantilla de pantalla.

### T-02 — Servicio API y gestión de sesión
- Cliente HTTP de mismo origen, intérprete de `problem+json` con `Retry-After`, tipos y una función por endpoint de `/api/v1/auth/`.
- Token de acceso solo en memoria, fuera del árbol de React.
- Renovación de un solo vuelo, con Web Locks entre pestañas cuando esté disponible, y reintento único ante `no-autenticado`.
- `SessionProvider`: restauración con `POST /api/v1/auth/refresh` y `GET /api/v1/auth/me`, y estados `comprobando`, `anonima`, `autenticada` y `no-disponible`.
- Aviso de cierre de sesión con `BroadcastChannel` cuando esté disponible, sin tokens ni datos de sesión.

### T-03 — Registro y verificación
- Captura del token del fragmento antes de renderizar, limpieza de la URL y política de referente, para las tres rutas con token.
- Pantallas Registro y Revisa tu correo, con reenvío y el correo conservado solo en memoria.
- Pantallas Verificar correo y Reenviar verificación, con el mensaje de PENDIENTE_APROBACION a partir del `estado` que devuelve la API.

### T-04 — Inicio de sesión y protección de rutas
- Pantalla Inicio de sesión, con el mensaje genérico del backend y la orientación general.
- Turnstile: carga diferida tras `desafio-requerido`, `action: 'login'`, reinicio tras cada intento y estados de fallo sin vía alternativa.
- `RequireAuth` y validación de la ruta de retorno, solo rutas internas válidas.
- Vista básica `/inicio`, solo con datos de `GET /api/v1/auth/me`, y cierre de sesión.

### T-05 — Recuperación y activación de cuenta
- Pantallas Olvidé mi contraseña y Crear nueva contraseña, con la política publicada.
- Pantalla Activar cuenta en `/activar-cuenta`, con `POST /api/v1/auth/activate`, textos propios y sin remitir a recuperación ante un enlace no válido.

### T-06 — Pruebas y ajustes finales
- Infraestructura E2E: Playwright contra backend real, MongoDB, Redis y Mailpit aislados; paso a ACTIVA en la base solo desde pruebas; script de Turnstile sustituido.
- E2E de flujos: registro, verificación, pendiente de aprobación, login con retorno, recarga, logout, recuperación, activación y desafío.
- E2E de seguridad: almacenes, cookie, consola, URL con token, recursos externos y dos pestañas.
- Compatibilidad: V-5 en Chromium, Firefox y WebKit, con el resultado documentado.
- Adaptación y accesibilidad: 375 px y 1280 px, zoom al 200 %, teclado, `axe` y pasadas `audit` y `harden` de `impeccable`.
- Prueba manual con el widget real de Turnstile cuando existan credenciales; si faltan, registrarla como pendiente de release.
- Documentar configuración, ejecución, variables y pruebas, y los requisitos de proxy inverso, CSP y `Referrer-Policy`. El despliegue y la configuración definitiva de producción quedan fuera de esta historia.
- Cierre: `/sdd-release` y Pull Request hacia `develop`, iniciados por el desarrollador.

## Matriz de cobertura
| Criterio / regla | Tareas | Pruebas | Cubierto |
|---|---|---|---|
| CA-01 | T-04, T-06 | Real: login contra el backend en los tres motores. Simulado: 503 y fallo de red | [x] |
| CA-02 | T-03, T-06 | Real: registro por la interfaz. Componente y E2E: cuerpo sin rol ni institución | [x] |
| CA-03 | T-03, T-06 | Real: llega a Revisa tu correo, con mensaje idéntico para cualquier correo | [x] |
| CA-04 | T-03, T-06 | Real con Mailpit: enlace, confirmar, reenvío, enlace usado | [x] |
| CA-05 | T-03, T-04, T-06 | Real: PENDIENTE_APROBACION tras verificar, rechazo genérico y sin acceso a `/inicio` | [x] |
| CA-06 | T-05, T-06 | Real con Mailpit: enlace válido, inventado, usado, reemplazado y vencido (el vencimiento adelanta `expira_en` en la base aislada). Simulado: fallo de red | [x] |
| CA-07 | T-04, T-06 | Real en los tres motores: entrar, cerrar sesión y `/refresh` 401 después | [x] |
| CA-08 | T-02, T-06 | Unitaria y real en los tres motores (WebKit sobre HTTPS): una renovación al recargar. Ver riesgo de recarga interrumpida, plan §15 | [x] |
| CA-09 | T-04, T-06 | Componente y real en los tres motores, también tras cerrar sesión y volver atrás | [x] |
| CA-10 | T-01, T-02, T-03, T-04, T-05, T-06 | Real: 401, 422 y 429 (el 422 de restablecer y activar cambia la contraseña en tránsito). Solo simulado: 500, 503, 403 de origen y fallo de red | [x] |
| CA-11 | T-04, T-06 | Componente; E2E con backend real y script sustituido; script real de Cloudflare con sitekey de prueba, cuyo token rechaza el adaptador `test`. **Manual con widget autorizado: pendiente de release** | [x] |
| CA-12 | T-01, T-06 | Real en Chromium: 375, 640 y 1280 px, teclado, nombre largo y 44 px. 640 px equivale a un zoom de 200 % emulado | [x] |
| CA-13 | T-06 | Suite `pnpm test:e2e` (231 superadas, 3 omitidas a propósito) y Vitest (324) | [x] |
| CA-14 | T-05, T-06 | Real: `bootstrap:admin` en base nueva, activar y entrar. Componente: textos propios. Simulado: aspecto de «Cuenta activada» a tres anchos | [x] |
| CA-15 | T-04, T-06 | Unitaria con rutas válidas e inválidas. Real solo con `/inicio`, hoy la única ruta privada | [x] |
| RN-01 | T-01, T-02, T-06 | Revisión: sin simulaciones en `src` fuera de pruebas. E2E contra la API real | [x] |
| RN-02 | T-02, T-06 | Real en los tres motores: almacenes, URL y HTML sin secretos. IndexedDB: E2E en Chromium | [x] |
| RN-03 | T-02, T-06 | Real, V-4 en los tres motores: cabecera y JavaScript sin acceso. `SameSite` aplicado: sin verificar en WebKit | [x] |
| RN-04 | T-03, T-06 | Componente y E2E real del cuerpo enviado | [x] |
| RN-05 | T-03, T-04, T-05, T-06 | Real: mensajes idénticos en login, registro, reenvío y recuperación | [x] |
| RN-06 | T-03, T-05, T-06 | Unitaria y real en los tres motores: enlace real, URL limpia, token solo en el `POST` | [x] |
| RN-07 | T-03, T-04, T-05, T-06 | Real en los tres motores: sin recursos externos en rutas con token, `no-referrer`, `POST` con `Origin`. Cabeceras de despliegue añadidas por la prueba sobre `vite preview` | [x] |
| RN-08 | T-04, T-06 | Componente y real. La autorización sigue siendo del backend | [x] |
| RN-09 | T-02, T-03, T-04, T-06 | Real con el flujo de cuenta pendiente | [x] |
| RN-10 | T-04, T-06 | Componente; real con script sustituido; plazo de 15 s y reintento con script retenido (simulado); sin vía alternativa. Token rechazado por el adaptador `test`, no por Cloudflare | [x] |
| RN-11 | T-02, T-06 | E2E de consola en Chromium; regla `no-console`; revisión estática | [x] |
| RN-12 | T-02, T-06 | Real con dos pestañas en los tres motores: recarga simultánea ×3, cierre propagado y rotación | [x] |
| RN-13 | T-01, T-02, T-06 | Real: V-1 a V-3 en Chromium; `Origin` en los tres motores. En WebKit sobre HTTPS el proxy de pruebas reescribe `Origin` | [x] |
| RN-14 | T-01, T-04, T-06 | Revisión de rutas y de pantallas: sin funciones administrativas | [x] |
| RN-15 | T-05, T-06 | Componente y real: activación propia, sin remitir a recuperación | [x] |
| RN-16 | T-04, T-06 | Unitaria. Real solo con `/inicio` | [x] |
| RNF-01 | T-01, T-06 | `axe` sin violaciones en Chromium, en cada estado revisado a 375, 640 y 1280 px; foco y teclado. Sin lector de pantalla real | [x] |
| RNF-02 | T-03, T-05, T-06 | Componente y real: política publicada, pegado permitido | [x] |
| RNF-03 | T-01, T-06 | Revisión de textos; `lang="es-CO"` | [x] |
| RNF-04 | T-01, T-06 | V-1 a V-4 y V-6 reales; V-5 real en Chromium y Firefox sobre `http://localhost`, y en WebKit solo sobre HTTPS con proxy de pruebas (DEC-12). Safari real sin probar | [x] |

## Registro de cambios
| Fecha | Cambio | Motivo |
|---|---|---|
| 2026-11-05 | Creación con `/sdd-spec` | — |
| 2026-11-05 | Simplificación a seis tareas por instrucción del desarrollador. Las 21 tareas de la primera versión, sin iniciar y sin evidencia, se agrupan como actividades: antiguas 01 a 03 en T-01; 04 a 06 en T-02; 07 a 09 en T-03; 10 a 12 en T-04; 13 y 14 en T-05; 15 a 21 en T-06. T-01 a T-06 cambian de significado respecto a esa versión. Se agregan CA-14, CA-15, RN-15, RN-16 y RNF-04 | Decisiones del desarrollador (spec §14) |
| 2026-11-05 | Se conservan T-01 a T-06. Rama y primera actividad ajustadas porque HT-AUTH-01 ya está en `develop`; producción solo documentada. Estado sin cambios: `draft` | Aprobaciones del desarrollador (spec §14) |
| 2026-11-05 | `/sdd-tasks`: rama `feature/HT-AUTH-02` registrada. Sin cambios en tareas, cobertura ni verificación. Sigue en `draft` porque `spec.md` y `plan.md` no están en `ready` | Ejecución de `/sdd-tasks` |
| 2026-11-05 | **draft → ready**, autorizado de forma expresa por el desarrollador, con spec y plan en `ready` | Confirmación de JulianD27-ia |
| 2026-11-05 | `/sdd-implement`: **ready → in-progress**. T-01 detenida en su primera actividad, sin cambios de código: las imágenes `backend` y `frontend` de Compose son del 2026-10-29 y `POST /api/v1/auth/login` responde 404. A la espera de autorización para corregirlo | Verificación del entorno de T-01 |
| 2026-11-05 | T-01 completada en modo aislado (DEC-13). El servicio `frontend` de Compose y sus imágenes de desarrollo no se reconstruyeron: siguen desactualizados por decisión del desarrollador | Instrucción del desarrollador; evidencia en T-01 |
| 2026-11-06 | Estrategia de entrega: T-01 a T-06 se completan antes de cualquier commit o push, con revisión del desarrollador al cerrar cada tarea e informe integral tras T-06 | Instrucción del desarrollador |
| 2026-11-06 | T-02 completada, y aprobada por el desarrollador. Ajuste de V-5 (T-01): se conservan todas sus comprobaciones originales y se añade esperar el `GET /me` de `SessionProvider` tras recargar. **Razón técnica:** la aplicación ya renueva al cargar, y la rotación no tiene período de gracia; una renovación de la prueba enviada antes de que termine la de la aplicación reutilizaría la cookie anterior y el backend revocaría la sesión. La evidencia de T-01 no se altera | Evidencia en T-02; instrucción del desarrollador |
| 2026-11-06 | T-03 completada, a la espera de revisión del desarrollador antes de iniciar T-04 | Evidencia en T-03 |
| 2026-11-06 | T-03 aprobada por el desarrollador. T-04 completada, a la espera de su revisión antes de iniciar T-05 | Instrucción del desarrollador; evidencia en T-04 |
| 2026-11-06 | T-04 aprobada por el desarrollador. T-05 completada, a la espera de su revisión antes de iniciar T-06. El entorno de pruebas queda levantado y sin limpiar, por instrucción del desarrollador | Instrucción del desarrollador; evidencia en T-05 |
| 2026-11-06 | T-05 aprobada por el desarrollador. T-06 completada y matriz de cobertura al completo, a la espera de su revisión integral antes del cierre de Git. Sin commits, push ni PR. El entorno de pruebas queda levantado y sin limpiar | Instrucción del desarrollador; evidencia en T-06 |
| 2026-11-07 | Rediseño visual y ajustes de la revisión final (plan §2.7), después de T-06: no agregan tareas ni cambian la cobertura. Evidencia tras los cambios: `lint`, `typecheck`, `build`, Vitest 324 de 324 y `pnpm test:e2e` con 231 superadas y 3 omitidas a propósito (DEC-12); `e2e/recuperacion-contrasena.spec.ts` corregido en su orden de teclado. **in-progress → in-review**, autorizado por el desarrollador. `plan.md` sigue en `draft`: el validador falla hasta que el desarrollador lo apruebe | Autorización del desarrollador |
