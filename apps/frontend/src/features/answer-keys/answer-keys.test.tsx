import { configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES, clavePath } from '../../app/routes.ts';
import { ApiError, problemFromResponse } from '../auth/api/problem.ts';
import { json, noContent, problem } from '../../test/fake-auth-api.ts';
import { currentRoute, disposeControllers, renderApp } from '../../test/render-app.tsx';
import { answeredBeyond, joinNumbers, missingQuestions, parseQuestionCount, resize } from './answer-key-rules.ts';
import { MATERIAS, MAX_PREGUNTAS, OPCIONES_CLAVE, SESIONES, type Clave } from './answer-keys-api.ts';
import { AnswerGrid } from './AnswerGrid.tsx';

// La primera carga diferida de cada pantalla puede tardar más de 1 s en una máquina cargada.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  disposeControllers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const PRUEBA = { id: '66a000000000000000000001', nombre: 'Simulacro 1', institucionId: '65f000000000000000000002' };
const ID = '66b000000000000000000001';
const clave = (extra: Partial<Clave> = {}): Clave => ({
  id: ID,
  pruebaId: PRUEBA.id,
  pruebaNombre: PRUEBA.nombre,
  institucionId: PRUEBA.institucionId,
  fecha: '2026-11-11',
  sesion: 'SESION_1',
  materia: 'MAT',
  cantidadPreguntas: 3,
  respondidas: 2,
  respuestas: ['A', null, 'C'],
  estado: 'BORRADOR',
  version: 0,
  publicadaEn: null,
  actualizadoEn: '2026-11-11T12:00:00.000Z',
  ...extra,
});
const PRUEBAS = { 'GET /api/v1/pruebas': () => json(200, [PRUEBA]) };

// HT-AUTH-03 T-10 espejo y T-30 (RN-06, RN-08, RN-09, RN-10).
describe('reglas y catálogos del frontend', () => {
  it('catálogos coinciden con el backend', () => {
    expect([...MATERIAS]).toEqual(['MAT', 'CN', 'CC', 'LC', 'ING']);
    expect([...OPCIONES_CLAVE]).toEqual(['A', 'B', 'C', 'D']);
    expect([...SESIONES]).toEqual(['SESION_1', 'SESION_2']);
    expect(MAX_PREGUNTAS).toBe(100);
  });

  it('resize, faltantes, respuestas que se perderían y cantidad válida', () => {
    expect(resize(['A', 'B', 'C'], 2)).toEqual(['A', 'B']);
    expect(resize(['A'], 3)).toEqual(['A', null, null]);
    expect(missingQuestions(['A', null, 'C', null])).toEqual([2, 4]);
    expect(answeredBeyond(['A', null, 'C', 'D'], 2)).toEqual([3, 4]);
    expect(parseQuestionCount('25')).toBe(25);
    expect([parseQuestionCount('0'), parseQuestionCount('101'), parseQuestionCount('2.5'), parseQuestionCount('')]).toEqual([
      null,
      null,
      null,
      null,
    ]);
    expect(joinNumbers([2, 5, 7])).toBe('2, 5 y 7');
  });

  it('problem+json: clave-incompleta conserva preguntasFaltantes', async () => {
    const response = new Response(
      JSON.stringify({ type: 'urn:omr-preicfes:problema:clave-incompleta', title: 't', status: 422, preguntasFaltantes: [2, 4] }),
      { status: 422, headers: { 'Content-Type': 'application/problem+json' } },
    );
    const error = await problemFromResponse(response);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.kind).toBe('clave-incompleta');
    expect(error.missingQuestions).toEqual([2, 4]);
  });
});

