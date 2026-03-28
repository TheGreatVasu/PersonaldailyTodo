import { useTheme } from "./ThemeContext.jsx";

export function ThemeToggle({ className = "" }) {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === "light";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isLight}
      aria-label={isLight ? "Light theme on. Switch to dark theme." : "Dark theme on. Switch to light theme."}
      title={isLight ? "Light theme — click for dark" : "Dark theme — click for light"}
      className={`theme-switch ${isLight ? "theme-switch--light" : ""} ${className}`.trim()}
      onClick={toggleTheme}
    >
      <span className="theme-switch-track" aria-hidden="true">
        <span className="theme-switch-icons" aria-hidden="true">
          <svg className="theme-switch-ico theme-switch-ico-moon" width="12" height="12" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M21 14.5A7.5 7.5 0 0 1 9.59 4.47a7.5 7.5 0 1 0 11.41 10.03Z"
            />
          </svg>
          <svg className="theme-switch-ico theme-switch-ico-sun" width="12" height="12" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M12 18a6 6 0 1 1 0-12 6 6 0 0 1 0 12Zm0-2a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM11 1h2v3h-2V1Zm0 19h2v3h-2v-3ZM3.515 4.929l1.414-1.414L7.05 5.636 5.636 7.05 3.515 4.93ZM16.95 18.364l1.414-1.414 2.121 2.121-1.414 1.414-2.121-2.12ZM1 11v2h3v-2H1Zm19 0v2h3v-2h-3ZM5.636 16.95l-1.414 1.414-2.121-2.121 1.414-1.414 2.121 2.121ZM18.364 7.05l1.414-1.414 2.121 2.121-1.414 1.414-2.121-2.121Z"
            />
          </svg>
        </span>
        <span className="theme-switch-thumb" />
      </span>
    </button>
  );
}
