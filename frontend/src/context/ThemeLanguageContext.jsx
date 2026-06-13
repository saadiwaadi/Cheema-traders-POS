import React, { createContext, useContext, useState, useEffect } from "react";
import enTranslations from "../locales/en.json";
import urTranslations from "../locales/ur.json";

const ThemeLanguageContext = createContext();

const translations = {
  en: enTranslations,
  ur: urTranslations,
};

export function ThemeLanguageProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "light");
  const [language, setLanguage] = useState(() => localStorage.getItem("language") || "en");
  const [zoom, setZoom] = useState(() => localStorage.getItem("zoomLevel") || "100%");

  // Apply theme change
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Apply language and text direction change
  useEffect(() => {
    const dir = language === "ur" ? "rtl" : "ltr";
    document.documentElement.setAttribute("lang", language);
    document.documentElement.setAttribute("dir", dir);
    localStorage.setItem("language", language);
  }, [language]);

  // Apply zoom changes
  useEffect(() => {
    document.body.style.zoom = zoom;
    localStorage.setItem("zoomLevel", zoom);
  }, [zoom]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  const changeLanguage = (lang) => {
    if (lang === "en" || lang === "ur") {
      setLanguage(lang);
    }
  };

  const handleZoomIn = () => {
    const currentVal = parseInt(zoom) || 100;
    if (currentVal < 150) {
      setZoom(`${currentVal + 10}%`);
    }
  };

  const handleZoomOut = () => {
    const currentVal = parseInt(zoom) || 100;
    if (currentVal > 80) {
      setZoom(`${currentVal - 10}%`);
    }
  };

  const handleZoomReset = () => {
    setZoom("100%");
  };

  // Translation helper function t()
  const t = (keyPath, defaultVal) => {
    const keys = keyPath.split(".");
    let current = translations[language];
    for (const key of keys) {
      if (current && current[key] !== undefined) {
        current = current[key];
      } else {
        return defaultVal !== undefined ? defaultVal : keyPath;
      }
    }
    return typeof current === "string" ? current : (defaultVal !== undefined ? defaultVal : keyPath);
  };

  return (
    <ThemeLanguageContext.Provider
      value={{
        theme,
        toggleTheme,
        language,
        changeLanguage,
        zoom,
        handleZoomIn,
        handleZoomOut,
        handleZoomReset,
        t,
      }}
    >
      {children}
    </ThemeLanguageContext.Provider>
  );
}

export function useThemeLanguage() {
  const context = useContext(ThemeLanguageContext);
  if (!context) {
    throw new Error("useThemeLanguage must be used within a ThemeLanguageProvider");
  }
  return context;
}