describe('AnswerGrid (CA-06, CA-07)', () => {
  it('genera N filas numeradas con solo las opciones A, B, C y D', () => {
    render(<AnswerGrid respuestas={[null, 'B', null, null, null]} onChange={() => undefined} />);
    const rows = screen.getAllByRole('group');
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => within(r).getAllByRole('radio').map((i) => (i as HTMLInputElement).value))).toEqual(
      Array(5).fill(['A', 'B', 'C', 'D']),
    );
    expect(within(rows[1] as HTMLElement).getByRole('radio', { name: 'B' })).toBeChecked();
    expect(screen.getByRole('group', { name: 'Pregunta 5' })).toBeInTheDocument();
  });

  it('marca y borra respuestas; en solo lectura no se puede cambiar', () => {
    const onChange = vi.fn();
    const { rerender } = render(<AnswerGrid respuestas={['A', null]} onChange={onChange} />);
    fireEvent.click(within(screen.getByRole('group', { name: 'Pregunta 2' })).getByRole('radio', { name: 'D' }));
    expect(onChange).toHaveBeenCalledWith(1, 'D');
    fireEvent.click(screen.getByRole('button', { name: 'Borrar la respuesta de la pregunta 1' }));
    expect(onChange).toHaveBeenCalledWith(0, null);
    rerender(<AnswerGrid respuestas={['A', 'B']} readOnly />);
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Borrar/ })).not.toBeInTheDocument();
  });
});

describe('listado de claves (CA-11, CA-12)', () => {
  const LIST = 'GET /api/v1/claves-respuesta?limite=100';

  it('muestra prueba, sesión, materia, avance y estado; DOCENTE solo ve «Ver»', async () => {
    renderApp(APP_ROUTES.claves, 'DOCENTE', { ...PRUEBAS, [LIST]: () => json(200, { items: [clave()], total: 1 }) });
    const table = await screen.findByRole('table', { name: 'Claves de respuesta' });
    expect(within(table).getByText('Matemáticas')).toBeInTheDocument();
    expect(within(table).getByText('2 de 3')).toBeInTheDocument();
    expect(within(table).getByText('Borrador')).toBeInTheDocument();
    expect(within(table).getByRole('link', { name: /^Ver / })).toBeInTheDocument();
    expect(within(table).queryByRole('button', { name: /Eliminar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nueva clave' })).not.toBeInTheDocument();
  });

  it('filtra por materia y estado en la consulta', async () => {
    const fake = renderApp(APP_ROUTES.claves, 'COORDINADOR', {
      ...PRUEBAS,
      [LIST]: () => json(200, { items: [], total: 0 }),
      'GET /api/v1/claves-respuesta?materia=ING&limite=100': () => json(200, { items: [], total: 0 }),
      'GET /api/v1/claves-respuesta?materia=ING&estado=PUBLICADA&limite=100': () => json(200, { items: [], total: 0 }),
    });
    await screen.findByText('No hay claves con estos filtros.');
    fireEvent.change(screen.getByLabelText('Materia'), { target: { value: 'ING' } });
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'PUBLICADA' } });
    await waitFor(() => expect(fake.count('GET /api/v1/claves-respuesta?materia=ING&estado=PUBLICADA&limite=100')).toBe(1));
  });

  it('CA-12: elimina un borrador tras confirmar, con la versión leída', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fake = renderApp(APP_ROUTES.claves, 'COORDINADOR', {
      ...PRUEBAS,
      [LIST]: [() => json(200, { items: [clave({ version: 3 })], total: 1 }), () => json(200, { items: [], total: 0 })],
      [`DELETE /api/v1/claves-respuesta/${ID}?version=3`]: () => noContent(),
    });
    fireEvent.click(await screen.findByRole('button', { name: /^Eliminar / }));
    expect(await screen.findByText(/Borrador eliminado/)).toBeInTheDocument();
    expect(fake.count(`DELETE /api/v1/claves-respuesta/${ID}?version=3`)).toBe(1);
  });

  it('CA-12: sin confirmar no se elimina; una PUBLICADA no ofrece eliminar', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const fake = renderApp(APP_ROUTES.claves, 'COORDINADOR', {
      ...PRUEBAS,
      [LIST]: () => json(200, { items: [clave(), clave({ id: '66b000000000000000000002', materia: 'CN', estado: 'PUBLICADA' })], total: 2 }),
    });
    const buttons = await screen.findAllByRole('button', { name: /^Eliminar / });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0] as HTMLElement);
    expect(fake.routes().some((r) => r.startsWith('DELETE'))).toBe(false);
  });
});

