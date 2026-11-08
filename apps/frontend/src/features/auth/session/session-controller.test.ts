import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deferred,
  flush,
  granted,
  installFakeAuthApi,
  meOk,
  noContent,
  problem,
  USER,
} from '../../../test/fake-auth-api.ts';
import { createSessionController, type SessionController } from './session-controller.ts';

/** Canal en memoria con la semántica real: no se entrega a la instancia que publica. */
class FakeChannel {
  static instances: FakeChannel[] = [];
  static posted: unknown[] = [];
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;

  constructor(readonly name: string) {
    FakeChannel.instances.push(this);
  }

  postMessage(data: unknown): void {
    FakeChannel.posted.push(data);
    FakeChannel.instances
      .filter((other) => other !== this && other.name === this.name)
      .forEach((other) => other.onmessage?.(new MessageEvent('message', { data })));
  }

  close(): void {
    FakeChannel.instances = FakeChannel.instances.filter((other) => other !== this);
  }
}

/** Candado en memoria que serializa como Web Locks. */
function installFakeLocks() {
  let tail: Promise<unknown> = Promise.resolve();
  const request = vi.fn((_name: string, callback: () => Promise<unknown>) => {
    const result = tail.then(callback);
    tail = result.catch(() => undefined);
    return result;
  });
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } });
  return request;
}

const controllers: SessionController[] = [];

function newController(): SessionController {
  const controller = createSessionController();
  controllers.push(controller);
  return controller;
}

beforeEach(() => {
  FakeChannel.instances = [];
  FakeChannel.posted = [];
  vi.stubGlobal('BroadcastChannel', FakeChannel);
});

afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.dispose());
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'locks');
});

