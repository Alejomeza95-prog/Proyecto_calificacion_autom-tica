---
version: 1
slug: "src-features-auth-components-authpage-tsx-37a583bd"
primary_target: "apps/frontend/src/features/auth/components/AuthPage.tsx"
related_targets: ["apps/frontend/src/app/router.tsx"]
---

## Alcance
Modo Operate. Pantallas de autenticación de HT-AUTH-02 (acceso, registro, verificación, recuperación, activación, inicio y estados de sesión), y nada más: HU-UX-001 podrá adoptar o reemplazar esta dirección (DEC-10). Docentes y administradores entran rápido, en la oficina o desde el celular. Restricciones fijas: sin logo ni marca, fuentes del sistema, ningún recurso externo (RN-07), variables CSS y CSS Modules, controles web estándar, sin dependencias nuevas.

Dirección fijada por el desarrollador el 2026-11-07: reemplaza «Manual con separadores». Brief: azul institucional como único color de acción, fondos claros y neutros, dos columnas con panel institucional e ilustración educativa, tarjeta limpia, sin pestañas laterales, enlaces secundarios dentro de la tarjeta. Ilustración: hoja de respuestas OMR en SVG. Sin color por trámite.

## Direction contract
THESIS: la entrada muestra el producto haciendo su trabajo, una hoja de respuestas leída con una marca dudosa enviada a revisión, junto a una tarjeta de acceso sobria; rechaza el login de color plano por trámite y la tarjeta flotando sin contexto.
OWN-WORLD: panel azul marino institucional a toda altura, con nombre en texto, declaración del producto y hoja OMR en SVG (burbujas A–D rellenas en azul, una marca dudosa con anillo ámbar y rótulo «Revisión»). Fondo gris azulado claro; tarjeta blanca con radio de 16 px y sombra suave con desplazamiento. Campos de 48 px con radio de 10 px; botón primario azul a todo el ancho. Avisos como bloques tintados con icono dibujado. Sans del sistema en todo.
STORY: la persona reconoce el sistema que califica sus simulacros, completa una sola acción en la tarjeta y encuentra debajo los otros trámites.
FIRST VIEWPORT: escritorio, panel a la izquierda (~42 %) con nombre arriba, declaración grande, hoja OMR centrada y principio al pie; a la derecha, tarjeta centrada de hasta 28rem con h1, descripción, campos, botón y enlaces secundarios. Tableta: panel como franja superior sin ilustración. Móvil: barra con el nombre y tarjeta a todo el ancho.
FORM: canon fijado por el usuario (sin tirada de conceptos: dirección fijada por el brief); seed key: ninguna, brief pinned. Interacción firma: al cargar, las marcas de la hoja se rellenan en secuencia y la dudosa recibe su anillo ámbar al final; sin animación con movimiento reducido.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
