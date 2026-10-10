---
id: HT-CORE-01
spec: ./spec.md
status: ready            # draft | ready
owner: Diego Alejandro Narvaez Meza
updated: 2026-10-10
---

# HT-CORE-01 — Plan técnico

> **plan.md describe CÓMO se construye lo definido en `spec.md`.** Debe respetar `specs/000-architecture/architecture.md` y las skills `project-architecture` y `mongodb-mongoose`.
> Persistencia exclusiva: MongoDB + Mongoose. No PostgreSQL, Prisma ni MySQL.

## 1. Resumen técnico
Historia de infraestructura local, sin código de aplicación. Se mantiene el `docker-compose.yml` existente (MongoDB 7 standalone + Redis 7 AOF), se le agrega un healthcheck a Redis y se crea un script de verificación en PowerShell, `scripts/verify-local.ps1`, que comprueba los criterios de la spec sin imprimir secretos. La documentación existente (`README_SETUP.md`, `docs/onboarding/01` y `02`) se completa con los comandos de inicio, comprobación y apagado seguro, y con los enlaces al flujo SDD. La estructura real de `apps/*` y las convenciones de frontend pendientes se registran en `docs/dependencias-transversales.md` (DT-01). No se crea scaffolding.

## 2. Arquitectura
### 2.1 Componentes afectados
| Componente | Ruta | Cambio |
|---|---|---|
| Docker Compose | `docker-compose.yml` | Healthcheck en `redis` (DEC-02). Sin cambios en `mongo`, puertos, volúmenes ni perfil `app`. |
| Script de verificación | `scripts/verify-local.ps1` (nuevo) | Comprobaciones estáticas y de ejecución, salida `[OK]/[FALLA]` por criterio y código de salida. |
| Scripts existentes | `scripts/docker-up.ps1`, `docker-down.ps1` | Se detienen si falla un comando (`$LASTEXITCODE`); `docker-up` valida la configuración antes de arrancar. |
| Guía rápida | `README_SETUP.md` | Secciones de comprobación, apagado seguro y flujo SDD. |
| Onboarding | `docs/onboarding/01-instalacion.md`, `02-variables-entorno.md` | Script de verificación en la tabla de comandos; nota sobre Redis sin contraseña en local. |
| Decisiones transversales | `docs/dependencias-transversales.md` | DT-01: estructura verificada de `apps/*` y convenciones de frontend pendientes. |
| API / Web / OMR | `apps/*` | **No aplica** (no existen; DT-01). |

### 2.2 Flujo técnico
```
Copy-Item .env.docker.example .env   (solo si no existe)
        │
scripts/verify-local.ps1 -Static  ──►  git check-ignore · git ls-files · plantilla · compose config
        │
scripts/docker-up.ps1  ──►  docker compose config --quiet ──► docker compose up -d mongo redis ──► ps
        │
scripts/verify-local.ps1          ──►  estático + ps (healthy) + perfil app apagado + logs sin secretos
        │
scripts/docker-down.ps1 ──► docker compose down   (volúmenes intactos)
```

### 2.3 Módulos y responsabilidades
| Módulo / archivo | Responsabilidad | Reglas (RN) |
|---|---|---|
| `.gitignore` (existente) | Excluir `.env` y archivos de credenciales | RN-01 |
| `.env.docker.example` (existente) | Plantilla con marcadores `cambiar_*` | RN-01, RN-07 |
| `docker-compose.yml` | Servicios base, healthchecks, puertos en `127.0.0.1`, perfil `app` | RN-05, RNF-01 |
| `scripts/verify-local.ps1` | Verificar CA-01..CA-05 sin imprimir valores | RN-01, RN-04, RN-05 |
| `scripts/docker-up.ps1` / `docker-down.ps1` | Arranque validado y apagado conservando datos | RN-03, RN-05 |
| `scripts/docker-reset.ps1` (existente, sin cambios) | Único camino documentado para borrar volúmenes, con confirmación escrita | RN-03 |
| `README_SETUP.md` y onboarding | Procedimiento reproducible y enlaces SDD | RN-02, RN-03, RN-07 |
| `docs/dependencias-transversales.md` | Registro de estructura de `apps/*` y convenciones pendientes | RN-06 |

