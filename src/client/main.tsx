import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';

// Schriften aus dem Designsystem, selbst ausgeliefert (keine Anfragen an Google)
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import '@fontsource-variable/jost';
import './styles.css';

import GuestApp from './components/GuestApp';

// Musiker-Bereich und Danke-Seite werden nur bei Bedarf geladen – die Gäste-Seite bleibt klein.
const AdminApp = lazy(() => import('./admin/AdminApp'));
const ThanksPage = lazy(() => import('./components/ThanksPage'));

/** Drei Seiten, kein Router nötig: der Pfad entscheidet. */
function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/admin') {
    document.title = 'Musiker-Bereich · Songwunsch';
    return <AdminApp />;
  }
  if (path === '/danke') {
    document.title = 'Danke · Simon Weichert';
    return <ThanksPage />;
  }
  return <GuestApp />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>
      <App />
    </Suspense>
  </StrictMode>,
);
