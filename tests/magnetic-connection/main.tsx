import { createRoot } from 'react-dom/client';
import { ReactFlowProvider } from '@xyflow/react';
import { Demo } from './Demo';

createRoot(document.getElementById('root')!).render(<ReactFlowProvider><Demo /></ReactFlowProvider>);

if (new URLSearchParams(window.location.search).has('check')) {
  void import('../magnetic-connection.test').then(module => module.runMagneticChecks());
}
