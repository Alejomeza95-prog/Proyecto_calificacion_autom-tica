---
name: omr-engine
description: Diseña, implementa y prueba el motor OMR por visión computacional. Usar para fiduciales, homografía, ROIs, lectura de burbujas, QR, identidad, calidad de imagen, estados ambiguos y revisión humana.
---

# OMR Engine

## Pipeline canónico
1. Validar captura: resolución, hoja completa, blur e iluminación.
2. Detectar 4 fiduciales y orientación.
3. Rectificar perspectiva a tamaño normalizado.
4. Cargar geometría desde plantilla externa; no hardcodear coordenadas en lógica.
5. Leer QR/token e identificador OMR de respaldo.
6. Medir densidad de cada ROI.
7. Clasificar respuesta: A/B/C/D, BLANK, MULTIPLE o UNCERTAIN.
8. Si identidad o respuesta es ambigua, enviar a revisión manual; nunca adivinar.
9. Devolver resultado estructurado con métricas de calidad y razones de revisión.

## Reglas de diseño
- Calibrar umbrales con datos reales; no asumir un valor mágico universal.
- Guardar suficiente evidencia de diagnóstico sin retener imágenes más tiempo del definido por política.
- Para MULTIPLE/UNCERTAIN, permitir recorte de ROI para revisión humana.
- Las pruebas deben incluir escáner, cámara/teléfono, inclinación, iluminación, marcas tenues, dobles y desenfoque.
