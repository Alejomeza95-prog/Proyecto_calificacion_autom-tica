import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/** Mueve el foco al elemento cuando aparece o cambia un resultado (RNF-01). */
export function useResultFocus<T extends HTMLElement>(result: unknown): RefObject<T | null> {
  const ref = useRef<T>(null);
  // `useEffect`, no `useLayoutEffect`: al llegar a una pantalla con un resultado (Revisa tu correo, sesión cerrada),
  // `AuthPage` (hija de la pantalla) mueve el foco al `h1` en su propio `useEffect`, y React ejecuta los efectos
  // pasivos de la hija antes que los de la pantalla; así el resultado recibe el foco al final. Con `useLayoutEffect`
  // el resultado se enfocaba antes y el `h1` se quedaba con el foco (E2E del 2026-11-10).
  useEffect(() => {
    if (result) ref.current?.focus();
  }, [result]);
  return ref;
}

/** Mueve el foco al primer campo con error; pasar un objeto nuevo por envío repite el foco (RNF-01). */
export function useFirstInvalidFocus(errors: object | null): RefObject<HTMLFormElement | null> {
  const ref = useRef<HTMLFormElement>(null);
  // `useLayoutEffect`: el foco llega al campo en la misma confirmación (commit) que muestra el error. Con `useEffect`
  // había un intervalo con el error visible y el foco en `<body>`, y la prueba del 422 fallaba de forma intermitente
  // bajo carga. Aquí no hay navegación, así que el foco del `h1` de `AuthPage` no interviene.
  useLayoutEffect(() => {
    if (errors) ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);
  return ref;
}
