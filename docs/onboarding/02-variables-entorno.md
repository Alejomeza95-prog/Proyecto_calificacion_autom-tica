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

Dentro de Docker, `docker-compose.yml` sobrescribe `MONGODB_URI` y `REDIS_URL` del servicio `api` con los hostnames `mongo` y `redis`.

## Contraseña codificada para URL
Si la contraseña contiene caracteres como `% @ : / ? # $` y espacios, en una URI deben codificarse (`%` → `%25`, `@` → `%40`, etc.). Generarla localmente, sin pegarla en servicios externos:

```powershell
# Pide la contraseña sin mostrarla y escribe solo el valor codificado
$p = Read-Host -AsSecureString "Contraseña"
[uri]::EscapeDataString([Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($p)))
```
Copiar el resultado en `MONGO_ROOT_PASSWORD_URLENCODED` y dentro de `MONGODB_URI`. Si la contraseña cambia, regenerar ambas.

## Reglas
- Nunca commitear `.env` ni pegar credenciales en issues, PR, chats o specs.
- Agregar una variable nueva implica: actualizar `.env.docker.example` con un marcador, esta tabla y la spec que la requiere.
- Claude Code tiene denegada la lectura de `.env` en `.claude/settings.json`.
