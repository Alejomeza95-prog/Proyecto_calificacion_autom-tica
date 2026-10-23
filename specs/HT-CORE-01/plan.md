---
id: HT-CORE-01
spec: ./spec.md
status: draft            # draft | ready  (solo el desarrollador marca ready)
owner: JulianD27-ia
updated: 2026-10-22
---

# HT-CORE-01 — Plan técnico

> **plan.md describe CÓMO se construye lo definido en `spec.md`.** Respeta `specs/000-architecture/architecture.md` y las skills `project-architecture`, `mongodb-mongoose` y `docker-local`.
> Persistencia exclusiva: MongoDB + Mongoose. No PostgreSQL, Prisma ni MySQL.
> Generado por `/sdd-spec` como propuesta (`draft`). `/sdd-plan` lo actualiza cuando cambia la spec.

## 1. Resumen técnico
Historia de infraestructura local y documentación. No crea código de aplicación, colecciones ni endpoints. Se trabaja sobre `docker-compose.yml` (healthcheck de Redis), un script nuevo de verificación `scripts/verify-local.ps1` que da evidencia reproducible de los CA sin imprimir secretos, el endurecimiento de `docker-up.ps1` y `docker-down.ps1`, y la consolidación de `README_SETUP.md`, `docs/onboarding/01` y `02`, y del registro de DT-01 en `docs/dependencias-transversales.md`.

## 2. Arquitectura
### 2.1 Componentes afectados
| Componente | Ruta | Cambio |
|---|---|---|
| Compose | `docker-compose.yml` | Agregar `healthcheck` a `redis` (`redis-cli ping`). No se tocan puertos, volúmenes ni el perfil `app` (DEC-02). |
| Plantilla de entorno | `.env.docker.example` | Sin cambios previstos. Solo se revisa que conserve únicamente marcadores (RN-01). |
| Exclusiones de Git | `.gitignore` | Sin cambios previstos. Se verifica con `git check-ignore -v .env`. |
| Scripts | `scripts/verify-local.ps1` (nuevo), `scripts/docker-up.ps1`, `scripts/docker-down.ps1` | Verificación con salida `[OK]`/`[FALLA]`. `up` valida antes de arrancar y `down` nunca usa `-v`. |
| Documentación | `README_SETUP.md`, `docs/onboarding/01-instalacion.md`, `docs/onboarding/02-variables-entorno.md` | Inicio, comprobación, logs, apagado seguro y enlaces SDD. |
| Decisiones transversales | `docs/dependencias-transversales.md` (DT-01) | Estructura verificada de `apps/*` y convenciones de frontend pendientes. |
| API / web / OMR | `apps/*` | **No aplica:** no existen y no se crean (RN-05, DT-01). |

### 2.2 Flujo técnico
```
.env.docker.example ──copia (si falta)──► .env (ignorado)
        │
docker compose config --quiet ──► docker compose up -d mongo redis ──► healthchecks (mongo: ping, redis: PING)
        │                                                                  │
scripts/verify-local.ps1 ◄───────── docker compose ps / logs ◄──────────────┘
        │
docker compose down (sin -v) ──► volúmenes mongo_data / redis_data conservados
```

### 2.3 Módulos y responsabilidades
| Módulo / artefacto | Responsabilidad | Reglas (RN) que implementa |
|---|---|---|
| `.gitignore` + `.env.docker.example` | Mantener los secretos fuera de Git; plantilla solo con marcadores | RN-01, RN-06 |
| Procedimiento de creación de `.env` (`Copy-Item` condicionado a `Test-Path`) | No sobrescribir un `.env` existente | RN-02 |
| `scripts/docker-down.ps1` + `README_SETUP.md` §apagado | Apagado sin `-v`, con advertencia explícita | RN-03 |
| `scripts/verify-local.ps1` | Comprobar CA sin imprimir valores. Detectar contraseñas en logs comparando en memoria | RN-01, RN-02, RN-04 |
| Registro DT-01 | Estructura de `apps/*` confirmada antes de cualquier scaffolding | RN-05 |
| `docs/onboarding/02-variables-entorno.md` | Tabla de variables idéntica a la plantilla | RN-06 |

## 3. Colecciones y esquemas MongoDB / Mongoose
No aplica: la historia no crea colecciones ni esquemas. MongoDB se arranca vacío; la base `omr_preicfes` se crea al insertar datos.

## 4. Índices
No aplica: sin colecciones.

## 5. Consistencia y transacciones
No aplica. Se mantiene la instancia standalone (DT-02 sin resolver); no se habilita replica set en esta historia.

## 6. Archivos (GridFS)
No aplica (DT-03 sigue como propuesta).

## 7. Scripts de migración y versionado
No aplica: sin cambios de datos.

## 8. Endpoints
No aplica: sin endpoints funcionales. El health check de las aplicaciones se definirá al implementar cada app (DT-01).

