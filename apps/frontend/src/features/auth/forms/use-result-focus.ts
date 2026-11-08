import { useEffect, useRef, type RefObject } from 'react';

/** Mueve el foco al elemento cuando aparece o cambia un resultado (RNF-01). */
export function useResultFocus<T extends HTMLElement>(result: unknown): RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (result) ref.current?.focus();
  }, [result]);
  return ref;
}

/** Mueve el foco al primer campo con error; pasar un objeto nuevo por envío repite el foco (RNF-01). */
export function useFirstInvalidFocus(errors: object | null): RefObject<HTMLFormElement | null> {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (errors) ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);
  return ref;
}
