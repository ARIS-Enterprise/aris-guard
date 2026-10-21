import { useEffect } from "react";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import Protection from "./pages/Protection";
import Optimizer from "./pages/Optimizer";
import Quarantine from "./pages/Quarantine";
import History from "./pages/History";
import Settings from "./pages/Settings";
import { useAppStore } from "./lib/store";

export default function App() {
  const { activePage, fetchSettings } = useAppStore();

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const renderPage = () => {
    switch (activePage) {
      case "dashboard":
        return <Dashboard />;
      case "protection":
        return <Protection />;
      case "optimizer":
        return <Optimizer />;
      case "quarantine":
        return <Quarantine />;
      case "history":
        return <History />;
      case "settings":
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg text-text">
      {/* Navigation Sidebar */}
      <Sidebar />

      {/* Main Content Viewport */}
      <main className="flex-1 overflow-y-auto px-8 py-7">
        <div className="mx-auto max-w-4xl">{renderPage()}</div>
      </main>
    </div>
  );
}
