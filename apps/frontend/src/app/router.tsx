import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { AuthPage, type AuthFlow } from '../features/auth/components/AuthPage.tsx';
import { RequireAuth } from '../features/auth/session/RequireAuth.tsx';
import type { Role } from '../features/auth/api/types.ts';
import { AppShell } from '../features/navigation/AppShell.tsx';
import { ROLES_EDICION_CLAVES, ROLES_LECTURA_CLAVES, ROLES_USUARIOS } from '../features/navigation/permissions.ts';
import { RequireRole } from '../features/navigation/RequireRole.tsx';
import { APP_ROUTES, APP_SCREEN_TITLES, ROUTES, SCREEN_TITLES, type ScreenKey } from './routes.ts';

const SCREEN_FLOWS: Readonly<Record<ScreenKey, AuthFlow>> = {
  iniciarSesion: 'acceso',
  inicio: 'acceso',
  registro: 'registro',
  revisaTuCorreo: 'registro',
  reenviarVerificacion: 'registro',
  verificarCorreo: 'registro',
  olvideContrasena: 'recuperacion',
  restablecerContrasena: 'recuperacion',
  activarCuenta: 'activacion',
};

// Carga diferida por pantalla (plan §13).
const LoginPage = lazy(() => import('../features/auth/pages/LoginPage.tsx').then((module) => ({ default: module.LoginPage })));
const HomePage = lazy(() => import('../features/auth/pages/HomePage.tsx').then((module) => ({ default: module.HomePage })));
const RegisterPage = lazy(() =>
  import('../features/auth/pages/RegisterPage.tsx').then((module) => ({ default: module.RegisterPage })),
);
const CheckEmailPage = lazy(() =>
  import('../features/auth/pages/CheckEmailPage.tsx').then((module) => ({ default: module.CheckEmailPage })),
);
const ResendVerificationPage = lazy(() =>
  import('../features/auth/pages/ResendVerificationPage.tsx').then((module) => ({ default: module.ResendVerificationPage })),
);
const VerifyEmailPage = lazy(() =>
  import('../features/auth/pages/VerifyEmailPage.tsx').then((module) => ({ default: module.VerifyEmailPage })),
);
const ForgotPasswordPage = lazy(() =>
  import('../features/auth/pages/ForgotPasswordPage.tsx').then((module) => ({ default: module.ForgotPasswordPage })),
);
const ResetPasswordPage = lazy(() =>
  import('../features/auth/pages/ResetPasswordPage.tsx').then((module) => ({ default: module.ResetPasswordPage })),
);
const ActivateAccountPage = lazy(() =>
  import('../features/auth/pages/ActivateAccountPage.tsx').then((module) => ({ default: module.ActivateAccountPage })),
);

// Pantallas privadas de HT-AUTH-03 (plan §2.1), también con carga diferida.
const UsersPage = lazy(() => import('../features/admin-users/UsersPage.tsx').then((module) => ({ default: module.UsersPage })));
const AnswerKeysListPage = lazy(() =>
  import('../features/answer-keys/AnswerKeysListPage.tsx').then((module) => ({ default: module.AnswerKeysListPage })),
);
const AnswerKeyEditorRoute = lazy(() =>
  import('../features/answer-keys/AnswerKeyEditorPage.tsx').then((module) => ({ default: module.AnswerKeyEditorRoute })),
);

type AppScreenKey = keyof typeof APP_ROUTES;

const APP_SCREENS: Readonly<Record<AppScreenKey, { element: ReactNode; roles: readonly Role[] }>> = {
  usuarios: { element: <UsersPage />, roles: ROLES_USUARIOS },
  claves: { element: <AnswerKeysListPage />, roles: ROLES_LECTURA_CLAVES },
  claveNueva: { element: <AnswerKeyEditorRoute />, roles: ROLES_EDICION_CLAVES },
  claveDetalle: { element: <AnswerKeyEditorRoute />, roles: ROLES_LECTURA_CLAVES },
};

const APP_SCREEN_KEYS = Object.keys(APP_ROUTES) as AppScreenKey[];

const SCREENS: Readonly<Record<ScreenKey, ReactNode>> = {
  iniciarSesion: <LoginPage />,
  inicio: <HomePage />,
  registro: <RegisterPage />,
  revisaTuCorreo: <CheckEmailPage />,
  reenviarVerificacion: <ResendVerificationPage />,
  verificarCorreo: <VerifyEmailPage />,
  olvideContrasena: <ForgotPasswordPage />,
  restablecerContrasena: <ResetPasswordPage />,
  activarCuenta: <ActivateAccountPage />,
};

const SCREEN_KEYS = Object.keys(ROUTES) as ScreenKey[];

function isPrivate(key: ScreenKey): boolean {
  return key === 'inicio';
}

/**
 * El título de la pantalla se muestra mientras carga su código. `RequireAuth` va por fuera de la carga diferida:
 * el código de una ruta privada no se pide sin sesión.
 */
export function AppRoutes() {
  return (
    <Routes>
      {SCREEN_KEYS.map((key) => {
        // `/inicio` ya vive dentro de `AppShell` (HT-AUTH-03 DEC-09); las demás conservan la plantilla de autenticación.
        const placeholder = isPrivate(key) ? (
          <AppShell title={SCREEN_TITLES[key]} />
        ) : (
          <AuthPage flow={SCREEN_FLOWS[key]} title={SCREEN_TITLES[key]} />
        );
        const screen = <Suspense fallback={placeholder}>{SCREENS[key]}</Suspense>;
        return (
          <Route key={key} path={ROUTES[key]} element={isPrivate(key) ? <RequireAuth>{screen}</RequireAuth> : screen} />
        );
      })}
      {APP_SCREEN_KEYS.map((key) => {
        const { element, roles } = APP_SCREENS[key];
        const placeholder = <AppShell title={APP_SCREEN_TITLES[key]} />;
        return (
          <Route
            key={key}
            path={APP_ROUTES[key]}
            element={
              <RequireAuth>
                <RequireRole roles={roles}>
                  <Suspense fallback={placeholder}>{element}</Suspense>
                </RequireRole>
              </RequireAuth>
            }
          />
        );
      })}
      <Route path="*" element={<Navigate to={ROUTES.inicio} replace />} />
    </Routes>
  );
}
