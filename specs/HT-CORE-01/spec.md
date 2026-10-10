---
id: HT-CORE-01
title: Base técnica, configuración y servicios locales
status: ready            # draft | ready | in-progress | in-review | done
owner: Diego Alejandro Narvaez Meza
branch: feature/HT-CORE-01
updated: 2026-10-10
---

# HT-CORE-01 — Base técnica, configuración y servicios locales

> **spec.md describe QUÉ se construye y POR QUÉ.** El CÓMO (archivos, scripts, comandos exactos, healthchecks, pruebas) va en `plan.md`.
> Fuente obligatoria: [`docs/requisitos/historias/HT-CORE-01.md`](../../docs/requisitos/historias/HT-CORE-01.md).

## 1. Objetivo
Como integrante del equipo de desarrollo, quiero una base local reproducible y segura con MongoDB, Redis, variables de entorno y el flujo SDD identificado, para desarrollar e integrar API, persistencia, colas, frontend y OMR sin exponer secretos.

## 2. Contexto y fuentes
- **Tipo:** historia técnica transversal; habilita a todas las historias del [roadmap](../roadmap.md).
- **Fuente:** `docs/requisitos/historias/HT-CORE-01.md` (objetivo, criterios, tareas, DoD, seguridad, dependencias y decisiones pendientes).
- **Situación actual del repositorio (verificada el 2026-10-10):**
  - `docker-compose.yml` define `mongo` (MongoDB 7 standalone, con healthcheck) y `redis` (Redis 7, persistencia AOF) como servicios base, con puertos publicados solo en `127.0.0.1` y volúmenes con nombre. `api`, `omr` y `web` están detrás del perfil `app`.
  - `.env.docker.example` existe solo con marcadores; `.gitignore` excluye `.env`.
  - Existen `README_SETUP.md`, `docs/onboarding/01..05`, `scripts/docker-up.ps1`, `docker-down.ps1` y `docker-reset.ps1` (este último pide confirmación escrita).
  - **`apps/api`, `apps/web` y `apps/omr` no existen**; su creación es la decisión transversal DT-01.
- Esta historia **consolida y verifica** lo existente; no rediseña la infraestructura.

## 3. Alcance
### Incluye
- Revisar `README_SETUP.md`, `docs/onboarding/02-variables-entorno.md`, `docs/onboarding/03-flujo-sdd.md` y `.claude/skills/`, y corregir lo que no coincida con el repositorio real.
- Obtener el `.env` local desde la plantilla cuando no exista, sin publicar secretos.
- Comprobar que `.env` permanece ignorado por Git.
- Validar la configuración de Docker Compose y arrancar MongoDB y Redis cuando Docker Engine esté operativo.
- Verificar el estado de los servicios (estado y logs).
- Documentar de forma breve los comandos de inicio, comprobación y apagado seguro.
- Confirmar y dejar registrada la estructura real de `apps/api` y `apps/web` antes de cualquier scaffolding.
- Registrar las convenciones de frontend que el equipo debe definir (lint, formato, pruebas, variables públicas y privadas) y su responsable.
- Instrucciones breves para configurar el entorno local.

### Fuera de alcance
- Crear el scaffolding de `apps/api`, `apps/web` o `apps/omr` (DT-01).
- Endpoints funcionales o health checks de aplicación (se definen al implementar cada app).
- Replica set de MongoDB (DT-02), GridFS (DT-03), autenticación (DT-04), convenciones de colas (DT-06), migraciones (DT-07).
- Configurar CI y protección de ramas (DT-08).
- Decidir las convenciones de frontend: esta historia solo las deja identificadas y asignadas.
- Diseño de interfaz: pertenece a HU-UX-001.

### Supuestos
- Cada desarrollador tiene Docker Desktop (o Docker sobre WSL) con Compose v2 y el motor en ejecución.
- Cada desarrollador usa credenciales locales propias que no se comparten.
- El sistema de referencia del equipo es Windows con PowerShell (los scripts existentes son `.ps1`).

## 4. Dependencias funcionales
- Ninguna historia previa.
- Requiere acceso a Docker Desktop/WSL configurado y los archivos de setup del repositorio.
- Es requisito previo de todas las historias (HU-EVAL-*, HU-UX-001, OMR-*).

