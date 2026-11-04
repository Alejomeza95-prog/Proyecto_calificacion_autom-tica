---
id: HT-CORE-01
title: Base técnica y servicios locales
status: in-progress            # draft | ready | in-progress | in-review | done
owner: JulianD27-ia
branch: feature/HT-CORE-01
updated: 2026-11-02
---

# HT-CORE-01 — Base técnica y servicios locales

> **spec.md describe QUÉ se construye y POR QUÉ.** El CÓMO (archivos, scripts, colecciones, índices, endpoints, contratos y pruebas) va en `plan.md`.
> Fuente: requisitos aportados por JulianD27-ia el 2026-10-22 (ver §14). No inventar requisitos ni criterios.
> Historia con el **Bloque A** (base técnica y entorno local). El Bloque B (cuentas, acceso y RBAC) se separó el 2026-11-02 como [HT-AUTH-01](../HT-AUTH-01/spec.md); sus IDs quedan retirados aquí (ver §14).
> Generado por `/sdd-spec` junto con `plan.md` y `tasks.md`, en estado `draft`. Solo el desarrollador responsable cambia el estado a `ready`, tras revisar el checklist §13.

## 1. Objetivo
- **Bloque A:** como integrante del equipo de desarrollo, quiero una base local reproducible y segura con MongoDB, Redis, variables de entorno documentadas y el flujo SDD identificado, para desarrollar e integrar API, persistencia, colas, frontend y OMR sin exponer secretos.
- ~~**Bloque B:** cuentas, acceso y RBAC (HU-AUTH-001)~~ (trasladado a HT-AUTH-01 el 2026-11-02).

El Bloque A es prerrequisito de HT-AUTH-01 (ver §14).

## 2. Contexto y fuentes
**Bloque A — Base técnica y entorno local**

- **Tipo:** historia técnica transversal. Habilita a todas las historias del [roadmap](../roadmap.md).
- **Fuente:** «Requisitos aportados por JulianD27-ia el 2026-10-22» (objetivo, criterios, tareas de backend/servicios y frontend, contratos, DoD, seguridad, dependencias y decisiones pendientes). Ver §14.
- **Situación del repositorio en `develop` (verificada el 2026-10-22):**
  - `docker-compose.yml` define `mongo` (MongoDB 7 standalone, con healthcheck) y `redis` (Redis 7 con AOF, **sin healthcheck**). Ambos publican sus puertos solo en `127.0.0.1` y usan volúmenes con nombre. `api`, `omr` y `web` están detrás del perfil `app`.
  - `.env.docker.example` solo contiene marcadores `cambiar_*`. `.gitignore` excluye `.env`, `.env.*` y `*.env`.
  - Existen `README_SETUP.md`, `docs/onboarding/00..05`, `scripts/docker-up.ps1`, `docker-down.ps1`, `docker-reset.ps1` y `sdd-validate.ps1`.
  - **`apps/api`, `apps/web` y `apps/omr` no existen**. Su creación es la decisión transversal DT-01. Hay plantillas en `docker/templates/`.
- **Actualización 2026-10-28:** el responsable fija la estructura `apps/backend` (NestJS) y `apps/frontend` (React + Vite), que reemplaza los nombres previstos `apps/api` y `apps/web`. `apps/omr` se conserva como servicio independiente del motor OMR. Esta historia crea los esqueletos mínimos de backend y frontend (Fase 0B); el de OMR queda para OMR-001..003.
- **Antecedente:** existe la rama remota `origin/feature/HT-CORE-01` (otro responsable, 2026-10-10), sin fusionar en `develop`. Esta spec se generó de nuevo por decisión del responsable actual. El equipo debe conciliar ambas ramas antes del PR (ver §12).
- Esta historia **consolida y verifica** la base existente. No rediseña la infraestructura.

**Bloque B — trasladado a HT-AUTH-01 (2026-11-02).** Ver [`specs/HT-AUTH-01/spec.md`](../HT-AUTH-01/spec.md).

## 3. Alcance
**Bloque A — Base técnica y entorno local**

