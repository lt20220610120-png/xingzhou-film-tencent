import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './v06.css';
import './v07.css';
import './v08.css';
import './v09.css';
import './chat-history.css';
import './v100-exact.css';
import './v100-compat.css';

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
