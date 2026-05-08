import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import '@xyflow/react/dist/style.css'
import App from './App.tsx'
import { NovaThemeProvider } from './contexts/ThemeContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NovaThemeProvider>
      <App />
    </NovaThemeProvider>
  </StrictMode>,
)
