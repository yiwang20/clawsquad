import { useEffect, useRef } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  useNavigate,
  useParams,
  Navigate,
} from "react-router-dom";
import { useWebSocket, type WsStatus } from "./hooks/useWebSocket";
import { useSquadStore } from "./stores/squadStore";
import { Toaster } from "./components/Toaster";
import { HomePage } from "./pages/HomePage";
import { SquadDetailPage } from "./pages/SquadDetailPage";
import { AgentDetailPage } from "./pages/AgentDetailPage";

// ─── WS status indicator ──────────────────────────────────────────────────────

const WS_LABELS: Record<WsStatus, string> = {
  connected: "Live",
  connecting: "Connecting…",
  disconnected: "Offline",
};

const WS_COLORS: Record<WsStatus, string> = {
  connected: "var(--color-success)",
  connecting: "var(--color-warning, #f59e0b)",
  disconnected: "var(--color-error)",
};

function WsIndicator({ status }: { status: WsStatus }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-1-5, 6px)",
        fontSize: "var(--text-xs)",
        color: "var(--color-text-tertiary)",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          backgroundColor: WS_COLORS[status],
          flexShrink: 0,
          ...(status === "connecting"
            ? { animation: "pulse 1.5s ease-in-out infinite" }
            : {}),
        }}
      />
      {WS_LABELS[status]}
    </div>
  );
}

// ─── Reconnection banner ──────────────────────────────────────────────────────

function ReconnectionBanner({ status }: { status: WsStatus }) {
  // Only show after we've successfully connected at least once
  const hasConnectedRef = useRef(false);
  if (status === "connected") hasConnectedRef.current = true;
  if (!hasConnectedRef.current) return null;
  if (status === "connected") return null;

  const label =
    status === "connecting" ? "Reconnecting to server…" : "Connection lost. Retrying…";

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        background: "var(--color-warning-bg, rgba(245,158,11,0.12))",
        borderBottom: "1px solid var(--color-warning, #f59e0b)",
        color: "var(--color-warning, #f59e0b)",
        fontSize: "var(--text-xs)",
        textAlign: "center",
        padding: "var(--space-1-5, 6px) var(--space-4, 16px)",
      }}
    >
      {label}
    </div>
  );
}

// ─── App shell ────────────────────────────────────────────────────────────────

function CliWarningBanner() {
  const cliAvailable = useSquadStore((s) => s.cliAvailable);
  if (cliAvailable !== false) return null;

  return (
    <div
      role="alert"
      style={{
        background: "rgba(220, 38, 38, 0.12)",
        borderBottom: "1px solid var(--color-red-600)",
        color: "var(--color-red-400)",
        fontSize: "var(--text-sm)",
        textAlign: "center",
        padding: "var(--space-2) var(--space-4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--space-3)",
      }}
    >
      <span>
        Claude Code CLI not detected. Install it to use ClawSquad.
      </span>
      <a
        href="https://docs.anthropic.com/en/docs/claude-code/getting-started"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: "var(--color-red-300)",
          textDecoration: "underline",
          whiteSpace: "nowrap",
        }}
      >
        Installation guide ↗
      </a>
    </div>
  );
}

function AppShell() {
  const { status } = useWebSocket();
  const checkHealth = useSquadStore((s) => s.checkHealth);

  useEffect(() => {
    checkHealth().catch(() => {});
  }, [checkHealth]);

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="header-left">
            <span className="header-logo">
              Claw<span className="header-logo-accent">Squad</span>
            </span>
          </div>
          <div className="header-right">
            <WsIndicator status={status} />
          </div>
        </div>
      </header>

      <CliWarningBanner />
      <ReconnectionBanner status={status} />

      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/squads/:id" element={<SquadDetailRoute />} />
        <Route
          path="/squads/:squadId/agents/:agentId"
          element={<AgentDetailRoute />}
        />
        {/* Catch-all: redirect unknown paths home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <Toaster />
    </div>
  );
}

// ─── Route wrappers ───────────────────────────────────────────────────────────

function HomeRoute() {
  const navigate = useNavigate();
  const setActiveSquad = useSquadStore((s) => s.setActiveSquad);
  const setActiveAgent = useSquadStore((s) => s.setActiveAgent);

  // Clear active squad/agent on home
  useEffect(() => {
    setActiveSquad(null);
    setActiveAgent(null);
  }, [setActiveSquad, setActiveAgent]);

  return (
    <HomePage
      onNavigateToSquad={(squadId) => navigate(`/squads/${squadId}`)}
    />
  );
}

function SquadDetailRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const setActiveSquad = useSquadStore((s) => s.setActiveSquad);
  const setActiveAgent = useSquadStore((s) => s.setActiveAgent);

  const squadId = id ?? "";

  // Track active squad for WS subscription
  useEffect(() => {
    setActiveSquad(squadId);
    setActiveAgent(null);
    return () => setActiveSquad(null);
  }, [squadId, setActiveSquad, setActiveAgent]);

  if (!squadId) return <Navigate to="/" replace />;

  return (
    <SquadDetailPage
      squadId={squadId}
      onNavigateHome={() => navigate("/")}
    />
  );
}

function AgentDetailRoute() {
  const { squadId, agentId } = useParams<{
    squadId: string;
    agentId: string;
  }>();
  const navigate = useNavigate();
  const setActiveSquad = useSquadStore((s) => s.setActiveSquad);
  const setActiveAgent = useSquadStore((s) => s.setActiveAgent);

  const sid = squadId ?? "";
  const aid = agentId ?? "";

  // Track active squad for WS subscription (agent view still subscribes to squad)
  useEffect(() => {
    setActiveSquad(sid);
    setActiveAgent(aid);
    return () => {
      setActiveSquad(null);
      setActiveAgent(null);
    };
  }, [sid, aid, setActiveSquad, setActiveAgent]);

  if (!sid || !aid) return <Navigate to="/" replace />;

  return (
    <AgentDetailPage
      squadId={sid}
      agentId={aid}
      onNavigateHome={() => navigate("/")}
      onNavigateToSquad={(s) => navigate(`/squads/${s}`)}
    />
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
