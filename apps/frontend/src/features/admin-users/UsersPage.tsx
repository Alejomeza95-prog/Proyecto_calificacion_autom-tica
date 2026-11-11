import { useCallback, useId, useState, type FormEvent } from 'react';
import { APP_SCREEN_TITLES } from '../../app/routes.ts';
import type { ApiError } from '../auth/api/problem.ts';
import { StatusMessage } from '../auth/components/StatusMessage.tsx';
import { useApiAction } from '../auth/forms/use-api-action.ts';
import { useResultFocus } from '../auth/forms/use-result-focus.ts';
import { useSession } from '../auth/session/session-context.ts';
import { AppShell } from '../navigation/AppShell.tsx';
import page from '../navigation/page.module.css';
import { ROLE_LABELS } from '../navigation/role-labels.ts';
import { genericErrorMessage, useLoad } from '../navigation/use-load.ts';
import {
  approveAccount,
  APPROVABLE_ROLES,
  listInstitutions,
  listPending,
  type ApprovableRole,
  type PendingAccount,
} from './admin-users-api.ts';

const dateFormat = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' });

function approvalErrorMessage(error: ApiError): string {
  switch (error.kind) {
    case 'conflicto':
      return 'Esta cuenta ya no está pendiente: otra persona la aprobó o cambió su estado. Actualizamos la lista.';
    case 'solicitud-invalida':
      return 'Revisa el rol y la institución: la institución debe existir y estar vigente.';
    default:
      return genericErrorMessage(error);
  }
}

interface ApprovalFormProps {
  readonly account: PendingAccount;
  readonly onDone: (result: { ok: true; nombre: string } | { ok: false; error: ApiError }) => void;
  readonly onCancel: () => void;
}

function ApprovalForm({ account, onDone, onCancel }: ApprovalFormProps) {
  const { request } = useSession();
  const loadInstitutions = useCallback(() => listInstitutions(request), [request]);
  const { state } = useLoad(loadInstitutions);
  const [rol, setRol] = useState<ApprovableRole | ''>('');
  const [institucionId, setInstitucionId] = useState('');
  const [missing, setMissing] = useState(false);
  const { pending, run } = useApiAction();
  const ids = { rol: useId(), inst: useId(), title: useId() };

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (rol === '' || institucionId === '') {
      setMissing(true);
      return;
    }
    const result = await run(() => approveAccount(request, account.id, { rol, institucionId }));
    if (result.ok) onDone({ ok: true, nombre: account.nombre });
    else if (result.error) onDone({ ok: false, error: result.error });
  }

  return (
    <form className={page.panel} onSubmit={(e) => void handleSubmit(e)} aria-labelledby={ids.title} noValidate>
      <h2 id={ids.title} style={{ margin: 0, fontSize: '1.125rem' }}>
        Aprobar a {account.nombre}
      </h2>
      <p className={page.muted}>Asigna el rol y la institución. La cuenta quedará activa y podrá iniciar sesión.</p>
      {state.estado === 'error' && (
        <div className={page.statusGap}>
          <StatusMessage tone="error">No pudimos cargar las instituciones. {genericErrorMessage(state.error)}</StatusMessage>
        </div>
      )}
      <div className={page.filters} style={{ marginTop: 'var(--step-2)' }}>
        <div className={page.field}>
          <label className={page.label} htmlFor={ids.rol}>
            Rol
          </label>
          <select
            id={ids.rol}
            className={page.select}
            value={rol}
            aria-invalid={missing && rol === '' ? true : undefined}
            onChange={(e) => setRol(e.target.value as ApprovableRole | '')}
          >
            <option value="">Selecciona un rol</option>
            {APPROVABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <div className={page.field}>
          <label className={page.label} htmlFor={ids.inst}>
            Institución
          </label>
          <select
            id={ids.inst}
            className={page.select}
            value={institucionId}
            disabled={state.estado !== 'listo'}
            aria-invalid={missing && institucionId === '' ? true : undefined}
            onChange={(e) => setInstitucionId(e.target.value)}
          >
            <option value="">{state.estado === 'cargando' ? 'Cargando…' : 'Selecciona una institución'}</option>
            {state.estado === 'listo' &&
              state.data.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.nombre}
                </option>
              ))}
          </select>
        </div>
      </div>
      {missing && (rol === '' || institucionId === '') && (
        <div className={page.statusGap}>
          <StatusMessage tone="error">Selecciona el rol y la institución.</StatusMessage>
        </div>
      )}
      <div className={page.actions} style={{ marginTop: 'var(--step-3)' }}>
        <button type="submit" className={page.button} aria-disabled={pending ? true : undefined}>
          {pending ? 'Aprobando…' : 'Confirmar aprobación'}
        </button>
        <button type="button" className={page.buttonSecondary} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Panel de usuarios (HT-AUTH-03 CA-01..CA-03): cuentas pendientes y aprobación. Solo ADMIN (`RequireRole`). */
