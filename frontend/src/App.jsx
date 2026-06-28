import MouseCaptcha from "./MouseCaptcha.jsx";

export default function App() {
  return (
    <main className="app-shell">
      <section className="app-header">
        <div>
          <p className="eyebrow">TrustCAP</p>
          <h1>Mouse behavior tracker</h1>
        </div>
        <p className="header-copy">
          Capture pointer movement, timing, and motion features for your bot
          detection model.
        </p>
      </section>

      <MouseCaptcha />
    </main>
  );
}
