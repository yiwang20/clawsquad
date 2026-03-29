import { useState, useEffect, useCallback } from "react";
import type { CreateSquadRequest } from "@clawsquad/shared";
import { useSquadStore } from "../stores/squadStore";
import { toast } from "../stores/toastStore";
import { SquadCard } from "../components/SquadCard";
import { SquadCreator } from "../components/SquadCreator";
import { EmptyState } from "../components/EmptyState";


/* ─── Component ─────────────────────────────────────────────────────────────── */

interface HomePageProps {
  onNavigateToSquad: (squadId: string) => void;
}

export function HomePage({ onNavigateToSquad }: HomePageProps) {
  const squads = useSquadStore((s) => s.squads);
  const fetchSquads = useSquadStore((s) => s.fetchSquads);
  const createSquad = useSquadStore((s) => s.createSquad);
  const startSquad = useSquadStore((s) => s.startSquad);
  const cliAvailable = useSquadStore((s) => s.cliAvailable);

  const [showCreator, setShowCreator] = useState(false);
  const [quickStartHint, setQuickStartHint] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(true);

  // Fetch squads on mount
  useEffect(() => {
    setIsFetching(true);
    fetchSquads()
      .catch(() => toast.error("Failed to load squads. Is the backend running?"))
      .finally(() => setIsFetching(false));
  }, [fetchSquads]);

  const squadList = Array.from(squads.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const handleLaunch = useCallback(
    async (req: CreateSquadRequest) => {
      const squad = await createSquad(req);
      // Best-effort start — if it fails the user can retry from the squad detail page
      try {
        await startSquad(squad.id);
      } catch {
        toast.error("Squad created but failed to start. You can start it manually.");
      }
      setShowCreator(false);
      onNavigateToSquad(squad.id);
    },
    [createSquad, startSquad, onNavigateToSquad],
  );

  const handleQuickStart = useCallback((templateName: string) => {
    setQuickStartHint(templateName);
    setShowCreator(true);
  }, []);

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isFetching && squads.size === 0) {
    return (
      <div className="main">
        <div className="loading-state">
          <div className="loading-state-spinner" />
          <span>Loading squads…</span>
        </div>
      </div>
    );
  }

  // ── Creator view ────────────────────────────────────────────────────────
  if (showCreator) {
    return (
      <div className="main">
        <div className="page-header">
          <div className="page-header-content">
            <h1 className="page-title">Create Your Squad</h1>
            <p className="page-description">
              Name your mission, pick your roles, and launch.
            </p>
          </div>
        </div>
        <SquadCreator
          onLaunch={handleLaunch}
          onCancel={() => {
            setShowCreator(false);
            setQuickStartHint(null);
          }}
          quickStartHint={quickStartHint}
        />
      </div>
    );
  }

  // ── Empty state ─────────────────────────────────────────────────────────
  if (squadList.length === 0) {
    return (
      <div className="main">
        <EmptyState
          onCreateSquad={() => setShowCreator(true)}
          onQuickStart={handleQuickStart}
        />
      </div>
    );
  }

  // ── Squad list ──────────────────────────────────────────────────────────
  return (
    <div className="main">
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title">Your Squads</h1>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowCreator(true)}
            disabled={cliAvailable === false}
            title={cliAvailable === false ? "Claude Code CLI not detected" : undefined}
          >
            + New Squad
          </button>
        </div>
      </div>

      <div className="squad-grid">
        {squadList.map((squad) => (
          <SquadCard
            key={squad.id}
            squad={squad}
            onClick={onNavigateToSquad}
          />
        ))}
      </div>
    </div>
  );
}
