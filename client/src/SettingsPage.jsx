import { useSettings } from "./SettingsContext.jsx";
import { useAppData } from "./AppDataContext.jsx";
import { CHART_RANGE_OPTIONS } from "./reportConstants.js";
import { defaultSettings } from "./settingsStorage.js";
import { ThemeToggle } from "./ThemeToggle.jsx";

function ToggleRow({ id, label, description, checked, onChange, disabled }) {
  return (
    <div className="settings-toggle-row">
      <div className="settings-toggle-text">
        <label htmlFor={id} className="settings-toggle-label">
          {label}
        </label>
        {description ? <p className="settings-toggle-desc">{description}</p> : null}
      </div>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className={`settings-switch ${checked ? "settings-switch-on" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span className="settings-switch-thumb" aria-hidden="true" />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const { settings, updateSettings, resetToDefaults } = useSettings();
  const { reportRangeDays, setReportRangeDays } = useAppData();

  function handleResetAll() {
    resetToDefaults();
    setReportRangeDays(defaultSettings.report.defaultRangeDays);
  }
  const c = settings.completion;
  const subDisabled = !c.enabled;

  return (
    <div className="settings-layout">
      <header className="header header-below-nav">
        <h1 className="page-title">Settings</h1>
        <p className="tagline">Tune reports, celebrations, and what appears on your daily page — stored in this browser only.</p>
      </header>

      <div className="settings-page">
        <section className="panel settings-section" aria-labelledby="settings-appearance">
          <h2 id="settings-appearance" className="settings-section-title">
            Appearance
          </h2>
          <p className="settings-section-desc">Light or dark theme applies everywhere after you log in.</p>
          <div className="settings-theme-row">
            <span className="settings-toggle-label">Theme</span>
            <ThemeToggle />
          </div>
        </section>

        <section className="panel settings-section" aria-labelledby="settings-report">
          <h2 id="settings-report" className="settings-section-title">
            Report
          </h2>
          <p className="settings-section-desc">Default chart range when you open the report page.</p>
          <div className="chart-filter-buttons settings-range-btns" role="group" aria-label="Default report range">
            {CHART_RANGE_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                className={`chart-filter-btn ${settings.report.defaultRangeDays === d ? "active" : ""}`}
                aria-pressed={settings.report.defaultRangeDays === d}
                onClick={() => {
                  updateSettings({ report: { defaultRangeDays: d } });
                  setReportRangeDays(d);
                }}
              >
                Last {d} days
              </button>
            ))}
          </div>
          <p className="hint settings-hint">
            Current session uses <strong>{reportRangeDays}</strong> days (updates when you change it here or on Report).
          </p>
        </section>

        <section className="panel settings-section" aria-labelledby="settings-completion">
          <h2 id="settings-completion" className="settings-section-title">
            Task completion
          </h2>
          <p className="settings-section-desc">Feedback when you check off a task on the daily page.</p>

          <ToggleRow
            id="set-completion-master"
            label="Completion celebrations"
            description="Confetti burst, small particles, optional sound, praise toast, and session counter. Turn off for a minimal, quiet list."
            checked={c.enabled}
            onChange={(v) => updateSettings({ completion: { enabled: v } })}
          />

          <div className={`settings-sub ${subDisabled ? "settings-sub-disabled" : ""}`}>
            <ToggleRow
              id="set-completion-particles"
              label="Particles"
              checked={c.particles}
              disabled={subDisabled}
              onChange={(v) => updateSettings({ completion: { particles: v } })}
            />
            <ToggleRow
              id="set-completion-party-confetti"
              label="Party confetti"
              description="Birthday popper–style burst of colorful confetti from the checkbox (does not block taps)."
              checked={c.partyConfetti}
              disabled={subDisabled}
              onChange={(v) => updateSettings({ completion: { partyConfetti: v } })}
            />
            <ToggleRow
              id="set-completion-sound"
              label="Completion chime"
              checked={c.sound}
              disabled={subDisabled}
              onChange={(v) => updateSettings({ completion: { sound: v } })}
            />
            <ToggleRow
              id="set-completion-toast"
              label="Praise toast"
              checked={c.toast}
              disabled={subDisabled}
              onChange={(v) => updateSettings({ completion: { toast: v } })}
            />
            <ToggleRow
              id="set-completion-hud"
              label="Session “clears” counter"
              description="Small badge in the day header for tasks completed this visit."
              checked={c.showSessionClears}
              disabled={subDisabled}
              onChange={(v) => updateSettings({ completion: { showSessionClears: v } })}
            />
          </div>
        </section>

        <section className="panel settings-section" aria-labelledby="settings-daily">
          <h2 id="settings-daily" className="settings-section-title">
            Daily list
          </h2>
          <ToggleRow
            id="set-daily-saved"
            label="Show “Saved …” timestamps"
            description="When ordering tasks “As in database”, show when each task was created."
            checked={settings.daily.showCreatedTimestamp}
            onChange={(v) => updateSettings({ daily: { showCreatedTimestamp: v } })}
          />
        </section>

        <section className="panel settings-section" aria-labelledby="settings-sections">
          <h2 id="settings-sections" className="settings-section-title">
            Daily page sections
          </h2>
          <p className="settings-section-desc">Hide blocks you do not use — they stay available here if you turn them back on.</p>
          <ToggleRow
            id="set-sec-habits"
            label="Habits &amp; streaks"
            description="Streak cards and default-habit controls above your task list."
            checked={settings.sections.habitsAndStreaks}
            onChange={(v) => updateSettings({ sections: { habitsAndStreaks: v } })}
          />
          <ToggleRow
            id="set-sec-goals"
            label="Weekly / monthly goals"
            checked={settings.sections.goals}
            onChange={(v) => updateSettings({ sections: { goals: v } })}
          />
          <ToggleRow
            id="set-sec-bulk"
            label="Bulk import"
            description="Paste many tasks at once at the bottom of the daily page."
            checked={settings.sections.bulkImport}
            onChange={(v) => updateSettings({ sections: { bulkImport: v } })}
          />
        </section>

        <div className="settings-reset-wrap">
          <button type="button" className="btn ghost" onClick={handleResetAll}>
            Reset all settings to defaults
          </button>
        </div>
      </div>
    </div>
  );
}