## 3. Colecciones y esquemas MongoDB / Mongoose
**No aplica.** Esta historia no crea colecciones ni esquemas. La base `omr_preicfes` se crea cuando la primera historia con persistencia inserte datos.

## 4. Índices
**No aplica.**

## 5. Consistencia y transacciones
- No hay escrituras de negocio.
- MongoDB sigue **standalone** (DT-02 sin resolver); esta historia no habilita replica set.

## 6. Archivos (GridFS)
**No aplica** (DT-03 sigue como propuesta).

## 7. Scripts de migración y versionado
**No aplica.** No hay documentos ni `schemaVersion`. La herramienta de migraciones sigue pendiente (DT-07).

## 8. Endpoints
**No aplica** (spec §3, fuera de alcance). Los health checks de `api`, `omr` y `web` se definen al crear cada app.

## 9. Contratos de datos
### 9.1 Contrato de configuración local
Variables de `.env` (fuente: `.env.docker.example`; detalle en `docs/onboarding/02-variables-entorno.md`):

| Variable | Obligatoria para | Secreta | Marcador en plantilla |
|---|---|---|---|
| `MONGO_ROOT_USER` | `mongo`, URI de `api` | Sí | `cambiar_usuario` |
| `MONGO_ROOT_PASSWORD` | `mongo` | Sí | `cambiar_contrasena_segura` |
| `MONGO_ROOT_PASSWORD_URLENCODED` | URI de `api` (Compose falla si falta) | Sí | `cambiar_contrasena_segura` |
| `MONGO_DB` | `mongo`, URI de `api` | No | `omr_preicfes` |
| `MONGO_PORT` / `REDIS_PORT` | puertos publicados | No | `27017` / `6379` |
| `MONGODB_URI` | NestJS en el host | Sí | URI con marcadores |
| `REDIS_URL` | NestJS en el host | No | `redis://localhost:6379/0` |

No se agregan variables nuevas en esta historia.

### 9.2 Contrato de `scripts/verify-local.ps1`
- **Parámetros:** `-Static` (solo comprobaciones que no requieren contenedores en ejecución).
- **Salida:** una línea por comprobación, `[OK] CA-NN <descripción>` o `[FALLA] CA-NN <descripción>: <causa sin valores>`. Nunca imprime contenidos de `.env`, contraseñas ni URIs.
- **Código de salida:** `0` si todo pasa; `1` si alguna comprobación falla.
- **Comprobaciones:**

| # | Comprobación | Cómo | CA / RN |
|---|---|---|---|
| 1 | `.env` existe | `Test-Path .env`; si falta, indica el comando `Copy-Item` (no lo crea) | CA-03, RN-02 |
| 2 | `.env` ignorado | `git check-ignore -q .env` = 0 y `git ls-files --error-unmatch .env` ≠ 0 | CA-04, RN-01 |
| 3 | Plantilla sin secretos | En `.env.docker.example`, `MONGO_ROOT_USER`, `MONGO_ROOT_PASSWORD` y `MONGO_ROOT_PASSWORD_URLENCODED` empiezan por `cambiar_` | CA-03, RN-01 |
| 4 | Ningún `.env` real versionado | `git ls-files` no devuelve archivos `.env` ni `*.env` salvo la plantilla | CA-03, RN-01 |
| 5 | Compose válido | `docker compose config --quiet` (salida descartada) con código 0 | CA-01 |
| 6 | Motor Docker operativo | `docker info` con código 0 (si falla, termina con el mensaje "Docker no operativo") | spec §7 |
| 7 | Servicios base disponibles | `docker compose ps --format json`: `mongo` y `redis` con `Health = healthy` | CA-02, CA-05 |
| 8 | Perfil `app` apagado | Ningún contenedor `api`, `omr` o `web` en ejecución | CA-02, RN-05 |
| 9 | Logs sin secretos | Lee en memoria `MONGO_ROOT_PASSWORD` y `MONGO_ROOT_PASSWORD_URLENCODED` de `.env`, busca ambos valores en `docker compose logs --no-color mongo redis` e informa solo sí/no | CA-05, RN-04 |

