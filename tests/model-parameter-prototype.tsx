import { MotionConfig } from 'motion/react';
import { createRoot } from 'react-dom/client';
import { ModelParameterPrototype } from './ModelParameterPrototype';

createRoot(document.getElementById('root')!).render(<MotionConfig reducedMotion="user"><ModelParameterPrototype /></MotionConfig>);
