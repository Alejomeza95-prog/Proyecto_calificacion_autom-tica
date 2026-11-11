import { BrowserRouter } from 'react-router';
import { AppRoutes } from './app/router.tsx';
import { SessionProvider } from './features/auth/session/SessionProvider.tsx';

/** Raíz de la aplicación. */
export function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <AppRoutes />
      </SessionProvider>
    </BrowserRouter>
  );
}
