import { useEffect, useState } from "react";
import type { PublicUser } from "../types";
import { loadRuntimeConfig } from "../config";
import { runDiagnostics, type StepResult } from "../diagnostics";

const ICON: Record<StepResult["status"], string> = {
  pending: "⚪",
  running: "⏳",
  pass: "✅",
  fail: "❌",
  skip: "➖",
};

export function Diagnostics({
  user,
  onClose,
}: {
  user: PublicUser;
  onClose: () => void;
}) {
  const [results, setResults] = useState<StepResult[]>([]);
  const [running, setRunning] = useState(false);
  const [env, setEnv] = useState<{ apiUrl: string; wsUrl: string }>({
    apiUrl: "",
    wsUrl: "",
  });

  useEffect(() => {
    loadRuntimeConfig().then(setEnv).catch(() => {});
  }, []);

  async function run(mode: "smoke" | "all") {
    if (running) return;
    setRunning(true);
    try {
      await runDiagnostics(mode, user, setResults);
    } finally {
      setRunning(false);
    }
  }

  const done = results.filter((r) => r.status === "pass" || r.status === "fail");
  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;

  return (
    <div className="modal-backdrop" onClick={running ? undefined : onClose}>
      <div
        className="modal diag-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <h2>🔧 Diagnostics</h2>
          <button className="icon-btn" onClick={onClose} disabled={running}>
            ✕
          </button>
        </header>

        <p className="diag-intro">
          Runs live functional tests against the API and WebSocket using your
          admin session. Use <strong>Smoke</strong> after a deploy for a quick,
          safe check; use <strong>Full</strong> to also test messaging, history,
          and image upload end-to-end.
        </p>

        <div className="diag-env">
          <div>
            <span className="diag-env-label">API</span>
            <code>{env.apiUrl || "…"}</code>
          </div>
          <div>
            <span className="diag-env-label">WebSocket</span>
            <code>{env.wsUrl || "…"}</code>
          </div>
          <div>
            <span className="diag-env-label">Signed in as</span>
            <code>
              {user.username} ({user.role})
            </code>
          </div>
        </div>

        <div className="diag-actions">
          <button
            className="primary-btn"
            onClick={() => run("smoke")}
            disabled={running}
          >
            {running ? "Running…" : "Run smoke tests"}
          </button>
          <button
            className="secondary-btn"
            onClick={() => run("all")}
            disabled={running}
          >
            Run full suite
          </button>
          {done.length > 0 && (
            <span className={`diag-summary ${failed ? "bad" : "good"}`}>
              {passed} passed{failed ? `, ${failed} failed` : ""}
            </span>
          )}
        </div>

        <div className="diag-results">
          {results.length === 0 && (
            <p className="empty-hint">No results yet — run a suite above.</p>
          )}
          {results.map((r) => (
            <div key={r.id} className={`diag-row ${r.status}`}>
              <span className="diag-icon">{ICON[r.status]}</span>
              <div className="diag-body">
                <div className="diag-name">
                  {r.name}
                  <span className="diag-kind">{r.kind}</span>
                  {typeof r.ms === "number" && (
                    <span className="diag-ms">{r.ms} ms</span>
                  )}
                </div>
                {r.detail && <div className="diag-detail">{r.detail}</div>}
              </div>
            </div>
          ))}
        </div>

        {failed > 0 && (
          <p className="diag-hint">
            A failing step's message above is the first thing to share when
            troubleshooting.
          </p>
        )}
      </div>
    </div>
  );
}