describe('Restauración al cargar (CA-08)', () => {
  it('empieza en comprobando', () => {
    expect(newController().getSnapshot()).toEqual({ estado: 'comprobando' });
  });

  it('200 en refresh y me → autenticada con los datos de /me', async () => {
    const api = installFakeAuthApi({ 'POST /refresh': () => granted('jwt'), 'GET /me': meOk });
    const controller = newController();

    controller.ensureRestored();
    await flush();

    expect(controller.getSnapshot()).toEqual({ estado: 'autenticada', usuario: USER });
    expect(api.routes()).toEqual(['POST /refresh', 'GET /me']);
    expect(api.calls[1]?.headers.authorization).toBe('Bearer jwt');
  });

  it('401 sin cookie → anónima, sin motivo: no es un error', async () => {
    const api = installFakeAuthApi({ 'POST /refresh': () => problem(401, 'no-autenticado') });
    const controller = newController();

    controller.ensureRestored();
    await flush();

    expect(controller.getSnapshot()).toEqual({ estado: 'anonima', motivo: null });
    expect(api.routes()).toEqual(['POST /refresh']);
  });

  it.each([
    ['503', () => problem(503, 'servicio-saturado', { retryAfter: '5' })],
    ['500', () => problem(500, 'error-interno')],
    ['429', () => problem(429, 'demasiados-intentos', { retryAfter: '5' })],
    ['502 del proxy', () => new Response('Bad gateway', { status: 502 })],
  ])('%s en refresh → no-disponible, no anónima', async (_name, response) => {
    installFakeAuthApi({ 'POST /refresh': response });
    const controller = newController();

    controller.ensureRestored();
    await flush();

    expect(controller.getSnapshot()).toEqual({ estado: 'no-disponible' });
  });

  it('un fallo de red → no-disponible', async () => {
    installFakeAuthApi({});
    const controller = newController();

    controller.ensureRestored();
    await flush();

    expect(controller.getSnapshot()).toEqual({ estado: 'no-disponible' });
  });

  it('403 de /me → anónima con motivo, sin reintentos ni logout (CA-09)', async () => {
    const api = installFakeAuthApi({ 'POST /refresh': () => granted('jwt'), 'GET /me': () => problem(403, 'acceso-denegado') });
    const controller = newController();

    controller.ensureRestored();
    await flush();

    expect(controller.getSnapshot()).toEqual({ estado: 'anonima', motivo: 'cuenta-no-habilitada' });
    expect(api.routes()).toEqual(['POST /refresh', 'GET /me']);
  });

  it('401 de /me y renovación fallida → sesión perdida', async () => {
    const api = installFakeAuthApi({
      'POST /refresh': [() => granted('jwt'), () => problem(401, 'no-autenticado')],
      'GET /me': () => problem(401, 'no-autenticado'),
    });
    const controller = newController();

    controller.ensureRestored();
    await flush();

    expect(controller.getSnapshot()).toEqual({ estado: 'anonima', motivo: 'sesion-perdida' });
    expect(api.routes()).toEqual(['POST /refresh', 'GET /me', 'POST /refresh']);
  });

  it('401 de /me con renovación correcta reintenta con el token nuevo', async () => {
    const api = installFakeAuthApi({
      'POST /refresh': [() => granted('jwt-1'), () => granted('jwt-2')],
      'GET /me': [() => problem(401, 'no-autenticado'), meOk],
    });
    const controller = newController();

    controller.ensureRestored();
    await flush();

    expect(controller.getSnapshot().estado).toBe('autenticada');
    expect(api.calls.at(-1)?.headers.authorization).toBe('Bearer jwt-2');
  });

  it('retry desde no-disponible vuelve a comprobar y puede autenticar', async () => {
    installFakeAuthApi({ 'POST /refresh': [() => problem(503, 'servicio-saturado'), () => granted('jwt')], 'GET /me': meOk });
    const controller = newController();
    controller.ensureRestored();
    await flush();

    controller.retry();
    expect(controller.getSnapshot()).toEqual({ estado: 'comprobando' });
    await flush();

    expect(controller.getSnapshot().estado).toBe('autenticada');
  });

  it('retry no gasta otra rotación si el token ya se había obtenido', async () => {
    const api = installFakeAuthApi({ 'POST /refresh': () => granted('jwt'), 'GET /me': [() => problem(503, 'servicio-saturado'), meOk] });
    const controller = newController();
    controller.ensureRestored();
    await flush();
    expect(controller.getSnapshot()).toEqual({ estado: 'no-disponible' });

    controller.retry();
    await flush();

    expect(controller.getSnapshot().estado).toBe('autenticada');
    expect(api.count('POST /refresh')).toBe(1);
  });

  it('retry no hace nada fuera de no-disponible', async () => {
    const api = installFakeAuthApi({ 'POST /refresh': () => problem(401, 'no-autenticado') });
    const controller = newController();
    controller.ensureRestored();
    await flush();

    controller.retry();
    await flush();

    expect(api.count('POST /refresh')).toBe(1);
  });
});