Las comprobaciones 1–5 corren con `-Static`; las 6–9 solo sin `-Static`.

### 9.3 Tipos compartidos frontend ↔ backend
No aplica (DT-01).

## 10. Dependencias
| Tipo | Dependencia | Estado | Impacto si no está lista |
|---|---|---|---|
| Herramienta | Docker Desktop / WSL con Compose v2 | Requisito del desarrollador | No se pueden verificar CA-02, CA-05 ni CA-06 (solo `-Static`). |
| Herramienta | PowerShell 5.1+ o 7 | Incluido en Windows | Los scripts no corren en Linux/macOS sin `pwsh` (OQ-03). |
| Técnica transversal | DT-01 (apps), DT-05 (pruebas), DT-08 (CI) | Pendientes | Solo se registran (CA-09); no bloquean esta historia. |
| Librería nueva | Ninguna | — | — |

## 11. Seguridad
- **Secretos:** `.env` sigue ignorado; Claude Code tiene denegada su lectura (`.claude/settings.json`). El script lee las contraseñas solo en memoria y nunca las imprime (RN-04).
- **Logs:** la comprobación 9 verifica que los logs de `mongo` y `redis` no contienen las contraseñas. Las guías no muestran URIs con credenciales reales; `mongosh` pide la contraseña con `-p` sin valor.
- **Red:** los puertos siguen publicados solo en `127.0.0.1` (RNF-01). Redis no tiene contraseña en local; es aceptable porque solo escucha en loopback (registrado en OQ-02).
- **Borrado de datos:** `docker compose down -v` no aparece como comando habitual; el único camino es `scripts/docker-reset.ps1` con confirmación escrita (RN-03). `.claude/settings.json` ya deniega `down -v`.
- **Auditoría, RBAC, PII y validación de archivos:** no aplican.

## 12. Estrategia de pruebas
No hay framework de pruebas acordado (DT-05) ni código de aplicación. La verificación es el script del §9.2 más evidencia manual reproducible, registrada en `tasks.md`.

| CA / RN | Nivel | Caso | Herramienta | Datos de prueba |
|---|---|---|---|---|
| CA-01 | Verificación automatizada | Comprobación 5 con `.env` completo; caso negativo: `.env` temporal sin `MONGO_ROOT_PASSWORD_URLENCODED` hace fallar la validación | `verify-local.ps1 -Static` | `.env` local del desarrollador |
| CA-02 | Verificación automatizada | `docker-up.ps1` y luego comprobaciones 7–8 | `verify-local.ps1` | — |
| CA-03, RN-01, RN-02 | Verificación automatizada | Comprobaciones 1, 3 y 4 | `verify-local.ps1 -Static` | — |
| CA-04 | Verificación automatizada | Comprobación 2 + salida de `git check-ignore -v .env` en la evidencia | `verify-local.ps1 -Static` | — |
| CA-05, RN-04 | Verificación automatizada | Comprobaciones 7 y 9 | `verify-local.ps1` | — |
| CA-06, RN-03 | Evidencia manual | `redis-cli SET ht-core-01:persistencia <marca>` → `docker-down.ps1` → `docker-up.ps1` → `GET` devuelve la marca → `DEL`; `docker volume ls` muestra `mongo_data` y `redis_data` antes y después | Docker CLI | Clave temporal sin datos personales |
| CA-07 | Revisión | Enlaces desde `README_SETUP.md` a flujo SDD, plantillas, skills y Git funcionan | Revisión en el PR | — |
| CA-08 | Evidencia manual | Otro integrante sigue solo `README_SETUP.md` en su máquina y adjunta la salida de `verify-local.ps1` | Revisión en el PR | — |
| CA-09, RN-06 | Revisión | DT-01 en `dependencias-transversales.md` registra `apps/*` como inexistente y las convenciones pendientes; no hay carpetas `apps/` nuevas | Revisión en el PR | — |
| RN-05 | Verificación automatizada | Comprobación 8 | `verify-local.ps1` | — |
| RN-07 | Revisión | Sin variables nuevas; la tabla de `02-variables-entorno.md` coincide con la plantilla | Revisión en el PR | — |

