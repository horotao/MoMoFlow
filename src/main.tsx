import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';

import './index.css';
import './nodes/SunburstNode.css';
import './nodes/PainterNode.css';
import './nodes/PreviewNode.css';
import './nodes/CropNode.css';
import './nodes/ColorCorrectionNode.css';
import './nodes/BlurNode.css';
import './nodes/LevelsNode.css';
import './nodes/InvertNode.css';
import './nodes/RotateFlipNode.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
