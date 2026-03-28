import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { defaultSettings, loadSettings, mergeWithDefaults, saveSettings } from "./settingsStorage.js";

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettingsState] = useState(() => loadSettings());

  const setSettings = useCallback((next) => {
    const merged = mergeWithDefaults(next);
    saveSettings(merged);
    setSettingsState(merged);
  }, []);

  const updateSettings = useCallback((patch) => {
    setSettingsState((prev) => {
      const merged = mergeWithDefaults({
        ...prev,
        ...(patch.report && { report: { ...prev.report, ...patch.report } }),
        ...(patch.completion && { completion: { ...prev.completion, ...patch.completion } }),
        ...(patch.daily && { daily: { ...prev.daily, ...patch.daily } }),
        ...(patch.sections && { sections: { ...prev.sections, ...patch.sections } }),
      });
      saveSettings(merged);
      return merged;
    });
  }, []);

  const resetToDefaults = useCallback(() => {
    saveSettings(defaultSettings);
    setSettingsState({ ...defaultSettings });
  }, []);

  const value = useMemo(
    () => ({ settings, setSettings, updateSettings, resetToDefaults }),
    [settings, setSettings, updateSettings, resetToDefaults]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