describe('Renovación de un solo vuelo (RN-12)', () => {
  it('varias llamadas a ensureRestored hacen una sola renovación', async () => {
    const api = installFakeAuthApi({ 'POST /refresh': () => granted('jwt'), 'GET /me': meOk });
    const controller = newController();

    controller.ensureRestored();
    controller.ensureRestored();
    controller.ensureRestored();
    await flush();
    controller.ensureRestored();
    await flush();

    expect(api.count('POST /refresh')).toBe(1);
    expect(api.count('GET /me')).toBe(1);
  });

  it('dentro de la pestaña, las renovaciones simultáneas comparten una sola solicitud', async () => {
    const pending = deferred<Response>();
    const api = installFakeAuthApi({
      'POST /refresh': () => pending.promise,
      'GET /me': meOk,
      'POST /logout': noContent,
    });
    const controller = newController();

    // Restaurar y cerrar necesitan un token a la vez: ambas operaciones deben esperar la misma renovación.
    controller.ensureRestored();
    const logout = controller.logout();
    await flush();
    expect(api.count('POST /refresh')).toBe(1);

    pending.resolve(granted('jwt'));
    await logout;
    await flush();

    expect(api.count('POST /refresh')).toBe(1);
    expect(api.calls.find((call) => call.route === 'POST /logout')?.headers.authorization).toBe('Bearer jwt');
    expect(controller.getSnapshot()).toEqual({ estado: 'anonima', motivo: 'cierre-de-sesion' });
  });

  it('tras una renovación fallida, la siguiente vuelve a intentarlo', async () => {
    const api = installFakeAuthApi({
      'POST /refresh': [() => problem(503, 'servicio-saturado'), () => granted('jwt')],
      'GET /me': meOk,
    });
    const controller = newController();
    controller.ensureRestored();
    await flush();

    controller.retry();
    await flush();

    expect(api.count('POST /refresh')).toBe(2);
    expect(controller.getSnapshot().estado).toBe('autenticada');
  });

  it('con Web Locks, usa el candado omr-auth-refresh', async () => {
    const request = installFakeLocks();
    installFakeAuthApi({ 'POST /refresh': () => granted('jwt'), 'GET /me': meOk });
    const controller = newController();

    controller.ensureRestored();
    await flush();

    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[0]).toBe('omr-auth-refresh');
  });

  it('dos pestañas renuevan una tras otra, nunca a la vez, y cada una con su token', async () => {
    installFakeLocks();
    const first = deferred<Response>();
    const api = installFakeAuthApi({
      'POST /refresh': [() => first.promise, () => granted('jwt-b')],
      'GET /me': meOk,
    });
    const tabA = newController();
    const tabB = newController();

    tabA.ensureRestored();
    tabB.ensureRestored();
    await flush();
    expect(api.count('POST /refresh')).toBe(1);

    first.resolve(granted('jwt-a'));
    await flush();

    expect(api.count('POST /refresh')).toBe(2);
    expect(api.calls.filter((call) => call.route === 'GET /me').map((call) => call.headers.authorization).sort()).toEqual([
      'Bearer jwt-a',
      'Bearer jwt-b',
    ]);
    expect(tabA.getSnapshot().estado).toBe('autenticada');
    expect(tabB.getSnapshot().estado).toBe('autenticada');
  });

  it('sin Web Locks ni BroadcastChannel, la sesión funciona igual', async () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    expect('locks' in navigator).toBe(false);
    const api = installFakeAuthApi({ 'POST /refresh': () => granted('jwt'), 'GET /me': meOk, 'POST /logout': noContent });
    const controller = newController();

    controller.ensureRestored();
    await flush();
    expect(controller.getSnapshot().estado).toBe('autenticada');

    await controller.logout();

    expect(controller.getSnapshot()).toEqual({ estado: 'anonima', motivo: 'cierre-de-sesion' });
    expect(api.count('POST /logout')).toBe(1);
  });

  it('no programa temporizadores de renovación (DEC-04)', async () => {
    installFakeAuthApi({ 'POST /refresh': () => granted('jwt'), 'GET /me': meOk });
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const controller = newController();

    controller.ensureRestored();
    await flush();

    expect(controller.getSnapshot().estado).toBe('autenticada');
    // El único temporizador es el de `flush`, propio de la prueba.
    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).not.toHaveBeenCalled();
    setTimeoutSpy.mockRestore();
    setIntervalSpy.mockRestore();
  });
});

