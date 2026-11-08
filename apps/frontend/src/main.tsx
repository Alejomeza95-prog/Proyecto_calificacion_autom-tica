import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './app/global.css';
import { captureLinkToken, reloadOnLinkOpenedInPlace } from './features/auth/link-token/capture.ts';

// Antes de renderizar: la URL con el token no debe llegar a React ni al enrutador (RN-06).
captureLinkToken();
reloadOnLinkOpenedInPlace();

const container = document.getElementById('root');
if (!container) {
  throw new Error('No se encontró el elemento #root en index.html');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