### Incluye
- Revisar `README_SETUP.md`, `docs/onboarding/03-flujo-sdd.md`, `docs/onboarding/02-variables-entorno.md` y `.claude/skills/`, y corregir lo que no coincida con el repositorio real.
- Obtener el `.env` local desde la plantilla cuando no exista, manteniendo los secretos fuera de Git.
- Comprobar que Git ignora `.env`.
- Validar la configuración de Docker Compose y arrancar MongoDB y Redis cuando Docker Engine esté operativo.
- Verificar el estado de los servicios con su estado y sus logs.
- Documentar los comandos de inicio, comprobación y apagado seguro.
- Confirmar la estructura de aplicaciones antes de cualquier scaffolding.
- Crear los esqueletos mínimos de `apps/backend` (NestJS) y `apps/frontend` (React + Vite), sin código de negocio, con lint, typecheck, pruebas, build, Dockerfile y health check del backend (decisión del responsable, 2026-10-28).
- Dejar identificadas, para que el equipo las defina, las convenciones de lint, formato, pruebas y variables públicas/privadas del frontend.
- Instrucciones breves para configurar el entorno local.

### Fuera de alcance
- Crear el scaffolding de `apps/omr` (historias OMR-001..003).
- Código de negocio en `apps/backend` o `apps/frontend`: llega con HT-AUTH-01 y con las demás historias.
- Endpoints funcionales. El Bloque A solo expone el health check del backend.
- Replica set de MongoDB (DT-02), GridFS (DT-03), colas (DT-06) y migraciones (DT-07).
- Configurar CI y la protección de ramas (DT-08).
- Decidir las convenciones del frontend: esta historia solo las identifica y les asigna responsable.

### Supuestos
- Cada desarrollador tiene Docker Desktop (o Docker sobre WSL) con Compose v2 y el motor en ejecución.
- Cada desarrollador usa credenciales locales propias que no se comparten.
- El sistema de referencia del equipo es Windows con PowerShell (los scripts existentes son `.ps1`).

**Bloque B — trasladado a HT-AUTH-01 (2026-11-02).** Ver [`specs/HT-AUTH-01/spec.md`](../HT-AUTH-01/spec.md).

## 4. Dependencias funcionales
**Bloque A — Base técnica y entorno local**

- Ninguna historia previa.
- Acceso a Docker Desktop/WSL configurado y archivos de setup del repositorio disponibles (requisito aportado).
- Es requisito previo de todas las historias (HU-EVAL-*, HU-UX-001, OMR-*).

**Bloque B — trasladado a HT-AUTH-01 (2026-11-02).** Ver [`specs/HT-AUTH-01/spec.md`](../HT-AUTH-01/spec.md).

## 5. Reglas de negocio e invariantes
**Bloque A — Base técnica y entorno local**

- **RN-01:** `.env` nunca se versiona. La plantilla `.env.docker.example` solo contiene marcadores, sin secretos.
- **RN-02:** si `.env` ya existe, no se sobrescribe: se integran las variables nuevas.
- **RN-03:** no se ejecuta `docker compose down -v` (ni otra eliminación de volúmenes) en entornos con datos que deban conservarse. El apagado habitual conserva los datos.
- **RN-04:** no se registran URI de conexión completas ni contraseñas en logs, documentación, specs, PR ni salidas de consola compartidas.
- **RN-05:** no se crea scaffolding fuera de la estructura aprobada: `apps/backend` (NestJS), `apps/frontend` (React + Vite) y `apps/omr` (motor OMR, reservado para OMR-001..003).
- **RN-06:** toda variable nueva se agrega a la plantilla con un marcador y se documenta en `docs/onboarding/02-variables-entorno.md` (regla vigente del repositorio).
- **RN-20:** los esqueletos de aplicación no contienen código de negocio ni implementaciones ficticias: solo configuración, el health check del backend y las pruebas que verifican el propio esqueleto.

**Bloque B — trasladado a HT-AUTH-01 (2026-11-02).** Ver [`specs/HT-AUTH-01/spec.md`](../HT-AUTH-01/spec.md).

- ~~RN-07..RN-19~~ (retirados: trasladados a HT-AUTH-01 como RN-01..RN-13).

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

**Bloque B — trasladado a HT-AUTH-01 (2026-11-02).** Ver [`specs/HT-AUTH-01/spec.md`](../HT-AUTH-01/spec.md).

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

**Bloque B — trasladado a HT-AUTH-01 (2026-11-02).** Ver [`specs/HT-AUTH-01/spec.md`](../HT-AUTH-01/spec.md).

## 8. Roles y permisos (nivel negocio)
**Bloque A — Base técnica y entorno local**

| Rol | Puede |
|---|---|
| Desarrollador del equipo | Configurar su `.env`, arrancar, verificar y apagar los servicios locales. |
| Equipo (decisión colectiva) | Definir la estructura del monorepo, las convenciones de frontend y los comandos que exige CI. |

