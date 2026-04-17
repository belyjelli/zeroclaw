import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App, { ErrorBoundary } from './App';
import { basePath } from './lib/basePath';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Missing #root element');
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      {/* basename is empty in production (SPA at `/`); Vite dev uses `/_app`. Gateway may inject `__ZEROCLAW_BASE__` for path-mounted installs. */}
      <BrowserRouter basename={basePath || undefined}>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