describe('Inicio de sesión', () => {
  it('guarda el token y consulta /me sin renovar', async () => {
    const api = installFakeAuthApi({ 'POST /login': () => granted('jwt-login'), 'GET /me': meOk });
    const controller = newController();

    await controller.login({ correo: 'c', password: 'p' });

    expect(controller.getSnapshot()).toEqual({ estado: 'autenticada', usuario: USER });
    expect(api.routes()).toEqual(['POST /login', 'GET /me']);
    expect(api.calls[1]?.headers.authorization).toBe('Bearer jwt-login');
  });

  it.each(['credenciales-invalidas', 'desafio-requerido'])('el rechazo %s se propaga sin renovar ni cambiar el estado', async (kind) => {
    const api = installFakeAuthApi({ 'POST /login': () => problem(401, kind) });
    const controller = newController();
    const before = controller.getSnapshot();

    await expect(controller.login({ correo: 'c', password: 'p' })).rejects.toMatchObject({ kind });

    expect(controller.getSnapshot()).toBe(before);
    expect(api.routes()).toEqual(['POST /login']);
  });

  it('una restauración antigua no pisa el inicio de sesión', async () => {
    const pendingRefresh = deferred<Response>();
    installFakeAuthApi({
      'POST /refresh': () => pendingRefresh.promise,
      'POST /login': () => granted('jwt-login'),
      'GET /me': meOk,
    });
    const controller = newController();
    controller.ensureRestored();
    await flush();

    await controller.login({ correo: 'c', password: 'p' });
    pendingRefresh.resolve(problem(401, 'no-autenticado'));
    await flush();

    expect(controller.getSnapshot()).toEqual({ estado: 'autenticada', usuario: USER });
  });
});

describe('Cierre de sesión (plan §2.4)', () => {
  async function authenticated(extra: Parameters<typeof installFakeAuthApi>[0]) {
    const api = installFakeAuthApi({ 'POST /login': () => granted('jwt'), 'GET /me': meOk, ...extra });
    const controller = newController();
    await controller.login({ correo: 'c', password: 'p' });
    return { api, controller };
  }

  it('204 → anónima, y avisa a otras pestañas sin datos', async () => {
    const { controller } = await authenticated({ 'POST /logout': noContent });

    await controller.logout();

    expect(controller.getSnapshot()).toEqual({ estado: 'anonima', motivo: 'cierre-de-sesion' });
    expect(FakeChannel.posted).toEqual([{ tipo: 'logout' }]);
  });

  it('con JWT vencido renueva y luego cierra', async () => {
    const { api, controller } = await authenticated({
      'POST /logout': [() => problem(401, 'no-autenticado'), noContent],
      'POST /refresh': () => granted('jwt-2'),
    });

    await controller.logout();

    expect(api.routes().slice(-3)).toEqual(['POST /logout', 'POST /refresh', 'POST /logout']);
    expect(api.calls.at(-1)?.headers.authorization).toBe('Bearer jwt-2');
    expect(controller.getSnapshot()).toEqual({ estado: 'anonima', motivo: 'cierre-de-sesion' });
    expect(FakeChannel.posted).toEqual([{ tipo: 'logout' }]);
  });

  it('si la renovación da 401, la sesión ya no existe: limpia el estado sin avisar', async () => {
    const { controller } = await authenticated({
      'POST /logout': () => problem(401, 'no-autenticado'),
      'POST /refresh': () => problem(401, 'no-autenticado'),
    });

    await expect(controller.logout()).resolves.toBeUndefined();

    expect(controller.getSnapshot()).toEqual({ estado: 'anonima', motivo: 'cierre-de-sesion' });
    expect(FakeChannel.posted).toEqual([]);
  });

  it('un fallo de red no afirma que se cerró: sigue autenticada y rechaza', async () => {
    const { controller } = await authenticated({});

    await expect(controller.logout()).rejects.toMatchObject({ kind: 'red' });

    expect(controller.getSnapshot().estado).toBe('autenticada');
    expect(FakeChannel.posted).toEqual([]);
  });

  it('tras un fallo se puede reintentar con el mismo token', async () => {
    const { api, controller } = await authenticated({ 'POST /logout': [() => problem(503, 'servicio-saturado'), noContent] });

    await expect(controller.logout()).rejects.toMatchObject({ kind: 'servicio-saturado' });
    await controller.logout();

    expect(controller.getSnapshot().estado).toBe('anonima');
    expect(api.count('POST /refresh')).toBe(0);
  });

  it('403 al cerrar → limpia el estado local, sin reintentos', async () => {
    const { api, controller } = await authenticated({ 'POST /logout': () => problem(403, 'acceso-denegado') });

    await controller.logout();

    expect(controller.getSnapshot()).toEqual({ estado: 'anonima', motivo: 'cuenta-no-habilitada' });
    expect(api.count('POST /logout')).toBe(1);
  });

  it('tras cerrar, el token ya no se usa: una nueva operación renueva', async () => {
    const { api, controller } = await authenticated({
      'POST /logout': [noContent, () => problem(401, 'no-autenticado')],
      'POST /refresh': () => problem(401, 'no-autenticado'),
    });

    await controller.logout();
    await controller.logout();

    expect(api.routes().slice(-1)).toEqual(['POST /refresh']);
  });
});

