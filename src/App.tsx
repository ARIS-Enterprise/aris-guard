export default function App() {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-bg p-6 text-text">
      <div className="rounded-xl border border-border bg-surface p-8 shadow-lg text-center max-w-sm">
        <h1 className="text-xl font-semibold text-text">ARIS Guard</h1>
        <p className="mt-2 text-sm text-text-muted">
          Agent runtime initialized. Background protection and system tray are active.
        </p>
      </div>
    </div>
  );
}
