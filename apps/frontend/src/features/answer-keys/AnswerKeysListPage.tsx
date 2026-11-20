import { useCallback, useId, useState } from 'react';
import { Link } from 'react-router';
import { APP_ROUTES, APP_SCREEN_TITLES, clavePath } from '../../app/routes.ts';
import { StatusMessage } from '../auth/components/StatusMessage.tsx';
import { useResultFocus } from '../auth/forms/use-result-focus.ts';
import { isApiError } from '../auth/api/problem.ts';
import { useSession } from '../auth/session/session-context.ts';
import { AppShell } from '../navigation/AppShell.tsx';
import page from '../navigation/page.module.css';
import { hasRole, ROLES_EDICION_CLAVES } from '../navigation/permissions.ts';
import { genericErrorMessage, useLoad } from '../navigation/use-load.ts';
import {
  deleteClave,
  ESTADO_LABELS,
  ESTADOS_CLAVE,
  listClaves,
  listPruebas,
  MATERIA_LABELS,
  MATERIAS,
  SESION_LABELS,
  SESIONES,
  type ClaveFilters,
  type ClaveResumen,
  type EstadoClave,
  type Materia,
  type Sesion,
} from './answer-keys-api.ts';
import { formatDay } from './format.ts';

/**
 * Listado de claves con filtros por prueba, fecha, sesión, materia y estado (HT-AUTH-03 CA-11, T-35) y eliminación
 * de borradores (CA-12, RN-12).
 */