describe('Aviso entre pestañas (RN-12)', () => {
  it('el cierre en una pestaña limpia la otra, sin solicitudes', async () => {
    const api = installFakeAuthApi({ 'POST /refresh': () => granted('jwt'), 'GET /me': meOk, 'POST /logout': noContent });
    const tabA = newController();
    const tabB = newController();
    tabA.ensureRestored();
    tabB.ensureRestored();
    await flush();
    const callsBefore = api.calls.length;

    await tabA.logout();

    expect(tabB.getSnapshot()).toEqual({ estado: 'anonima', motivo: 'cierre-de-sesion' });
    expect(api.calls.length).toBe(callsBefore + 1);
  });

  it('usa el canal omr-auth y nunca transmite el token ni datos de la cuenta', async () => {
    installFakeAuthApi({ 'POST /login': () => granted('jwt-secreto'), 'GET /me': meOk, 'POST /logout': noContent });
    const controller = newController();
    await controller.login({ correo: 'c', password: 'p' });

    await controller.logout();

    expect(FakeChannel.instances[0]?.name).toBe('omr-auth');
    const posted = JSON.stringify(FakeChannel.posted);
    expect(posted).toBe('[{"tipo":"logout"}]');
  });

  it('ignora mensajes con otro formato', async () => {
    installFakeAuthApi({ 'POST /refresh': () => granted('jwt'), 'GET /me': meOk });
    const controller = newController();
    controller.ensureRestored();
    await flush();
    const sender = new FakeChannel('omr-auth');

    sender.postMessage({ tipo: 'otro' });
    sender.postMessage('logout');
    sender.postMessage(null);

    expect(controller.getSnapshot().estado).toBe('autenticada');
  });

  it('un aviso recibido durante la restauración gana a su resultado', async () => {
    const pendingRefresh = deferred<Response>();
    installFakeAuthApi({ 'POST /refresh': () => pendingRefresh.promise, 'GET /me': meOk });
    const controller = newController();
    controller.ensureRestored();
    await flush();

    new FakeChannel('omr-auth').postMessage({ tipo: 'logout' });
    pendingRefresh.resolve(granted('jwt-tardio'));
    await flush();

    expect(controller.getSnapshot()).toEqual({ estado: 'anonima', motivo: 'cierre-de-sesion' });
  });
});

describe('Token solo en memoria (RN-02)', () => {
  it('no aparece en el estado publicado, en la interfaz pública ni en los almacenes', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    installFakeAuthApi({ 'POST /login': () => granted('jwt-secreto'), 'GET /me': meOk });
    const controller = newController();

    await controller.login({ correo: 'c', password: 'contrasena-secreta' });

    expect(JSON.stringify(controller.getSnapshot())).not.toContain('jwt-secreto');
    expect(Object.keys(controller)).not.toEqual(expect.arrayContaining(['accessToken', 'current', 'renew']));
    expect(setItem).not.toHaveBeenCalled();
    expect(document.cookie).toBe('');
    setItem.mockRestore();
  });
});

describe('Suscripción', () => {
  it('avisa los cambios y deja de hacerlo al cancelar', async () => {
    installFakeAuthApi({ 'POST /refresh': () => problem(401, 'no-autenticado') });
    const controller = newController();
    const listener = vi.fn();

    const unsubscribe = controller.subscribe(listener);
    controller.ensureRestored();
    await flush();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    await controller.logout().catch(() => undefined);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