## 9. Contratos de datos
### 9.1 Contrato de configuración local
- Fuente: `.env.docker.example`. Variables: `MONGO_ROOT_USER`, `MONGO_ROOT_PASSWORD`, `MONGO_ROOT_PASSWORD_URLENCODED`, `MONGO_DB`, `MONGO_PORT`, `REDIS_PORT`, `MONGODB_URI`, `REDIS_URL` (documentadas en `docs/onboarding/02-variables-entorno.md`).
- Creación: `if (-not (Test-Path .env)) { Copy-Item .env.docker.example .env }` (RN-02). Claude Code no lee `.env` (denegado en `.claude/settings.json`).
- Redis local sin contraseña, publicado solo en `127.0.0.1`.

### 9.2 Contrato de `scripts/verify-local.ps1`
| # | Comprobación | CA / RN | Modo |
|---|---|---|---|
| 1 | `.env` existe | CA-03 | `-Static` y completo |
| 2 | `git check-ignore -q .env` = 0 | CA-03, RN-01 | `-Static` y completo |
| 3 | `.env.docker.example` solo contiene marcadores `cambiar_*` en las variables secretas | CA-03, RN-01 | `-Static` y completo |
| 4 | `git ls-files` no contiene ningún `.env` real | CA-03, RN-01 | `-Static` y completo |
| 5 | `docker compose config --quiet` = 0 | CA-01 | `-Static` y completo |
| 6 | `docker info` responde (Docker operativo) | CA-02 | completo |
| 7 | `mongo` y `redis` en estado `healthy` | CA-02, CA-04 | completo |
| 8 | Ningún servicio del perfil `app` en ejecución | CA-02 | completo |
| 9 | `docker compose logs mongo redis` no contiene la contraseña de `.env` (leída en memoria, nunca impresa) | CA-04, RN-04 | completo |

Salida: una línea por comprobación `[OK]`/`[FALLA] <CA>: <motivo sin valores>`. Código de salida 0 si todo pasa y 1 si algo falla.

### 9.3 Comandos documentados
- Validar: `docker compose config --quiet`
- Arrancar: `docker compose up -d mongo redis` (o `scripts/docker-up.ps1`)
- Estado: `docker compose ps`; logs: `docker compose logs --tail 100 mongo redis`
- Verificar: `scripts/verify-local.ps1`
- Apagar sin borrar datos: `docker compose down` (o `scripts/docker-down.ps1`). `down -v` y `docker-reset.ps1` solo con confirmación y sin datos que conservar.

## 10. Dependencias
| Tipo | Dependencia | Estado | Impacto si no está lista |
|---|---|---|---|
| Entorno | Docker Desktop/WSL con Compose v2 | Requisito de cada máquina | CA-02, CA-04 y CA-07 no se pueden verificar. |
| Técnica transversal | DT-01 (estructura de apps) | Pendiente | No bloquea: esta historia solo la registra (CA-08). |
| Técnica transversal | DT-08 (CI) | Pendiente | No bloquea: los comandos de CI quedan como OPEN QUESTION. |
| Rama | `origin/feature/HT-CORE-01` previa | Sin fusionar | Riesgo de conflicto al hacer push o PR (§15). |
| Librería nueva | Ninguna | — | — |

## 11. Seguridad
- Secretos solo en `.env`, ignorado por Git (RN-01). Claude Code tiene denegada su lectura.
- `verify-local.ps1` nunca imprime valores de variables ni URIs. La comparación contra los logs se hace en memoria (RN-04).
- Puertos publicados solo en `127.0.0.1` (sin cambios).
- `docker-down.ps1` sin `-v`. `docker-reset.ps1` conserva su confirmación escrita (RN-03).
- La evidencia de las tareas no incluye valores de `.env` ni URIs con credenciales.
- Sin datos personales; sin auditoría de negocio.

