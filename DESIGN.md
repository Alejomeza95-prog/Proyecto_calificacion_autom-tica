---
name: OMR-PreICFES, módulo de autenticación
description: Panel institucional con hoja OMR y tarjeta de acceso, limitado a HT-AUTH-02
colors:
  primary: "#1d3fae"
  primary-deep: "#15307f"
  primary-tint: "#eef3fd"
  primary-line: "#c3d3f6"
  panel: "#12276a"
  panel-ink: "#ffffff"
  panel-muted: "#c9d4f5"
  on-primary: "#ffffff"
  canvas: "#eef1f7"
  surface: "#ffffff"
  ink: "#141a2a"
  ink-muted: "#4a5468"
  line: "#dde2ec"
  field-border: "#7b8598"
  danger: "#b42318"
  danger-ink: "#8f1c13"
  danger-tint: "#fef0ee"
  danger-line: "#f2b8b0"
  success-ink: "#11613d"
  success-tint: "#ebf7f0"
  success-line: "#b5dfc6"
  review: "#e8a317"
typography:
  statement:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(2rem, 1.2rem + 1.4vw, 2.625rem)"
    fontWeight: 700
    lineHeight: 1.15
  headline:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.2
  body:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
rounded:
  control: "10px"
  card: "16px"
spacing:
  step-1: "0.5rem"
  step-2: "1rem"
  step-3: "1.5rem"
  step-4: "2.5rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.control}"
    height: "3rem"
  button-primary-hover:
    backgroundColor: "{colors.primary-deep}"
  input-text:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "3rem"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
  status-error:
    backgroundColor: "{colors.danger-tint}"
    textColor: "{colors.danger-ink}"
    rounded: "{rounded.control}"
---

# Design System: OMR-PreICFES, módulo de autenticación

## Alcance

Este documento rige **solo el módulo de autenticación de HT-AUTH-02** (DEC-10). No es la identidad corporativa de OMR-PreICFES: HU-UX-001 podrá adoptarlo o reemplazarlo. Describe lo implementado en `apps/frontend/src/app/global.css` y `apps/frontend/src/features/auth/components/` tras el rediseño del 2026-11-07, que reemplazó la dirección «Manual con separadores» (ver `specs/HT-AUTH-02/plan.md` §2.7).

## Overview

**Creative North Star: "La hoja leída"**

La entrada muestra el producto haciendo su trabajo: un panel institucional con una hoja de respuestas OMR leída, donde una marca dudosa se envía a revisión, junto a una tarjeta de acceso sobria. La persona reconoce el sistema que califica sus simulacros, completa una sola acción en la tarjeta y encuentra debajo los otros trámites.

No hay logo ni marca: el nombre del producto va como texto. Las siete pantallas comparten la misma plantilla (`AuthPage`); no hay color por trámite ni barra de trámites.

**Key Characteristics:**
- Panel azul marino institucional con el nombre, la declaración del producto y la hoja OMR en SVG.
- Un solo azul como color de acción, sobre fondos claros y neutros fríos.
- Tarjeta blanca con radio de 16 px y sombra suave; los trámites relacionados van en su pie.
- Fuentes del sistema y ningún recurso externo.

## Colors

Un azul institucional para toda acción; los demás colores son neutros o de estado.

