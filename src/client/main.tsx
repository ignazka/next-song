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

// Der Musiker-Bereich wird nur bei Bedarf geladen – die Gäste-Seite bleibt klein.
const AdminApp = lazy(() => import('./admin/AdminApp'));

/** Zwei Seiten, kein Router nötig: der Pfad entscheidet. */
function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/admin') {
    document.title = 'Musiker-Bereich · Songwunsch';
    return <AdminApp />;
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