**Bloque B — trasladado a HT-AUTH-01 (2026-11-02).** Ver [`specs/HT-AUTH-01/spec.md`](../HT-AUTH-01/spec.md).

## 9. Datos de negocio involucrados
**Bloque A — Base técnica y entorno local**

- Credenciales locales de MongoDB (usuario y contraseña): **secretas**. Solo viven en `.env`.
- Nombre de base de datos, puertos y URIs con marcadores: no secretos en la plantilla.
- No se manejan datos personales de estudiantes ni de usuarios.

**Bloque B — trasladado a HT-AUTH-01 (2026-11-02).** Ver [`specs/HT-AUTH-01/spec.md`](../HT-AUTH-01/spec.md).

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
**Entonces** queda registrada la estructura aprobada (`apps/backend`, `apps/frontend` y `apps/omr`), y las convenciones de frontend pendientes (lint, formato, pruebas y variables públicas/privadas) figuran como decisiones de equipo con su dependencia técnica asociada.

### CA-21 — Esqueletos de backend y frontend construibles
**Dado** la estructura `apps/backend` y `apps/frontend`
**Cuando** se instalan sus dependencias y se ejecutan lint, typecheck, pruebas y build, y se arrancan con Docker Compose (perfil `app`)
**Entonces** todo termina sin errores, el backend responde a su health check, el frontend sirve su página inicial y ninguno contiene código de negocio.

**Bloque B — trasladado a HT-AUTH-01 (2026-11-02).** Ver [`specs/HT-AUTH-01/spec.md`](../HT-AUTH-01/spec.md).

~~CA-09..CA-20~~ (retirados: trasladados a HT-AUTH-01 como CA-01..CA-12).

## 11. Requisitos no funcionales
**Bloque A — Base técnica y entorno local**

- **RNF-01:** el procedimiento es repetible en una máquina de desarrollo compatible con Docker Desktop o WSL (DoD aportado).

**Bloque B — trasladado a HT-AUTH-01 (2026-11-02).** Ver [`specs/HT-AUTH-01/spec.md`](../HT-AUTH-01/spec.md).

- ~~RNF-02..RNF-07~~ (retirados: trasladados a HT-AUTH-01 como RNF-01..RNF-06).

## 12. OPEN QUESTIONS
**Bloque A — Base técnica y entorno local**

- [x] Estructura de carpetas: `apps/backend`, `apps/frontend` y `apps/omr` (decisión del responsable, 2026-10-28).
- [ ] pnpm workspaces o carpetas independientes y paquete de tipos compartidos → DT-01 (propuesta en plan DEC-13).
- [ ] ¿Qué comandos de test y lint exige CI? → DT-08.
- [ ] ¿Quién define las convenciones de frontend (lint, formato, pruebas, variables públicas/privadas) y en qué historia se implementan?
- [ ] ¿Cómo se concilia esta rama con `origin/feature/HT-CORE-01` (implementación previa de otro responsable): se sustituye, se fusiona o se renombra esta rama?

**Bloque B — trasladado a HT-AUTH-01 (2026-11-02).** Ver [`specs/HT-AUTH-01/spec.md`](../HT-AUTH-01/spec.md).

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
| 2026-10-28 | Estructura de aplicaciones fijada por el responsable: `apps/backend` y `apps/frontend` (antes `apps/api` y `apps/web`); `apps/omr` se conserva. El scaffolding mínimo de backend y frontend entra en el alcance del Bloque A (Fase 0B). Se reformulan RN-05 y CA-08 y se agregan RN-20 y CA-21. El responsable pidió implementarlo en la misma instrucción, por lo que la spec sigue en `in-progress`. | JulianD27-ia |
| 2026-11-02 | **Separación del Bloque B como HT-AUTH-01**, a pedido del responsable. Se retiran CA-09..CA-20, RN-07..RN-19 y RNF-02..RNF-07 (tachados en §5, §10 y §11) y se reemplaza el contenido de cada sección del Bloque B por un enlace a `specs/HT-AUTH-01/`. Título: «Base técnica y servicios locales». El Bloque A no cambia de comportamiento, por lo que la spec sigue en `in-progress`. Fuente de los requisitos movida a `docs/requisitos/historias/HT-AUTH-01.md`. | JulianD27-ia (sesión de Claude Code, 2026-11-02) |