export function UsersPage() {
  const { request } = useSession();
  const load = useCallback(() => listPending(request), [request]);
  const { state, reload } = useLoad(load);
  const [selected, setSelected] = useState<PendingAccount | null>(null);
  const [result, setResult] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const resultRef = useResultFocus<HTMLDivElement>(result);

  function handleDone(outcome: { ok: true; nombre: string } | { ok: false; error: ApiError }) {
    if (outcome.ok) {
      setResult({ tone: 'success', text: `Cuenta aprobada: ${outcome.nombre} ya puede iniciar sesión.` });
      setSelected(null);
      reload();
      return;
    }
    setResult({ tone: 'error', text: approvalErrorMessage(outcome.error) });
    if (outcome.error.kind === 'conflicto' || outcome.error.kind === 'no-encontrado') {
      setSelected(null);
      reload();
    }
  }

  return (
    <AppShell title={APP_SCREEN_TITLES.usuarios} description="Cuentas con el correo verificado que esperan aprobación.">
      {result && (
        <div className={page.statusGap}>
          <StatusMessage ref={resultRef} tone={result.tone}>
            {result.text}
          </StatusMessage>
        </div>
      )}

      {selected && (
        <ApprovalForm
          key={selected.id}
          account={selected}
          onDone={handleDone}
          onCancel={() => setSelected(null)}
        />
      )}

      <section className={page.panel} aria-labelledby="pendientes-titulo">
        <h2 id="pendientes-titulo" style={{ margin: 0, fontSize: '1.125rem' }}>
          Pendientes de aprobación
        </h2>
        {state.estado === 'cargando' && <p className={page.empty}>Cargando cuentas…</p>}
        {state.estado === 'error' && (
          <div className={page.statusGap}>
            <StatusMessage tone="error">{genericErrorMessage(state.error)}</StatusMessage>
            <button type="button" className={page.buttonSecondary} style={{ marginTop: 'var(--step-2)' }} onClick={reload}>
              Reintentar
            </button>
          </div>
        )}
        {state.estado === 'listo' && state.data.items.length === 0 && (
          <p className={page.empty}>No hay cuentas pendientes de aprobación.</p>
        )}
        {state.estado === 'listo' && state.data.items.length > 0 && (
          <div className={page.tableWrap}>
            <table className={page.table}>
              <thead>
                <tr>
                  <th scope="col">Nombre</th>
                  <th scope="col">Correo</th>
                  <th scope="col">Registro</th>
                  <th scope="col">
                    <span className="visually-hidden">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.data.items.map((account) => (
                  <tr key={account.id}>
                    <td>{account.nombre}</td>
                    <td>{account.correo}</td>
                    <td>{dateFormat.format(new Date(account.registradoEn))}</td>
                    <td>
                      <button
                        type="button"
                        className={page.buttonSecondary}
                        aria-label={`Aprobar a ${account.nombre}`}
                        onClick={() => {
                          setResult(null);
                          setSelected(account);
                        }}
                      >
                        Aprobar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {state.data.total > state.data.items.length && (
              <p className={page.muted} style={{ marginTop: 'var(--step-1)' }}>
                Se muestran {state.data.items.length} de {state.data.total} cuentas, las más antiguas primero.
              </p>
            )}
          </div>
        )}
      </section>
    </AppShell>
  );
}