describe('editor de claves (CA-06..CA-10)', () => {
  async function fillIdentity() {
    await waitFor(() => expect(screen.getByLabelText('Nombre de la prueba')).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Nombre de la prueba'), { target: { value: PRUEBA.id } });
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-11-11' } });
    fireEvent.change(screen.getByLabelText('Sesión'), { target: { value: 'SESION_1' } });
    fireEvent.change(screen.getByLabelText('Materia'), { target: { value: 'MAT' } });
  }

  it('CA-06: la cantidad genera la grilla y guardar crea un BORRADOR', async () => {
    const fake = renderApp(APP_ROUTES.claveNueva, 'COORDINADOR', {
      ...PRUEBAS,
      'POST /api/v1/claves-respuesta': () => json(201, clave({ respuestas: ['A', null, null], respondidas: 1 })),
      [`GET /api/v1/claves-respuesta/${ID}`]: () => json(200, clave({ respuestas: ['A', null, null], respondidas: 1 })),
    });
    await fillIdentity();
    expect(screen.getByText('Indica la cantidad de preguntas para generar la grilla.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Cantidad de preguntas'), { target: { value: '3' } });
    expect(screen.getAllByRole('group', { name: /^Pregunta / })).toHaveLength(3);
    fireEvent.click(within(screen.getByRole('group', { name: 'Pregunta 1' })).getByRole('radio', { name: 'A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));

    expect(await screen.findByText(/Borrador guardado/)).toBeInTheDocument();
    expect(currentRoute()).toBe(clavePath(ID));
    const body: unknown = JSON.parse(fake.calls.find((c) => c.route === 'POST /api/v1/claves-respuesta')?.rawBody ?? '{}');
    expect(body).toEqual({
      pruebaId: PRUEBA.id,
      fecha: '2026-11-11',
      sesion: 'SESION_1',
      materia: 'MAT',
      cantidadPreguntas: 3,
      respuestas: ['A', null, null],
    });
  });

  describe('CA-06: agregar una prueba al catálogo (DEC-04, DEC-06)', () => {
    const NUEVA = { id: '66a000000000000000000009', nombre: 'Simulacro nuevo', institucionId: '65f000000000000000000003' };
    const INSTITUCIONES = {
      'GET /api/v1/instituciones': () =>
        json(200, [
          { id: '65f000000000000000000002', nombre: 'Institución A' },
          { id: NUEVA.institucionId, nombre: 'Institución B' },
        ]),
    };

    it('el ADMIN elige la institución, la prueba se crea con institucionId y queda seleccionada', async () => {
      const fake = renderApp(APP_ROUTES.claveNueva, 'ADMIN', {
        ...INSTITUCIONES,
        'GET /api/v1/pruebas': [() => json(200, [PRUEBA]), () => json(200, [PRUEBA, NUEVA])],
        'POST /api/v1/pruebas': () => json(201, NUEVA),
      });
      const institucion = await screen.findByLabelText('Institución de la prueba nueva');
      await waitFor(() => expect(institucion).toBeEnabled());
      fireEvent.change(screen.getByLabelText('¿No está la prueba? Agrégala'), { target: { value: '  Simulacro nuevo ' } });

      // Sin institución no se envía nada.
      fireEvent.click(screen.getByRole('button', { name: 'Agregar prueba' }));
      expect(await screen.findByText('Selecciona la institución a la que pertenece la prueba.')).toBeInTheDocument();
      expect(fake.count('POST /api/v1/pruebas')).toBe(0);

      fireEvent.change(institucion, { target: { value: NUEVA.institucionId } });
      fireEvent.click(screen.getByRole('button', { name: 'Agregar prueba' }));
      await waitFor(() => expect(screen.getByLabelText('Nombre de la prueba')).toHaveValue(NUEVA.id));
      expect(screen.getByRole('option', { name: 'Simulacro nuevo · Institución B' })).toBeInTheDocument();
      const body: unknown = JSON.parse(fake.calls.find((c) => c.route === 'POST /api/v1/pruebas')?.rawBody ?? '{}');
      expect(body).toEqual({ nombre: 'Simulacro nuevo', institucionId: NUEVA.institucionId });
    });

    it('con una sola institución, queda preseleccionada y se envía sin tocar el selector', async () => {
      const fake = renderApp(APP_ROUTES.claveNueva, 'ADMIN', {
        'GET /api/v1/instituciones': () => json(200, [{ id: NUEVA.institucionId, nombre: 'Institución Educativa Demo' }]),
        'GET /api/v1/pruebas': [() => json(200, []), () => json(200, [NUEVA])],
        'POST /api/v1/pruebas': () => json(201, NUEVA),
      });
      const institucion = await screen.findByLabelText('Institución de la prueba nueva');
      await waitFor(() => expect(institucion).toHaveValue(NUEVA.institucionId));
      fireEvent.change(screen.getByLabelText('¿No está la prueba? Agrégala'), { target: { value: 'Simulacro nuevo' } });
      fireEvent.click(screen.getByRole('button', { name: 'Agregar prueba' }));
      await waitFor(() => expect(screen.getByLabelText('Nombre de la prueba')).toHaveValue(NUEVA.id));
      const body: unknown = JSON.parse(fake.calls.find((c) => c.route === 'POST /api/v1/pruebas')?.rawBody ?? '{}');
      expect(body).toEqual({ nombre: 'Simulacro nuevo', institucionId: NUEVA.institucionId });
    });

    it('sin instituciones registradas, explica por qué no se puede agregar la prueba', async () => {
      renderApp(APP_ROUTES.claveNueva, 'ADMIN', { 'GET /api/v1/instituciones': () => json(200, []), ...PRUEBAS });
      expect(await screen.findByText(/No hay instituciones registradas/)).toBeInTheDocument();
    });

    it('el COORDINADOR no ve el selector de institución ni consulta /instituciones', async () => {
      const fake = renderApp(APP_ROUTES.claveNueva, 'COORDINADOR', {
        'GET /api/v1/pruebas': [() => json(200, [PRUEBA]), () => json(200, [PRUEBA, NUEVA])],
        'POST /api/v1/pruebas': () => json(201, NUEVA),
      });
      await waitFor(() => expect(screen.getByLabelText('Nombre de la prueba')).toBeEnabled());
      expect(screen.queryByLabelText('Institución de la prueba nueva')).not.toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('¿No está la prueba? Agrégala'), { target: { value: 'Simulacro nuevo' } });
      fireEvent.click(screen.getByRole('button', { name: 'Agregar prueba' }));
      await waitFor(() => expect(screen.getByLabelText('Nombre de la prueba')).toHaveValue(NUEVA.id));
      const body: unknown = JSON.parse(fake.calls.find((c) => c.route === 'POST /api/v1/pruebas')?.rawBody ?? '{}');
      expect(body).toEqual({ nombre: 'Simulacro nuevo' });
      expect(fake.count('GET /api/v1/instituciones')).toBe(0);
    });

    it('los errores del servidor se muestran con un mensaje descriptivo', async () => {
      renderApp(APP_ROUTES.claveNueva, 'ADMIN', {
        ...INSTITUCIONES,
        ...PRUEBAS,
        'POST /api/v1/pruebas': [
          () => problem(400, 'solicitud-invalida', { errores: [{ campo: 'institucionId', reglas: ['institucionVigente'] }] }),
          () => problem(409, 'conflicto'),
        ],
      });
      const institucion = await screen.findByLabelText('Institución de la prueba nueva');
      await waitFor(() => expect(institucion).toBeEnabled());
      fireEvent.change(institucion, { target: { value: NUEVA.institucionId } });
      fireEvent.change(screen.getByLabelText('¿No está la prueba? Agrégala'), { target: { value: 'Simulacro 1' } });
      fireEvent.click(screen.getByRole('button', { name: 'Agregar prueba' }));
      expect(await screen.findByText('Selecciona una institución activa para la prueba.')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Agregar prueba' }));
      expect(await screen.findByText('Esa institución ya tiene una prueba con ese nombre.')).toBeInTheDocument();
    });
  });

  it('CA-07: cantidad fuera de rango o campos vacíos no se envían', async () => {
    const fake = renderApp(APP_ROUTES.claveNueva, 'COORDINADOR', PRUEBAS);
    await waitFor(() => expect(screen.getByLabelText('Nombre de la prueba')).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Cantidad de preguntas'), { target: { value: '101' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Completa los campos marcados');
    expect(screen.getByLabelText('Cantidad de preguntas')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Materia')).toHaveAttribute('aria-invalid', 'true');
    expect(fake.routes().some((r) => r.startsWith('POST /api/v1/claves-respuesta'))).toBe(false);
  });

  it('CA-08: duplicado avisa y ofrece abrir la clave existente', async () => {
    renderApp(APP_ROUTES.claveNueva, 'COORDINADOR', {
      ...PRUEBAS,
      'POST /api/v1/claves-respuesta': () => problem(409, 'conflicto'),
      [`GET /api/v1/claves-respuesta?pruebaId=${PRUEBA.id}&fecha=2026-11-11&sesion=SESION_1&materia=MAT&limite=100`]: () =>
        json(200, { items: [clave()], total: 1 }),
    });
    await fillIdentity();
    fireEvent.change(screen.getByLabelText('Cantidad de preguntas'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    expect(await screen.findByText('Ya existe una clave para esta prueba, fecha, sesión y materia.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir la clave existente' })).toHaveAttribute('href', clavePath(ID));
  });

  it('CA-06: reducir la cantidad pide confirmar si se pierden respuestas', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderApp(clavePath(ID), 'COORDINADOR', { [`GET /api/v1/claves-respuesta/${ID}`]: () => json(200, clave()) });
    const count = await screen.findByLabelText('Cantidad de preguntas');
    fireEvent.change(count, { target: { value: '1' } });
    fireEvent.blur(count);
    expect(confirm).toHaveBeenCalledWith('Se descartarán las respuestas de las preguntas 3. ¿Continuar?');
    expect(count).toHaveValue(3);
    expect(screen.getAllByRole('group', { name: /^Pregunta / })).toHaveLength(3);

    confirm.mockReturnValue(true);
    fireEvent.change(count, { target: { value: '1' } });
    fireEvent.blur(count);
    expect(screen.getAllByRole('group', { name: /^Pregunta / })).toHaveLength(1);
  });

  it('CA-09/RN-14: guarda con la versión leída; 409 avisa del conflicto y permite recargar', async () => {
    const PUT = `PUT /api/v1/claves-respuesta/${ID}`;
    const fake = renderApp(clavePath(ID), 'COORDINADOR', {
      [`GET /api/v1/claves-respuesta/${ID}`]: () => json(200, clave({ version: 4 })),
      [PUT]: () => problem(409, 'conflicto'),
    });
    await screen.findByLabelText('Cantidad de preguntas');
    fireEvent.click(within(screen.getByRole('group', { name: 'Pregunta 2' })).getByRole('radio', { name: 'B' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Otra persona guardó cambios');
    expect(JSON.parse(fake.calls.find((c) => c.route === PUT)?.rawBody ?? '{}')).toMatchObject({ version: 4, respuestas: ['A', 'B', 'C'] });
    fireEvent.click(screen.getByRole('button', { name: 'Recargar' }));
    await waitFor(() => expect(fake.count(`GET /api/v1/claves-respuesta/${ID}`)).toBe(2));
  });

  it('CA-10: publicar incompleta resalta las faltantes sin llamar a la API', async () => {
    const fake = renderApp(clavePath(ID), 'COORDINADOR', { [`GET /api/v1/claves-respuesta/${ID}`]: () => json(200, clave()) });
    await screen.findByLabelText('Cantidad de preguntas');
    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Para publicar, responde las preguntas 2.');
    expect(screen.getByRole('group', { name: /Pregunta 2/ })).toHaveTextContent('sin respuesta');
    expect(fake.routes().some((r) => r.includes('/publicar'))).toBe(false);
  });

  it('CA-10: completa y sin cambios → publica con la versión; queda en solo consulta', async () => {
    const PUBLISH = `POST /api/v1/claves-respuesta/${ID}/publicar`;
    const fake = renderApp(clavePath(ID), 'COORDINADOR', {
      [`GET /api/v1/claves-respuesta/${ID}`]: () => json(200, clave({ respuestas: ['A', 'B', 'C'], respondidas: 3, version: 2 })),
      [PUBLISH]: () =>
        json(200, clave({ respuestas: ['A', 'B', 'C'], respondidas: 3, version: 3, estado: 'PUBLICADA', publicadaEn: '2026-11-11T13:00:00.000Z' })),
    });
    await screen.findByLabelText('Cantidad de preguntas');
    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    expect(await screen.findByText(/Clave publicada/)).toBeInTheDocument();
    expect(JSON.parse(fake.calls.find((c) => c.route === PUBLISH)?.rawBody ?? '{}')).toEqual({ version: 2 });
    expect(screen.queryByRole('button', { name: 'Guardar borrador' })).not.toBeInTheDocument();
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
  });

  it('CA-10: el servidor rechaza con 422 y se resaltan sus preguntas faltantes', async () => {
    renderApp(clavePath(ID), 'COORDINADOR', {
      [`GET /api/v1/claves-respuesta/${ID}`]: () => json(200, clave({ respuestas: ['A', 'B', 'C'], respondidas: 3 })),
      [`POST /api/v1/claves-respuesta/${ID}/publicar`]: () =>
        new Response(
          JSON.stringify({ type: 'urn:omr-preicfes:problema:clave-incompleta', title: 't', status: 422, preguntasFaltantes: [3] }),
          { status: 422, headers: { 'Content-Type': 'application/problem+json' } },
        ),
    });
    await screen.findByLabelText('Cantidad de preguntas');
    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Faltan respuestas en las preguntas 3.');
    expect(screen.getByRole('group', { name: /Pregunta 3/ })).toHaveTextContent('sin respuesta');
  });

  it('RN-11: una clave PUBLICADA se muestra en solo consulta', async () => {
    renderApp(clavePath(ID), 'ADMIN', {
      [`GET /api/v1/claves-respuesta/${ID}`]: () =>
        json(200, clave({ respuestas: ['A', 'B', 'C'], estado: 'PUBLICADA', publicadaEn: '2026-11-11T13:00:00.000Z' })),
    });
    expect(await screen.findByText(/Las claves publicadas no se pueden modificar/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publicar' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Cantidad de preguntas')).toHaveAttribute('readonly');
  });

  it('otra institución o inexistente → mensaje de no disponible', async () => {
    renderApp(clavePath(ID), 'DOCENTE', { [`GET /api/v1/claves-respuesta/${ID}`]: () => problem(404, 'no-encontrado') });
    expect(await screen.findByRole('alert')).toHaveTextContent('no está disponible para tu institución');
  });
});
