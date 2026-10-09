---
name: typescript-strict-mode
description: Mantiene TypeScript estricto y seguro en frontend y backend. Usar al escribir o revisar TypeScript, DTOs, hooks, servicios, tipos de API, validaciones Zod o código NestJS/React.
---

# TypeScript Strict Mode

- Mantener `strict: true`.
- Evitar `any`; preferir `unknown` + narrowing.
- Tipar inputs externos en tiempo de ejecución con DTO/Zod/validadores.
- No usar non-null assertions (`!`) para silenciar estados posibles salvo prueba local clara.
- Modelar estados finitos con unions discriminadas cuando ayude.
- No duplicar tipos de contrato manualmente si pueden derivarse de una fuente compartida segura.
- Activar chequeos que prevengan accesos inseguros a índices y propiedades opcionales cuando el proyecto lo permita.
- Toda conversión de tipo (`as`) debe ser local, justificada y no reemplazar validación runtime.