## 13. Observabilidad y rendimiento
- Estado: `docker compose ps` (columna de salud) y `docker compose logs -f <servicio>`.
- Healthchecks: `mongo` con `mongosh ping` (existente) y `redis` con `redis-cli ping` (DEC-02).
- No hay requisitos de volumen ni rendimiento.

## 14. Decisiones técnicas
| ID | Decisión | Alternativas consideradas | Motivo | Fecha |
|---|---|---|---|---|
| DEC-01 | Verificación con un script PowerShell en `scripts/` | Pester; Makefile; script Node; solo pasos manuales | Los scripts existentes son `.ps1` y el equipo trabaja en Windows; no agrega dependencias ni se adelanta a DT-05. | 2026-10-10 |
| DEC-02 | Healthcheck `redis-cli ping` en `redis` | Dejarlo en "running" | La skill `docker-local` pide healthchecks en dependencias críticas; permite verificar CA-02 y CA-05 igual que con `mongo`. No cambia puertos, volúmenes ni el `depends_on` de `api`. | 2026-10-10 |
| DEC-03 | Las convenciones de frontend se registran en DT-01 y no se deciden aquí | Decidirlas en esta historia | La spec las deja fuera de alcance (§3); requieren acuerdo del equipo. | 2026-10-10 |
| DEC-04 | El script no crea `.env`; solo indica cómo hacerlo | Copiar la plantilla automáticamente | Evita sobrescribir o crear credenciales de ejemplo sin que el desarrollador lo note (RN-02). | 2026-10-10 |
| DEC-05 | La persistencia (CA-06) se prueba con una clave temporal en Redis | Insertar un documento en MongoDB | Redis local no pide credenciales, así que la prueba no expone la contraseña de MongoDB; la existencia de los volúmenes cubre MongoDB. | 2026-10-10 |

## 15. Riesgos y OPEN QUESTIONS técnicas
- [ ] **OQ-01:** comandos de lint y pruebas que exigirá CI (DT-08). Cuando existan, `verify-local.ps1 -Static` puede ser un paso del pipeline.
- [ ] **OQ-02:** ¿Redis necesita contraseña en entornos compartidos? En local queda sin contraseña, solo en `127.0.0.1` (decisión para DT-06).
- [ ] **OQ-03:** ¿Hay integrantes en Linux o macOS? Si los hay, hace falta `pwsh` o un equivalente en shell (no se crea sin confirmarlo).
- **Riesgo R-01:** si alguien cambia usuario o contraseña después del primer arranque, MongoDB conserva las credenciales del volumen y `mongo` falla al autenticarse. Mitigación: ya documentado en `01-instalacion.md` (problemas frecuentes); el script lo detecta como servicio no saludable.
- **Riesgo R-02:** la comprobación 9 depende de que `.env` tenga contraseñas reales; con los marcadores de la plantilla busca `cambiar_contrasena_segura`. Aceptable: sigue sin imprimir valores.

## 16. Checklist de plan listo (`status: ready`)
- [x] Cada CA y RN de la spec tiene diseño y estrategia de prueba (§12).
- [x] Colecciones con `collection:` explícito, validaciones y `schemaVersion` — no aplica (§3).
- [x] Cada índice justificado por una consulta o regla — no aplica (§4).
- [x] Decisión de transacciones coherente con replica set (DT-02): sin transacciones; MongoDB sigue standalone.
- [x] Endpoints y contratos completos — sin endpoints; contrato de configuración y de script en §9.
- [x] Sin tecnologías fuera de la arquitectura aprobada.
