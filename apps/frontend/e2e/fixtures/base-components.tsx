import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import '../../src/app/global.css';
import type { AuthFlow } from '../../src/features/auth/components/AuthPage.tsx';
import { BaseComponentsFixture } from './BaseComponentsFixture.tsx';

const params = new URLSearchParams(window.location.search);
const root = document.getElementById('root');

if (root) {
  createRoot(root).render(
    <BrowserRouter>
      <BaseComponentsFixture flow={(params.get('flow') ?? 'acceso') as AuthFlow} pending={params.has('pending')} />
    </BrowserRouter>,
  );
}