## 5. Reglas de negocio e invariantes
- **RN-01:** `.env` nunca se versiona; la plantilla `.env.docker.example` solo contiene marcadores.
- **RN-02:** si `.env` ya existe, se integran las variables nuevas y no se sobrescribe.
- **RN-03:** no se ejecuta `docker compose down -v` (ni otra eliminación de volúmenes) en entornos con datos que deban conservarse; el apagado habitual conserva los datos.
- **RN-04:** no se registran URI de conexión completas ni contraseñas en logs, documentación, specs, PR ni salidas de consola compartidas.
- **RN-05:** los servicios base son solo `mongo` y `redis`; el perfil `app` no se usa mientras no existan `apps/*` con sus Dockerfiles.
- **RN-06:** no se crea scaffolding sin confirmar antes la estructura real de `apps/api` y `apps/web`.
- **RN-07:** toda variable nueva se agrega a la plantilla con un marcador y se documenta en `docs/onboarding/02-variables-entorno.md`.

## 6. Flujo funcional
1. El desarrollador clona el repositorio y trabaja en su rama según el flujo SDD.
2. Si no tiene `.env`, lo obtiene desde la plantilla y reemplaza los marcadores por valores propios (RN-01, RN-02).
3. Comprueba que Git ignora `.env`.
4. Valida la configuración de Compose sin arrancar nada.
5. Arranca MongoDB y Redis.
6. Comprueba que ambos servicios están disponibles mediante su estado y sus logs, sin exponer credenciales (RN-04).
7. Trabaja con los servicios.
8. Apaga los servicios conservando los datos (RN-03).

## 7. Estados y situaciones de negocio
| Estado / situación | Significado | Qué ve o puede hacer el desarrollador |
|---|---|---|
| Docker no operativo | El motor de Docker no está en ejecución | Los comandos de Compose fallan; debe iniciar Docker Desktop y repetir. |
| Variables incompletas | Falta `.env` o una variable obligatoria | La validación de Compose falla indicando la variable; debe completarla desde la plantilla. |
| Configuración válida | Compose acepta la configuración | La validación termina sin salida y sin error; puede arrancar servicios. |
| Servicios arrancando | Contenedores creados, MongoDB aún sin responder | El estado muestra el servicio en arranque; espera o revisa logs. |
| Servicios disponibles | MongoDB `healthy` y Redis en ejecución | Puede desarrollar contra ellos. |
| Servicio con error | Un contenedor no queda disponible | Revisa los logs del servicio; la guía indica las causas frecuentes. |
| Apagado conservando datos | Contenedores detenidos, volúmenes intactos | Al volver a arrancar, los datos siguen ahí. |

## 8. Roles y permisos (nivel negocio)
| Rol | Puede |
|---|---|
| Desarrollador | Configurar su `.env`, arrancar, comprobar y apagar sus servicios locales. |
| Responsable de la historia | Confirmar `ready`, registrar decisiones y aclaraciones en §14. |
| Equipo | Definir las convenciones pendientes (§12) y la estructura del monorepo. |

## 9. Datos de negocio involucrados
- **Variables de entorno locales:** usuario y contraseña de MongoDB, nombre de base de datos, puertos y URI de conexión. Usuario, contraseña y URI con credenciales son **secretos**.
- **Datos locales en volúmenes** de MongoDB y Redis: solo datos de desarrollo.
- **No hay datos personales de estudiantes** en esta historia.

## 10. Criterios de aceptación

### CA-01 — Configuración de Compose válida
**Dado** un `.env` completo obtenido desde la plantilla  
**Cuando** el desarrollador valida la configuración de Docker Compose (`docker compose config --quiet`)  
**Entonces** la validación termina con código 0 y sin salida, y no imprime valores secretos.

### CA-02 — Arranque de MongoDB y Redis
**Dado** Docker Engine operativo y la configuración válida  
**Cuando** el desarrollador arranca los servicios base (`docker compose up -d mongo redis`)  
**Entonces** MongoDB queda `healthy` y Redis queda en ejecución, y no se arranca ningún servicio del perfil `app`.

### CA-03 — Variables desde la plantilla sin publicar secretos
**Dado** un clon del repositorio sin `.env`  
**Cuando** el desarrollador sigue las instrucciones para obtener sus variables  
**Entonces** obtiene `.env` a partir de `.env.docker.example`, y ningún archivo versionado contiene credenciales reales.

### CA-04 — `.env` ignorado por Git
**Dado** un `.env` presente en la raíz  
**Cuando** se ejecuta `git check-ignore -v .env` y `git status`  
**Entonces** la primera indica la regla de `.gitignore` que lo excluye y la segunda no lista `.env`.

### CA-05 — Estado verificable sin exponer credenciales
**Dado** los servicios base en ejecución  
**Cuando** el desarrollador consulta `docker compose ps` y los logs de `mongo` y `redis`  
**Entonces** puede determinar si cada servicio está disponible, y la salida no contiene contraseñas ni URI con credenciales.

