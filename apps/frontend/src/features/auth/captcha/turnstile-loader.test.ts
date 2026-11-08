import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadTurnstile, TURNSTILE_LOAD_TIMEOUT_MS, type TurnstileApi } from './turnstile-loader.ts';

const scripts = () => document.head.querySelectorAll<HTMLScriptElement>('script[src*="challenges.cloudflare.com"]');
const API: TurnstileApi = { render: () => 'widget', reset: () => undefined, remove: () => undefined };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  scripts().forEach((script) => {
    script.dispatchEvent(new Event('error'));
    script.remove();
  });
  delete window.turnstile;
  vi.useRealTimers();
});

describe('Carga de Turnstile (plan §2.6, RN-10)', () => {
  it('pide un solo script aunque se llame varias veces', () => {
    void loadTurnstile().catch(() => undefined);
    void loadTurnstile().catch(() => undefined);

    expect(scripts()).toHaveLength(1);
    expect(scripts()[0]?.src).toBe('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');
  });

  it('resuelve al cargar, sin que el plazo la rechace después', async () => {
    const loaded = loadTurnstile();
    window.turnstile = API;
    scripts()[0]?.dispatchEvent(new Event('load'));

    await expect(loaded).resolves.toBe(API);
    await vi.advanceTimersByTimeAsync(TURNSTILE_LOAD_TIMEOUT_MS * 2);
    await expect(loaded).resolves.toBe(API);
  });

  it('un script que no responde se rechaza al vencer el plazo, y se retira', async () => {
    const loaded = loadTurnstile();
    const rejected = expect(loaded).rejects.toThrow('tardó demasiado');

    await vi.advanceTimersByTimeAsync(TURNSTILE_LOAD_TIMEOUT_MS - 1);
    expect(scripts()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);

    await rejected;
    expect(scripts()).toHaveLength(0);
  });

  it('tras vencer el plazo se puede reintentar con un script nuevo', async () => {
    const first = loadTurnstile();
    const rejected = expect(first).rejects.toThrow();
    const stale = scripts()[0];
    await vi.advanceTimersByTimeAsync(TURNSTILE_LOAD_TIMEOUT_MS);
    await rejected;

    const second = loadTurnstile();
    // Una respuesta tardía del script abandonado no afecta al nuevo intento.
    stale?.dispatchEvent(new Event('error'));
    window.turnstile = API;
    scripts()[0]?.dispatchEvent(new Event('load'));

    await expect(second).resolves.toBe(API);
  });

  it('un error de carga se rechaza y permite reintentar', async () => {
    const first = loadTurnstile();
    scripts()[0]?.dispatchEvent(new Event('error'));

    await expect(first).rejects.toThrow('No se pudo cargar');
    expect(scripts()).toHaveLength(0);
    void loadTurnstile().catch(() => undefined);
    expect(scripts()).toHaveLength(1);
  });

  it('un script que carga sin exponer la API se rechaza y se retira', async () => {
    const loaded = loadTurnstile();
    scripts()[0]?.dispatchEvent(new Event('load'));

    await expect(loaded).rejects.toThrow('no está disponible');
    expect(scripts()).toHaveLength(0);
  });

  it('si la API ya existe, no pide el script', async () => {
    window.turnstile = API;

    await expect(loadTurnstile()).resolves.toBe(API);
    expect(scripts()).toHaveLength(0);
  });
});