export function AnswerKeysListPage() {
  const { session, request } = useSession();
  const rol = session.estado === 'autenticada' ? session.usuario.rol : null;
  const canEdit = hasRole(rol, ROLES_EDICION_CLAVES);
  const [filters, setFilters] = useState<ClaveFilters>({});
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const messageRef = useResultFocus<HTMLDivElement>(message);
  const ids = { prueba: useId(), fecha: useId(), sesion: useId(), materia: useId(), estado: useId() };

  const loadPruebas = useCallback(() => listPruebas(request), [request]);
  const pruebas = useLoad(loadPruebas).state;
  const loadClaves = useCallback(() => listClaves(request, filters), [request, filters]);
  const { state, reload } = useLoad(loadClaves);

  async function handleDelete(clave: ClaveResumen) {
    const label = `${clave.pruebaNombre ?? 'la prueba'} · ${MATERIA_LABELS[clave.materia]} · ${SESION_LABELS[clave.sesion]}`;
    if (!window.confirm(`¿Eliminar el borrador de ${label}? Esta acción no se puede deshacer.`)) return;
    try {
      await deleteClave(request, clave.id, clave.version);
      setMessage({ tone: 'success', text: `Borrador eliminado: ${label}.` });
    } catch (error) {
      const text = isApiError(error, 'conflicto')
        ? 'La clave cambió o ya fue publicada; no se eliminó. Revisa la lista actualizada.'
        : isApiError(error)
          ? genericErrorMessage(error)
          : 'No pudimos eliminar la clave.';
      setMessage({ tone: 'error', text });
    }
    reload();
  }

  function setFilter<K extends keyof ClaveFilters>(key: K, value: ClaveFilters[K] | '') {
    setFilters((current) => {
      const next = { ...current };
      if (value === '' || value === undefined) delete next[key];
      else next[key] = value;
      return next;
    });
  }

  return (
    <AppShell
      title={APP_SCREEN_TITLES.claves}
      description="Claves por prueba, fecha, sesión y materia. Un borrador se puede editar; una clave publicada es de solo consulta."
    >
      {message && (
        <div className={page.statusGap}>
          <StatusMessage ref={messageRef} tone={message.tone}>
            {message.text}
          </StatusMessage>
        </div>
      )}

      <section className={page.panel} aria-label="Filtros y acciones">
        <div className={page.toolbar}>
          <div className={page.filters}>
            <div className={page.field}>
              <label className={page.label} htmlFor={ids.prueba}>
                Prueba
              </label>
              <select
                id={ids.prueba}
                className={page.select}
                value={filters.pruebaId ?? ''}
                onChange={(e) => setFilter('pruebaId', e.target.value)}
              >
                <option value="">Todas</option>
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
                value={filters.fecha ?? ''}
                onChange={(e) => setFilter('fecha', e.target.value)}
              />
            </div>
            <div className={page.field}>
              <label className={page.label} htmlFor={ids.sesion}>
                Sesión
              </label>
              <select
                id={ids.sesion}
                className={page.select}
                value={filters.sesion ?? ''}
                onChange={(e) => setFilter('sesion', e.target.value as Sesion | '')}
              >
                <option value="">Todas</option>
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
                value={filters.materia ?? ''}
                onChange={(e) => setFilter('materia', e.target.value as Materia | '')}
              >
                <option value="">Todas</option>
                {MATERIAS.map((m) => (
                  <option key={m} value={m}>
                    {MATERIA_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
            <div className={page.field}>
              <label className={page.label} htmlFor={ids.estado}>
                Estado
              </label>
              <select
                id={ids.estado}
                className={page.select}
                value={filters.estado ?? ''}
                onChange={(e) => setFilter('estado', e.target.value as EstadoClave | '')}
              >
                <option value="">Todos</option>
                {ESTADOS_CLAVE.map((s) => (
                  <option key={s} value={s}>
                    {ESTADO_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {canEdit && (
            <Link className={page.button} to={APP_ROUTES.claveNueva}>
              Nueva clave
            </Link>
          )}
        </div>

        {state.estado === 'cargando' && <p className={page.empty}>Cargando claves…</p>}
        {state.estado === 'error' && (
          <div className={page.statusGap}>
            <StatusMessage tone="error">{genericErrorMessage(state.error)}</StatusMessage>
          </div>
        )}
        {state.estado === 'listo' && state.data.items.length === 0 && (
          <p className={page.empty}>No hay claves con estos filtros.</p>
        )}
        {state.estado === 'listo' && state.data.items.length > 0 && (
          <div className={page.tableWrap}>
            <table className={page.table}>
              <caption className="visually-hidden">Claves de respuesta</caption>
              <thead>
                <tr>
                  <th scope="col">Prueba</th>
                  <th scope="col">Fecha</th>
                  <th scope="col">Sesión</th>
                  <th scope="col">Materia</th>
                  <th scope="col">Respondidas</th>
                  <th scope="col">Estado</th>
                  <th scope="col">
                    <span className="visually-hidden">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.data.items.map((clave) => {
                  const editable = canEdit && clave.estado === 'BORRADOR';
                  const name = `${clave.pruebaNombre ?? 'Prueba'} ${MATERIA_LABELS[clave.materia]} ${SESION_LABELS[clave.sesion]}`;
                  return (
                    <tr key={clave.id}>
                      <td>{clave.pruebaNombre ?? '—'}</td>
                      <td>{formatDay(clave.fecha)}</td>
                      <td>{SESION_LABELS[clave.sesion]}</td>
                      <td>{MATERIA_LABELS[clave.materia]}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {clave.respondidas} de {clave.cantidadPreguntas}
                      </td>
                      <td>
                        <span className={page.badge} data-estado={clave.estado}>
                          {ESTADO_LABELS[clave.estado]}
                        </span>
                      </td>
                      <td>
                        <div className={page.actions}>
                          <Link className={page.buttonSecondary} to={clavePath(clave.id)} aria-label={`${editable ? 'Editar' : 'Ver'} ${name}`}>
                            {editable ? 'Editar' : 'Ver'}
                          </Link>
                          {editable && (
                            <button
                              type="button"
                              className={page.buttonDanger}
                              aria-label={`Eliminar ${name}`}
                              onClick={() => void handleDelete(clave)}
                            >
                              Eliminar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