### CA-06 — Apagado seguro conservando datos
**Dado** servicios base en ejecución con datos de desarrollo  
**Cuando** el desarrollador los apaga con el procedimiento documentado y luego los vuelve a arrancar  
**Entonces** los volúmenes y sus datos se conservan, y la documentación advierte que la eliminación de volúmenes borra datos.

### CA-07 — Flujo y convenciones SDD identificados
**Dado** un integrante nuevo del equipo  
**Cuando** lee la guía de inicio del repositorio  
**Entonces** encuentra enlazados el flujo SDD, las plantillas de `specs/_templates/`, las skills de `.claude/skills/` y las reglas de ramas y commits.

### CA-08 — Procedimiento reproducible
**Dado** otra máquina de desarrollo compatible (supuestos de §3)  
**Cuando** una persona distinta del autor sigue solo las instrucciones documentadas  
**Entonces** llega a CA-01, CA-02 y CA-05 sin pasos adicionales no documentados.

### CA-09 — Estructura de apps y convenciones de frontend registradas
**Dado** que `apps/api` y `apps/web` deben confirmarse antes de crear scaffolding  
**Cuando** se cierra la historia  
**Entonces** queda registrada la estructura real encontrada y la lista de convenciones de frontend pendientes (lint, formato, pruebas, variables públicas y privadas) con su DT asociada, sin crear scaffolding.

## 11. Requisitos no funcionales
- **RNF-01 (seguridad):** los servicios locales solo se publican en `127.0.0.1`, no en la red local (configuración existente que debe mantenerse).
- **RNF-02 (seguridad):** ningún secreto ni dato personal entra en Git (fuente §Seguridad y DoD).

## 12. OPEN QUESTIONS
Ninguna cambia el comportamiento verificable de esta historia: se registran y se asignan, no se resuelven aquí.
- [ ] ¿Cuál es la estructura final del monorepo (pnpm workspaces o carpetas independientes, paquete compartido de contratos)? → DT-01.
- [ ] ¿Qué comandos de test y lint exige CI? → DT-08.
- [ ] ¿Qué convenciones de lint, formato y pruebas usa el frontend? → DT-05 / DT-01.
- [ ] ¿Qué variables del frontend son públicas (expuestas al navegador) y cuáles privadas, y con qué convención de nombres? → DT-01.
- [ ] ¿Cómo se define el health check de los servicios de aplicación (`api`, `omr`, `web`)? → se define al implementar cada app.
- [ ] ¿Cuándo se integran en `develop` las skills de diseño (Impeccable, Emil Kowalski) que hoy solo están en `config/claude-skills`? → PR de esa rama.

## 13. Checklist de spec lista (`status: ready`)
- [x] Objetivo, alcance y fuera de alcance claros.
- [x] Reglas de negocio numeradas (RN-01..RN-07).
- [x] Criterios de aceptación verificables (CA-01..CA-09).
- [x] Sin OPEN QUESTIONS que cambien el comportamiento observable.
- [x] Todo requisito respaldado por `docs/requisitos/historias/HT-CORE-01.md` o una decisión registrada en §14.

## 14. Registro de cambios y aclaraciones
| Fecha | Cambio / aclaración | Fuente o persona consultada |
|---|---|---|
| 2026-10-10 | Creación de la spec a partir del texto de la historia, registrado como `docs/requisitos/historias/HT-CORE-01.md` porque `docs/requisitos/` no tenía documentos fuente. | Diego Alejandro Narvaez Meza |
| 2026-10-10 | Rama `feature/HT-CORE-01` creada desde `develop` (9590845). Las skills Impeccable y Emil Kowalski están solo en `config/claude-skills` (6c8515a) y no forman parte de esta rama. | Diego Alejandro Narvaez Meza |
| 2026-10-10 | Se consultó la skill de Emil Kowalski (Impeccable no está disponible en esta rama). Como HT-CORE-01 no produce interfaz, no se definen reglas de UI aquí; las convenciones de diseño (tokens, accesibilidad, movimiento) se tratarán en HU-UX-001. | Decisión de la sesión |
| 2026-10-10 | CA-09 deriva de las tareas de frontend de la fuente ("confirmar estructura real", "definir con el equipo convenciones"). | Fuente §Tareas — Frontend |
| 2026-10-10 | Spec marcada `ready` tras revisión del checklist §13. | Diego Alejandro Narvaez Meza |
