import React from 'react';
import ReactDOM from 'react-dom/client';
import App, { RenderErrorBoundary } from './App.jsx';
import './styles.css';
import './v06.css';
import './v07.css';
import './v08.css';
import './v09.css';
import './chat-history.css';
import './v100-exact.css';
import './v100-compat.css';
import './account-access.css';
import './canvas.css';
import './collab.css';
import './ocean-theme.css';

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <RenderErrorBoundary><App /></RenderErrorBoundary>
    </React.StrictMode>
  );
}
