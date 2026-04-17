import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// Fix for Amazon Chime SDK: "ReferenceError: global is not defined"
if (typeof (window as any).global === 'undefined') {
  (window as any).global = window;
}

import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
