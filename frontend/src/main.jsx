import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ThemeLanguageProvider } from './context/ThemeLanguageContext.jsx'

// Apply persisted theme, language/direction, and zoom on startup to prevent flashing
const savedTheme = localStorage.getItem("theme") || "light";
document.documentElement.setAttribute("data-theme", savedTheme);

const savedLang = localStorage.getItem("language") || "en";
document.documentElement.setAttribute("lang", savedLang);
document.documentElement.setAttribute("dir", savedLang === "ur" ? "rtl" : "ltr");

const savedZoom = localStorage.getItem("zoomLevel") || "100%";
document.documentElement.style.zoom = savedZoom;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeLanguageProvider>
      <App />
    </ThemeLanguageProvider>
  </StrictMode>,
)
