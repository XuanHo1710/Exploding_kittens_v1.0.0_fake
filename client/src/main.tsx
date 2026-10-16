import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const Demo = lazy(() => import('./Demo'));
const isDemo = import.meta.env.DEV && new URLSearchParams(location.search).has('demo');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isDemo ? (
      <Suspense>
        <Demo />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
