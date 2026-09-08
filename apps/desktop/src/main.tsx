import './index.css';
import { LumenOS } from '@lumen/shell';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// The desktop host: same shell, the Tauri platform bridge is detected at runtime.
document.addEventListener('contextmenu', (e) => e.preventDefault());

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');

createRoot(root).render(
  <StrictMode>
    <LumenOS appVersion={__APP_VERSION__} />
  </StrictMode>,
);