### Primary
- **Azul institucional** (`--primary` #1d3fae): botón principal, enlaces, anillo de foco, marcas de la hoja. Variante profunda (#15307f) para cursor encima y envío; tinte (#eef3fd) y filete (#c3d3f6) para avisos informativos y el halo del campo con foco.
- **Azul marino del panel** (`--panel` #12276a): fondo del panel institucional, con texto blanco y texto secundario #c9d4f5.

### Neutral
- **Lienzo** (#eef1f7): fondo de la página.
- **Superficie** (#ffffff): tarjeta, campos y botón secundario.
- **Tinta** (#141a2a) y **tinta suave** (#4a5468): texto principal y secundario.
- **Filete** (#dde2ec): borde de la tarjeta y separador del pie.
- **Borde de campo** (#7b8598).

### Estados
- **Error:** #b42318 para bordes de campo e iconos; aviso tintado (#fef0ee, filete #f2b8b0, texto #8f1c13).
- **Éxito:** aviso tintado (#ebf7f0, filete #b5dfc6, texto e icono #11613d).
- **Revisión** (#e8a317): solo en la ilustración, para el anillo y el rótulo de la marca dudosa.

### Named Rules
**The Un Solo Azul Rule.** Toda acción usa el azul institucional; no hay colores por trámite.

**The Nunca Solo Color Rule.** Los estados siempre llevan icono y texto; el color nunca comunica un estado por sí solo.

## Typography

**Font:** sans del sistema (`system-ui`, con alternativas de plataforma) en todo el módulo.

### Hierarchy
- **Declaración** (700, `clamp(2rem, 1.2rem + 1.4vw, 2.625rem)` en escritorio, 1.15): frase del producto en el panel.
- **Headline** (700, 1.5rem en celular y 1.75rem desde 40rem, 1.2): título de cada pantalla, en un `h1` que recibe el foco al navegar.
- **Body** (400, 1rem, 1.5): descripción bajo el título, en tinta suave, con un máximo de 60ch.
- **Label** (600, 0.9375rem): etiquetas de campo, mensajes de error y avisos; las ayudas usan 0.875rem en tinta suave.

### Named Rules
**The Sin Fuentes Externas Rule.** Solo fuentes instaladas, porque las pantallas con token no cargan recursos externos (RN-07).

## Layout

- **Celular** (por debajo de 40rem): barra azul marino con el nombre y tarjeta a todo el ancho; sin declaración ni ilustración.
- **Tableta** (desde 40rem): el panel es una franja superior con el nombre y la declaración, sin ilustración; su texto arranca en el mismo borde que el contenido de la tarjeta. Tarjeta centrada de hasta 32rem.
- **Escritorio** (desde 64rem): dos columnas `0.72fr / 1fr`. El panel ocupa toda la altura, fijo al desplazar: nombre y declaración arriba, hoja OMR en el centro y el principio del producto al pie. La tarjeta, de hasta 28rem, se alinea arriba con un margen de `clamp(2.5rem, 15vh, 9rem)`, para que un mensaje de validación no la desplace.

A 640 px, equivalente a un zoom del 200 % en 1280, se usa la disposición de tableta. El ritmo usa cuatro pasos: 0.5, 1, 1.5 y 2.5rem.

## Elevation & Depth

- **Tarjeta:** sombra suave en dos capas (`0 1px 2px` y `0 12px 32px -12px`, tinta al 5 % y 14 %).
- **Hoja OMR:** girada −2,5° con `drop-shadow(0 22px 34px)` sobre el panel.
- **Botón principal:** sombra mínima de 1px.

## Shapes

Radio de 10 px en campos, botones y avisos; 16 px en la tarjeta. Las burbujas de la hoja son círculos; el anillo de revisión y su rótulo son píldoras.

## Components

### Buttons
- **Primary:** azul institucional con texto blanco, 3rem de altura mínima, a todo el ancho de la tarjeta.
- **Hover / Focus:** variante profunda; anillo de 3px azul con separación de 2px.
- **Enviando:** usa `aria-disabled` para conservar el foco, cambia el texto, muestra un indicador giratorio (solo sin movimiento reducido) e impide un doble envío.
- **Secundario (Mostrar u ocultar contraseña):** fondo blanco, borde de campo y radio de 10 px.

### Inputs / Fields
- **Style:** fondo blanco, borde de 1px (#7b8598), radio de 10 px y 3rem de altura.
- **Focus:** borde azul, halo tintado de 4px y anillo de 3px.
- **Error:** borde de error de 2px, y debajo icono y texto asociados al campo. Lo escrito se conserva.
- **Contraseña:** admite pegar y gestores de contraseñas; la política va junto al campo, antes de cualquier error.

### Enlaces
- **Acción principal como enlace:** cuando la pantalla consiste en ir a otra, el enlace se ve como el botón primario.
- **Enlaces secundarios:** azules, en negrita y siempre subrayados (el azul no contrasta 3:1 con la tinta del texto), con 2.75rem de área táctil.
- **Pie de la tarjeta:** separado por un filete; agrupa los trámites relacionados y el cambio entre «Iniciar sesión» y «Crear cuenta».

### Avisos de estado
Bloques tintados con borde de 1px, radio de 10 px e icono dibujado: informativo (azul), error y éxito. Errores como `alert`, el resto como `status`, y todos pueden recibir el foco.

### Hoja OMR (`OmrSheetIllustration`)
SVG en el código, decorativo (`aria-hidden`) y con datos sintéticos: fiduciales, marcas de sincronización, opciones A–D y ocho filas; la fila 5 tiene dos marcas y recibe el anillo ámbar y el rótulo «Revisión».

**Interacción firma:** al cargar, las marcas se rellenan en secuencia (520 ms, 110 ms entre marcas) y, después de la última, el anillo de revisión se traza y aparece el rótulo. Sin animación con movimiento reducido.

## Do's and Don'ts

### Do:
- **Do** usar una sola acción principal por pantalla.
- **Do** decir qué pasó y qué sigue en cada resultado.
- **Do** acompañar cada color de estado con un icono y un texto que comuniquen lo mismo.
- **Do** mantener el contraste de 4.5:1 en texto y comprobarlo con `axe`.

### Don't:
- **Don't** inventar logo, marca ni identidad corporativa global.
- **Don't** cargar fuentes, imágenes ni scripts externos; la única excepción aprobada es Turnstile, en inicio de sesión y solo tras un desafío.
- **Don't** usar colores por trámite ni un segundo color de acción.
- **Don't** usar el ámbar de revisión fuera de la ilustración.
- **Don't** animar sin respetar `prefers-reduced-motion`.
