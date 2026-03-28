import { CHART_RANGE_OPTIONS } from "./reportConstants.js";

export const SETTINGS_STORAGE_KEY = "daily-todo-settings";

export const defaultSettings = {
  v: 1,
  report: {
    defaultRangeDays: CHART_RANGE_OPTIONS[0],
  },
  completion: {
    enabled: true,
    particles: true,
    partyConfetti: true,
    sound: true,
    toast: true,
    showSessionClears: true,
  },
  daily: {
    showCreatedTimestamp: true,
  },
  sections: {
    habitsAndStreaks: true,
    goals: true,
    bulkImport: true,
  },
};

function deepMerge(base, patch) {
  if (patch == null || typeof patch !== "object" || Array.isArray(patch)) return base;
  const out = { ...base };
  for (const k of Object.keys(patch)) {
    const pv = patch[k];
    const bv = base[k];
    if (pv != null && typeof pv === "object" && !Array.isArray(pv) && typeof bv === "object" && bv != null && !Array.isArray(bv)) {
      out[k] = deepMerge(bv, pv);
    } else if (pv !== undefined) {
      out[k] = pv;
    }
  }
  return out;
}

export function mergeWithDefaults(parsed) {
  return deepMerge(defaultSettings, parsed && typeof parsed === "object" ? parsed : {});
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return mergeWithDefaults({});
    const parsed = JSON.parse(raw);
    if (
      parsed.completion &&
      parsed.completion.partyConfetti === undefined &&
      typeof parsed.completion.screenCrack === "boolean"
    ) {
      parsed.completion.partyConfetti = parsed.completion.screenCrack;
    }
    return mergeWithDefaults(parsed);
  } catch {
    return mergeWithDefaults({});
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}
