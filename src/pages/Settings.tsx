import { useState } from "react";
import {
  Monitor,
  Globe,
  Moon,
  Sun,
  Info,
  Check,
  RefreshCw,
} from "lucide-react";
import { useAppStore } from "../lib/store";
import { translate, Language } from "../lib/i18n";

export default function Settings() {
  const {
    settings,
    updateSettings,
    language,
    setLanguage,
    theme,
    setTheme,
  } = useAppStore();
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);

  const handleStartWithWindowsChange = async (enabled: boolean) => {
    if (settings) {
      await updateSettings({ ...settings, start_with_windows: enabled });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    }
  };

  const handleLanguageChange = (newLang: Language) => {
    setLanguage(newLang);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleThemeChange = (newTheme: "system" | "dark" | "light") => {
    setTheme(newTheme);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleCheckUpdates = () => {
    setCheckingUpdate(true);
    setTimeout(() => {
      setCheckingUpdate(false);
      setUpdateMessage("You are running the latest version of ARIS Guard (v0.1.0).");
      setTimeout(() => setUpdateMessage(null), 4000);
    }, 1200);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">
            {translate("settings.title", language)}
          </h1>
          <p className="text-sm text-text-muted mt-1">
            System behavior, runtime preferences, and appearance
          </p>
        </div>
        {saveSuccess && (
          <span className="flex items-center gap-1.5 text-xs text-success font-medium bg-success/10 px-3 py-1 rounded-full animate-in fade-in">
            <Check className="h-3.5 w-3.5" />
            {translate("settings.saved", language)}
          </span>
        )}
      </div>

      {updateMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 p-3.5 text-xs text-success font-medium animate-in fade-in">
          <Check className="h-4 w-4 shrink-0" />
          <span>{updateMessage}</span>
        </div>
      )}

      {/* General Settings Section */}
      <div className="rounded-xl border border-border bg-surface p-5 shadow-sm space-y-5">
        <h2 className="text-sm font-semibold text-text border-b border-border pb-3 flex items-center gap-2">
          <Monitor className="h-4 w-4 text-primary" />
          {translate("settings.general", language)}
        </h2>

        {/* Start with Windows toggle */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-text">
              {translate("settings.startWithWindows", language)}
            </span>
            <p className="text-xs text-text-muted">
              Launch minimized to system tray on Windows login
            </p>
          </div>
          <input
            type="checkbox"
            checked={settings?.start_with_windows ?? true}
            onChange={(e) => handleStartWithWindowsChange(e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary cursor-pointer"
          />
        </div>

        {/* Language Selection */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-text-muted" />
            <div>
              <span className="text-sm font-medium text-text">
                {translate("settings.language", language)}
              </span>
              <p className="text-xs text-text-muted">
                Select user interface language
              </p>
            </div>
          </div>
          <select
            value={language}
            onChange={(e) => handleLanguageChange(e.target.value as Language)}
            className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold text-text cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="en">English (US)</option>
            <option value="bn">বাংলা (Bengali)</option>
          </select>
        </div>

        {/* Theme Selection */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <Moon className="h-4 w-4 text-text-muted" />
            <div>
              <span className="text-sm font-medium text-text">
                {translate("settings.theme", language)}
              </span>
              <p className="text-xs text-text-muted">Switch color palette</p>
            </div>
          </div>
          <div className="flex rounded-lg border border-border p-1 bg-surface-2 gap-1 text-xs">
            <button
              onClick={() => handleThemeChange("dark")}
              className={`flex items-center gap-1 px-3 py-1 rounded font-semibold transition-all ${
                theme === "dark"
                  ? "bg-surface text-text shadow-sm"
                  : "text-text-muted hover:text-text"
              }`}
            >
              <Moon className="h-3 w-3" />
              Dark
            </button>
            <button
              onClick={() => handleThemeChange("light")}
              className={`flex items-center gap-1 px-3 py-1 rounded font-semibold transition-all ${
                theme === "light"
                  ? "bg-surface text-text shadow-sm"
                  : "text-text-muted hover:text-text"
              }`}
            >
              <Sun className="h-3 w-3" />
              Light
            </button>
          </div>
        </div>
      </div>

      {/* Maintenance & Updates */}
      <div className="rounded-xl border border-border bg-surface p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-text flex items-center gap-2 border-b border-border pb-3">
          <RefreshCw className="h-4 w-4 text-primary" />
          Maintenance & Updates
        </h2>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-text">
              Software Updates
            </span>
            <p className="text-xs text-text-muted">
              Verify if an updated security definition or build is available
            </p>
          </div>
          <button
            onClick={handleCheckUpdates}
            disabled={checkingUpdate}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3.5 py-1.5 text-xs font-semibold text-text hover:bg-border active:scale-95 transition-all disabled:opacity-60"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${checkingUpdate ? "animate-spin" : ""}`}
            />
            {checkingUpdate ? "Checking..." : "Check Now"}
          </button>
        </div>
      </div>

      {/* About Box */}
      <div className="rounded-xl border border-border bg-surface p-5 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold text-text flex items-center gap-2">
          <Info className="h-4 w-4 text-primary" />
          About ARIS Guard
        </h2>
        <div className="text-xs text-text-muted space-y-1">
          <p>
            Version:{" "}
            <strong className="text-text font-medium">
              0.1.0 (Phase 1 Build)
            </strong>
          </p>
          <p>License: MIT Open Source License</p>
          <p>Local-First: Zero telemetry, zero analytics, private forever.</p>
        </div>
      </div>
    </div>
  );
}
