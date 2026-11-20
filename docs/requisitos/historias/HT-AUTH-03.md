# HT-AUTH-03 — Administración de cuentas, navegación principal, claves de respuesta y verificación manual (documento fuente)

| Campo | Valor |
|---|---|
| Origen | Texto entregado por JhonDc en una sesión de Claude Code (`/sdd-spec`) el 2026-11-11; transcrito sin cambios de contenido |
| Fecha de registro | 2026-11-11 |
| Responsable | JhonDc |
| Tipo | Historia técnica |
| Datos personales / secretos | Ninguno |
| Spec | [`specs/HT-AUTH-03/spec.md`](../../../specs/HT-AUTH-03/spec.md) |

## Requisitos aportados

> Esta historia DEBE integrar todas las funcionalidades de evaluación y administración solicitadas:
>
> 1. Panel de Usuarios: Interfaz para aprobar usuarios (cambiar de estado 'PENDIENTE_APROBACION' a 'ACTIVA').
> 2. Menú lateral (Sidebar): Para la navegación principal del sistema.
> 3. CRUD de 'Clave de respuestas' con los siguientes campos y reglas:
>    - Selección del 'Nombre de la prueba' (examen).
>    - Selección de la 'Fecha' y 'Sesión'.
>    - Selección de la 'Materia' (MAT, CN, CC, LC, ING).
>    - Generación dinámica de la grilla basada en la 'Cantidad de preguntas por materia'.
>    - Ingreso de la 'Clave de respuesta' (limitado a opciones A, B, C, D).
>    - Acción de 'Guardar la clave' garantizando que pueda 'Ser editable' (implementando estados Borrador y Publicada).
> 4. Casilla Verificada (Checkbox): Control visual vinculado al campo de resolución manual para confirmar marcas dudosas detectadas por el sistema OMR.
>
> Asegúrate de incluir en el spec.md los criterios de aceptación, los modelos de datos de MongoDB impactados y los endpoints de NestJS propuestos para que el equipo inicie el desarrollo.

## Aclaraciones posteriores

Las preguntas abiertas se resolvieron el 2026-11-11 por decisión del responsable, que delegó la resolución aceptando las propuestas del plan: catálogos mínimos de instituciones y pruebas; Sesión 1 y Sesión 2; de 1 a 100 preguntas por materia; clave Publicada de solo consulta (corrección y versionado en HU-EVAL-002); ADMIN y COORDINADOR editan claves y DOCENTE solo consulta; revisión manual por ADMIN y COORDINADOR; BLANK como valor resuelto válido. Detalle en `specs/HT-AUTH-03/spec.md` §12 y §14.