## 12. Estrategia de pruebas
| CA / RN | Nivel | Caso | Herramienta | Datos de prueba |
|---|---|---|---|---|
| CA-01 | Verificación de entorno | `docker compose config --quiet` devuelve 0 con `.env` válido y ≠ 0 con una copia temporal sin `MONGO_ROOT_PASSWORD_URLENCODED` (`--env-file` temporal en el scratchpad, borrada después) | `verify-local.ps1 -Static`, PowerShell | Marcadores de la plantilla |
| CA-02 | Verificación de entorno | Tras `up -d mongo redis`, ambos `healthy` y ningún servicio `app` en ejecución | `verify-local.ps1` (comprobaciones 6–8) | — |
| CA-03 | Verificación de entorno | `.env` existe, `git check-ignore -v .env` muestra la regla y `git ls-files` sin `.env` | `verify-local.ps1` (1–4) | — |
| CA-04 | Verificación de entorno | `docker compose ps` muestra `healthy` y los logs no contienen la contraseña | `verify-local.ps1` (7, 9) | — |
| CA-05 | Revisión documental | Todos los enlaces de `README_SETUP.md` resuelven a archivos existentes | Script de comprobación de enlaces (`Test-Path` por enlace) | — |
| CA-06 | Revisión + manual | `docker-down.ps1` no contiene `-v`/`--volumes`. Tras `down` y `up`, los volúmenes `mongo_data` y `redis_data` siguen existiendo (`docker volume ls`) | `Select-String`, Docker | — |
| CA-07 | Manual reproducible | Otro integrante sigue `README_SETUP.md` desde un clon limpio y `verify-local.ps1` devuelve 0 | Checklist en la evidencia de la tarea | Su propio `.env` |
| CA-08 | Revisión documental | DT-01 registra que `apps/*` no existe y lista las convenciones de frontend pendientes; `Test-Path apps` = False | Revisión del diff | — |
| RN-01 | Verificación | Comprobaciones 2–4 | `verify-local.ps1` | — |
| RN-02 | Revisión | El procedimiento documentado usa `Test-Path` antes de `Copy-Item` | Revisión | — |
| RN-03 | Revisión | Igual que CA-06 | `Select-String` | — |
| RN-04 | Verificación | Comprobación 9; la salida del script no contiene valores | `verify-local.ps1` | — |
| RN-05 | Revisión | No se crean carpetas `apps/` en el diff | `git diff --stat` | — |
| RN-06 | Verificación | Las variables de la tabla de `02-variables-entorno.md` coinciden con las claves de `.env.docker.example` | Comparación en PowerShell | — |
| RNF-01 | Manual reproducible | Igual que CA-07 | — | — |

## 13. Observabilidad y rendimiento
- Healthchecks de `mongo` (existente) y `redis` (nuevo) visibles en `docker compose ps`.
- Logs consultables con `docker compose logs`, sin credenciales.
- Sin requisitos de volumen ni rendimiento.

## 14. Decisiones técnicas
| ID | Decisión | Alternativas consideradas | Motivo | Fecha |
|---|---|---|---|---|
| DEC-01 | Propuesta: script `scripts/verify-local.ps1` (con modo `-Static`) como evidencia reproducible de los CA | Solo comandos manuales documentados | Repetibilidad (CA-07) y verificación sin exponer secretos (RN-04) | 2026-10-22 |
| DEC-02 | Propuesta: healthcheck `redis-cli ping` en `redis` | Mantener `service_started` | Skill `docker-local`: healthchecks en dependencias críticas. Permite verificar disponibilidad (CA-02, CA-04) | 2026-10-22 |
| DEC-03 | Propuesta: registrar estructura de apps y convenciones de frontend en DT-01, sin crear carpetas | Crear scaffolding mínimo | RN-05; la estructura del monorepo sigue abierta | 2026-10-22 |
| DEC-04 | Propuesta: scripts solo para PowerShell (Windows) | Agregar equivalentes `.sh` | Supuesto de spec §3; los scripts existentes son `.ps1` | 2026-10-22 |

## 15. Riesgos y OPEN QUESTIONS técnicas
- [ ] **Conflicto de rama:** `origin/feature/HT-CORE-01` contiene una implementación previa (healthcheck de redis, `verify-local.ps1`, cambios de docs). Esta rama local no la sigue. Decidir antes de hacer push si se reutiliza ese trabajo o se sustituye.
- [ ] Comandos de test/lint que exige CI (DT-08).
- [ ] Estructura final del monorepo (DT-01).
- [ ] ¿Se necesitan scripts equivalentes para macOS/Linux? (DEC-04).
- [ ] Archivo `env` sin seguimiento en la raíz de algunas copias de trabajo: no lo cubre la regla `.env`. Revisar si contiene secretos y si `.gitignore` debe excluirlo.

## 16. Checklist de plan listo (`status: ready`)
- [ ] Cada CA y RN de la spec tiene diseño y estrategia de prueba.
- [ ] Colecciones con `collection:` explícito, validaciones y `schemaVersion` (no aplica).
- [ ] Cada índice justificado por una consulta o regla (no aplica).
- [ ] Decisión de transacciones coherente con replica set (DT-02) (no aplica).
- [ ] Endpoints y contratos completos (contrato de configuración y de script).
- [ ] Sin tecnologías fuera de la arquitectura aprobada.
- [ ] Ningún ID (`RN`/`CA`/`RNF`) citado aquí falta en la spec; `scripts/sdd-validate.ps1 -Id HT-CORE-01` sin `[FALLA]`.
- [ ] `spec.md` en `ready`.

## 17. Registro de cambios
| Fecha | Cambio | Motivo (CA/RN/spec §14) | Estado previo → nuevo |
|---|---|---|---|
| 2026-10-22 | Creación con `/sdd-spec` | — | — → draft |
