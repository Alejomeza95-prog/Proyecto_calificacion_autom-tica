import { useCallback, useId, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { APP_ROUTES, APP_SCREEN_TITLES, clavePath } from '../../app/routes.ts';
import { ApiError, isApiError } from '../auth/api/problem.ts';
import { StatusMessage } from '../auth/components/StatusMessage.tsx';
import { useResultFocus } from '../auth/forms/use-result-focus.ts';
import { useSession } from '../auth/session/session-context.ts';
import { AppShell } from '../navigation/AppShell.tsx';
import page from '../navigation/page.module.css';
import { hasRole, ROLES_EDICION_CLAVES } from '../navigation/permissions.ts';
import { genericErrorMessage, useLoad } from '../navigation/use-load.ts';
import { answeredBeyond, joinNumbers, missingQuestions, parseQuestionCount, resize } from './answer-key-rules.ts';
import {
  createClave,
  createPrueba,
  ESTADO_LABELS,
  getClave,
  listClaves,
  listPruebas,
  MATERIA_LABELS,
  MATERIAS,
  MAX_PREGUNTAS,
  MIN_PREGUNTAS,
  publishClave,
  SESION_LABELS,
  SESIONES,
  updateClave,
  type Clave,
  type Materia,
  type RespuestaClave,
  type Sesion,
} from './answer-keys-api.ts';
import { AnswerGrid } from './AnswerGrid.tsx';
import { formatDay } from './format.ts';

type Message = { readonly tone: 'success' | 'error' | 'info'; readonly text: string; readonly existingId?: string };

interface Identity {
  pruebaId: string;
  fecha: string;
  sesion: Sesion | '';
  materia: Materia | '';
}

const EMPTY_IDENTITY: Identity = { pruebaId: '', fecha: '', sesion: '', materia: '' };

function saveErrorMessage(error: ApiError): string {
  switch (error.kind) {
    case 'conflicto':
      return 'Otra persona guardó cambios en esta clave después de que la abriste, o ya fue publicada. Recarga para ver la versión actual antes de guardar.';
    case 'solicitud-invalida':
      return 'Revisa los datos: las respuestas solo admiten A, B, C o D y la cantidad de preguntas va de 1 a 100.';
    case 'clave-incompleta':
      return `Faltan respuestas en las preguntas ${joinNumbers(error.missingQuestions)}.`;
    default:
      return genericErrorMessage(error);
  }
}

/** Formulario mínimo para agregar una prueba al catálogo de la institución (DEC-04). */
function AddPrueba({ onCreated }: { readonly onCreated: (id: string) => void }) {
  const { request } = useSession();
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inputId = useId();

  async function handleAdd() {
    if (pending) return;
    if (nombre.trim() === '') {
      setError('Escribe el nombre de la prueba.');
      return;
    }
    setPending(true);
    try {
      const prueba = await createPrueba(request, nombre.trim());
      setNombre('');
      setError(null);
      onCreated(prueba.id);
    } catch (caught) {
      setError(isApiError(caught, 'conflicto') ? 'Ya existe una prueba con ese nombre.' : isApiError(caught) ? genericErrorMessage(caught) : 'No pudimos agregar la prueba.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={page.field} style={{ minWidth: '16rem' }}>
      <label className={page.label} htmlFor={inputId}>
        ¿No está la prueba? Agrégala
      </label>
      <div className={page.actions}>
        <input
          id={inputId}
          className={page.input}
          value={nombre}
          maxLength={200}
          aria-invalid={error ? true : undefined}
          onChange={(e) => setNombre(e.target.value)}
        />
        <button type="button" className={page.buttonSecondary} aria-disabled={pending ? true : undefined} onClick={() => void handleAdd()}>
          {pending ? 'Agregando…' : 'Agregar prueba'}
        </button>
      </div>
      {error && <StatusMessage tone="error">{error}</StatusMessage>}
    </div>
  );
}

/**
 * Monta un editor nuevo por clave: al pasar de `/claves/nueva` a `/claves/:id` (o entre dos claves) el estado del
 * formulario y el aviso de `location.state` se inicializan otra vez. Sin la `key`, React reutilizaría la instancia
 * porque ambas rutas renderizan el mismo componente en la misma posición.
 */
export function AnswerKeyEditorRoute() {
  const { id } = useParams();
  return <AnswerKeyEditorPage key={id ?? 'nueva'} />;
}

/**
 * Editor de la clave (HT-AUTH-03 CA-06..CA-10). Sin `:id` crea un Borrador; con `:id` edita un Borrador (con la
 * versión leída, RN-14) o muestra una clave Publicada en solo consulta (RN-11).
 */
export function AnswerKeyEditorPage() {
  const { id } = useParams();
  const isNew = id === undefined;
  const { session, request } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const rol = session.estado === 'autenticada' ? session.usuario.rol : null;
  const canEdit = hasRole(rol, ROLES_EDICION_CLAVES);

  const loadPruebas = useCallback(() => listPruebas(request), [request]);
  const { state: pruebas, reload: reloadPruebas } = useLoad(loadPruebas);
  const loadExisting = useCallback(() => (id === undefined ? Promise.resolve(null) : getClave(request, id)), [request, id]);
  const { state: existing, reload: reloadExisting } = useLoad(loadExisting);

  const [identity, setIdentity] = useState<Identity>(EMPTY_IDENTITY);
  const [countText, setCountText] = useState('');
  const [respuestas, setRespuestas] = useState<RespuestaClave[]>([]);
  const [clave, setClave] = useState<Clave | null>(null);
  const [dirty, setDirty] = useState(false);
  const [highlighted, setHighlighted] = useState<number[]>([]);
  const [message, setMessage] = useState<Message | null>(() => {
    const aviso = (location.state as { aviso?: unknown } | null)?.aviso;
    return typeof aviso === 'string' ? { tone: 'success', text: aviso } : null;
  });
  const [pending, setPending] = useState(false);
  const [invalid, setInvalid] = useState<ReadonlySet<string>>(new Set());
  const messageRef = useResultFocus<HTMLDivElement>(message);
  const ids = { prueba: useId(), fecha: useId(), sesion: useId(), materia: useId(), count: useId(), hint: useId() };

  // Al cargar o recargar una clave existente, el formulario toma la versión del servidor (ajuste de estado
  // durante el render, con guarda: https://react.dev/learn/you-might-not-need-an-effect).
  const [syncedFrom, setSyncedFrom] = useState<Clave | null>(null);
  if (existing.estado === 'listo' && existing.data !== null && existing.data !== syncedFrom) {
    const loaded = existing.data;
    setSyncedFrom(loaded);
    setClave(loaded);
    setCountText(String(loaded.cantidadPreguntas));
    setRespuestas([...loaded.respuestas]);
    setDirty(false);
    setHighlighted([]);
  }

  const readOnly = !canEdit || (clave !== null && clave.estado === 'PUBLICADA');
  const title = isNew ? APP_SCREEN_TITLES.claveNueva : APP_SCREEN_TITLES.claveDetalle;

  function setAnswer(index: number, value: RespuestaClave) {
    setRespuestas((current) => current.map((r, i) => (i === index ? value : r)));
    setHighlighted((current) => current.filter((n) => n !== index + 1));
    setDirty(true);
  }

  // RN-08: la grilla sigue a la cantidad; si se perderían respuestas, se confirma al salir del campo.
  function handleCountChange(text: string) {
    setCountText(text);
    const n = parseQuestionCount(text);
    if (n !== null && answeredBeyond(respuestas, n).length === 0) {
      setRespuestas((current) => resize(current, n));
      setDirty(true);
    }
  }

  function handleCountBlur() {
    const n = parseQuestionCount(countText);
    if (n === null || n === respuestas.length) return;
    const lost = answeredBeyond(respuestas, n);
    if (lost.length > 0 && !window.confirm(`Se descartarán las respuestas de las preguntas ${joinNumbers(lost)}. ¿Continuar?`)) {
      setCountText(String(respuestas.length));
      return;
    }
    setRespuestas((current) => resize(current, n));
    setHighlighted((current) => current.filter((q) => q <= n));
    setDirty(true);
  }

  function validateForm(): number | null {
    const problems = new Set<string>();
    if (isNew) {
      if (identity.pruebaId === '') problems.add('prueba');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(identity.fecha)) problems.add('fecha');
      if (identity.sesion === '') problems.add('sesion');
      if (identity.materia === '') problems.add('materia');
    }
    const n = parseQuestionCount(countText);
    if (n === null || n !== respuestas.length) problems.add('cantidad');
    setInvalid(problems);
    if (problems.size > 0) {
      setMessage({ tone: 'error', text: 'Completa los campos marcados. La cantidad de preguntas va de 1 a 100.' });
      return null;
    }
    return n;
  }

  async function findExisting(): Promise<string | undefined> {
    if (identity.sesion === '' || identity.materia === '') return undefined;
    try {
      const found = await listClaves(request, {
        pruebaId: identity.pruebaId,
        fecha: identity.fecha,
        sesion: identity.sesion,
        materia: identity.materia,
      });
      return found.items[0]?.id;
    } catch {
      return undefined;
    }
  }

  /** Guarda y devuelve la clave guardada, o `null` si falló (el mensaje ya quedó en pantalla). */
  async function save(): Promise<Clave | null> {
    const n = validateForm();
    if (n === null) return null;
    try {
      if (isNew) {
        if (identity.sesion === '' || identity.materia === '') return null;
        return await createClave(request, {
          pruebaId: identity.pruebaId,
          fecha: identity.fecha,
          sesion: identity.sesion,
          materia: identity.materia,
          cantidadPreguntas: n,
          respuestas,
        });
      }
      if (!clave) return null;
      const saved = await updateClave(request, clave.id, { version: clave.version, cantidadPreguntas: n, respuestas });
      setClave(saved);
      setDirty(false);
      return saved;
    } catch (caught) {
      const error = isApiError(caught) ? caught : new ApiError('desconocido');
      if (isNew && error.kind === 'conflicto') {
        const existingId = await findExisting();
        setMessage({ tone: 'error', text: 'Ya existe una clave para esta prueba, fecha, sesión y materia.', ...(existingId ? { existingId } : {}) });
      } else if (isNew && error.kind === 'no-encontrado') {
        setMessage({ tone: 'error', text: 'La prueba seleccionada ya no está disponible para tu institución.' });
      } else {
        setMessage({ tone: 'error', text: saveErrorMessage(error) });
      }
      return null;
    }
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (pending || readOnly) return;
    setPending(true);
    setMessage(null);
    const saved = await save();
    setPending(false);
    if (!saved) return;
    if (isNew) navigate(clavePath(saved.id), { replace: true, state: { aviso: 'Borrador guardado. Puedes seguir editándolo o publicarlo.' } });
    else setMessage({ tone: 'success', text: 'Cambios guardados.' });
  }

  async function handlePublish() {
    if (pending || readOnly) return;
    const faltantes = missingQuestions(respuestas);
    if (respuestas.length === 0 || faltantes.length > 0) {
      setHighlighted(faltantes);
      setMessage({
        tone: 'error',
        text: respuestas.length === 0 ? 'Indica la cantidad de preguntas.' : `Para publicar, responde las preguntas ${joinNumbers(faltantes)}.`,
      });
      return;
    }
    setPending(true);
    setMessage(null);
    const saved = isNew || dirty ? await save() : clave;
    if (!saved) {
      setPending(false);
      return;
    }
    try {
      const published = await publishClave(request, saved.id, saved.version);
      if (isNew) {
        navigate(clavePath(published.id), { replace: true, state: { aviso: 'Clave publicada.' } });
        return;
      }
      setClave(published);
      setDirty(false);
      setMessage({ tone: 'success', text: 'Clave publicada. A partir de ahora es de solo consulta.' });
    } catch (caught) {
      const error = isApiError(caught) ? caught : new ApiError('desconocido');
      if (error.kind === 'clave-incompleta') setHighlighted([...error.missingQuestions]);
      if (isNew) {
        // El borrador sí se creó: se abre para corregirlo.
        navigate(clavePath(saved.id), { replace: true, state: { aviso: `Borrador guardado, pero no se publicó. ${saveErrorMessage(error)}` } });
        return;
      }
      setMessage({ tone: 'error', text: saveErrorMessage(error) });
    } finally {
      setPending(false);
    }
  }

  function handleReload() {
    setMessage(null);
    reloadExisting();
  }

  const fieldInvalid = (key: string) => (invalid.has(key) ? true : undefined);

  if (!isNew && existing.estado === 'cargando') {
    return (
      <AppShell title={title}>
        <p className={page.empty}>Cargando la clave…</p>
      </AppShell>
    );
  }
  if (!isNew && existing.estado === 'error') {
    return (
      <AppShell title={title}>
        <div className={page.statusGap}>
          <StatusMessage tone="error">{genericErrorMessage(existing.error)}</StatusMessage>
        </div>
        <p style={{ marginTop: 'var(--step-2)' }}>
          <Link className={page.link} to={APP_ROUTES.claves}>
            Volver a las claves de respuesta
          </Link>
        </p>
      </AppShell>
    );
  }

  const description = clave
    ? `${clave.pruebaNombre ?? 'Prueba'} · ${formatDay(clave.fecha)} · ${SESION_LABELS[clave.sesion]} · ${MATERIA_LABELS[clave.materia]}`
    : 'Selecciona la prueba, la fecha, la sesión y la materia, e indica cuántas preguntas tiene.';

  return (
    <AppShell title={title} description={description}>
      <p style={{ marginTop: 'var(--step-2)' }}>
        <Link className={page.link} to={APP_ROUTES.claves}>
          ← Volver a las claves de respuesta
        </Link>
      </p>

      {message && (
        <div className={page.statusGap}>
          <StatusMessage ref={messageRef} tone={message.tone}>
            {message.text}
            {message.existingId && (
              <>
                {' '}
                <Link className={page.link} to={clavePath(message.existingId)}>
                  Abrir la clave existente
                </Link>
              </>
            )}
            {!isNew && message.tone === 'error' && message.text.startsWith('Otra persona') && (
              <>
                {' '}
                <button type="button" className={page.buttonSecondary} onClick={handleReload}>
                  Recargar
                </button>
              </>
            )}
          </StatusMessage>
        </div>
      )}

      {clave && (
        <p className={page.statusGap}>
          <span className={page.badge} data-estado={clave.estado}>
            {ESTADO_LABELS[clave.estado]}
          </span>{' '}
          {clave.estado === 'PUBLICADA' && clave.publicadaEn && (
            <span className={page.muted}>
              Publicada el {new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(clave.publicadaEn))}. Las claves publicadas no se pueden modificar.
            </span>
          )}
          {clave.estado === 'BORRADOR' && !canEdit && <span className={page.muted}>Solo consulta.</span>}
        </p>
      )}

      <form className={page.panel} onSubmit={(e) => void handleSave(e)} noValidate aria-label="Clave de respuesta">
        {isNew && (
          <div className={page.filters}>
            <div className={page.field}>
              <label className={page.label} htmlFor={ids.prueba}>
                Nombre de la prueba
              </label>
              <select
                id={ids.prueba}
                className={page.select}
                value={identity.pruebaId}
                aria-invalid={fieldInvalid('prueba')}
                disabled={pruebas.estado !== 'listo'}
                onChange={(e) => setIdentity({ ...identity, pruebaId: e.target.value })}
              >
                <option value="">{pruebas.estado === 'cargando' ? 'Cargando…' : 'Selecciona una prueba'}</option>
                {pruebas.estado === 'listo' &&
                  pruebas.data.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
              </select>
            </div>
            <div className={page.field}>
              <label className={page.label} htmlFor={ids.fecha}>
                Fecha
              </label>
              <input
                id={ids.fecha}
                type="date"
                className={page.input}
                value={identity.fecha}
                aria-invalid={fieldInvalid('fecha')}
                onChange={(e) => setIdentity({ ...identity, fecha: e.target.value })}
              />
            </div>
            <div className={page.field}>
              <label className={page.label} htmlFor={ids.sesion}>
                Sesión
              </label>
              <select
                id={ids.sesion}
                className={page.select}
                value={identity.sesion}
                aria-invalid={fieldInvalid('sesion')}
                onChange={(e) => setIdentity({ ...identity, sesion: e.target.value as Sesion | '' })}
              >
                <option value="">Selecciona</option>
                {SESIONES.map((s) => (
                  <option key={s} value={s}>
                    {SESION_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className={page.field}>
              <label className={page.label} htmlFor={ids.materia}>
                Materia
              </label>
              <select
                id={ids.materia}
                className={page.select}
                value={identity.materia}
                aria-invalid={fieldInvalid('materia')}
                onChange={(e) => setIdentity({ ...identity, materia: e.target.value as Materia | '' })}
              >
                <option value="">Selecciona</option>
                {MATERIAS.map((m) => (
                  <option key={m} value={m}>
                    {MATERIA_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
            {canEdit && (
              <AddPrueba
                onCreated={(pruebaId) => {
                  setIdentity((current) => ({ ...current, pruebaId }));
                  reloadPruebas();
                }}
              />
            )}
          </div>
        )}

        <div className={page.field} style={{ marginTop: isNew ? 'var(--step-3)' : 0, maxWidth: '16rem' }}>
          <label className={page.label} htmlFor={ids.count}>
            Cantidad de preguntas
          </label>
          <input
            id={ids.count}
            type="number"
            inputMode="numeric"
            min={MIN_PREGUNTAS}
            max={MAX_PREGUNTAS}
            className={page.input}
            value={countText}
            readOnly={readOnly}
            aria-describedby={ids.hint}
            aria-invalid={fieldInvalid('cantidad')}
            onChange={(e) => handleCountChange(e.target.value)}
            onBlur={handleCountBlur}
          />
          <span id={ids.hint} className={page.muted} style={{ fontSize: '0.875rem' }}>
            De {MIN_PREGUNTAS} a {MAX_PREGUNTAS}. Cada respuesta es A, B, C o D.
          </span>
        </div>

        {respuestas.length > 0 ? (
          <AnswerGrid respuestas={respuestas} highlighted={highlighted} readOnly={readOnly} onChange={setAnswer} />
        ) : (
          <p className={page.empty}>Indica la cantidad de preguntas para generar la grilla.</p>
        )}

        {respuestas.length > 0 && (
          <p className={page.muted} style={{ marginTop: 'var(--step-2)' }} aria-live="polite">
            {respuestas.length - missingQuestions(respuestas).length} de {respuestas.length} preguntas respondidas.
          </p>
        )}

        {!readOnly && (
          <div className={page.actions} style={{ marginTop: 'var(--step-3)' }}>
            <button type="submit" className={page.buttonSecondary} aria-disabled={pending ? true : undefined}>
              {pending ? 'Guardando…' : 'Guardar borrador'}
            </button>
            <button type="button" className={page.button} aria-disabled={pending ? true : undefined} onClick={() => void handlePublish()}>
              Publicar
            </button>
          </div>
        )}
      </form>
    </AppShell>
  );
}
