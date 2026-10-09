---
name: clean-code-solid
description: Aplica principios de código limpio y SOLID sin sobrearquitectura. Usar al crear o refactorizar servicios, módulos, componentes, workers, adaptadores e integraciones del proyecto.
---

# Clean Code + SOLID

- Nombres que expresen intención; evitar abreviaturas crípticas.
- Funciones pequeñas con una responsabilidad clara.
- Separar dominio, aplicación e infraestructura cuando reduzca acoplamiento real.
- Inyectar dependencias externas; no esconder acceso a red/DB en utilidades globales.
- Evitar clases/abstracciones de una sola implementación si no aportan testabilidad o desacoplamiento.
- No duplicar validaciones de dominio: crear una única regla reutilizable.
- Preferir composición a herencia.
- Errores con contexto; nunca tragar excepciones.
- Refactorizar solo lo necesario para mantener la HU legible y testeable.
