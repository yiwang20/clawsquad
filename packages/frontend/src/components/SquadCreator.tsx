import { useState, useCallback, useRef, useEffect } from "react";
import type {
  CreateSquadRequest,
  CreateAgentInput,
  DefaultModel,
  PermissionMode,
} from "@clawsquad/shared";
import {
  DEFAULT_MODEL,
  DEFAULT_PERMISSION_MODE,
  MAX_AGENTS_PER_SQUAD,
} from "@clawsquad/shared";
import { QUICK_STARTS } from "../data/quickStarts";
import type { QuickStart } from "../data/quickStarts";

/* ─── Types ─────────────────────────────────────────────────────────────────── */

interface AgentDraft {
  id: string;
  roleName: string;
  roleDescription: string;
  showAdvanced: boolean;
  model: string;
  permissionMode: string;
  systemPrompt: string;
}

interface SquadCreatorProps {
  onLaunch: (request: CreateSquadRequest) => Promise<void>;
  onCancel?: () => void;
  /** Template name from a quick-start click; auto-applied on mount. */
  quickStartHint?: string | null;
}

/* ─── Helpers ───────────────────────────────────────────────────────────────── */

let agentIdCounter = 0;
function nextAgentId(): string {
  return `draft-${++agentIdCounter}`;
}

function createEmptyAgent(): AgentDraft {
  return {
    id: nextAgentId(),
    roleName: "",
    roleDescription: "",
    showAdvanced: false,
    model: "",
    permissionMode: "",
    systemPrompt: "",
  };
}

const MODEL_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Default (Sonnet)" },
  { value: "sonnet", label: "Sonnet" },
  { value: "opus", label: "Opus" },
  { value: "haiku", label: "Haiku" },
];

const PERMISSION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Default" },
  { value: "auto", label: "Auto" },
  { value: "plan", label: "Plan" },
  { value: "bypassPermissions", label: "Bypass Permissions" },
];

/* ─── Component ─────────────────────────────────────────────────────────────── */

export function SquadCreator({ onLaunch, onCancel, quickStartHint }: SquadCreatorProps) {
  // Resolve template from hint at component definition time (before any state)
  // so we can use it as initial state values — avoids effect/closure timing issues.
  const initialQS = quickStartHint
    ? QUICK_STARTS.find((q) => q.title === quickStartHint) ?? null
    : null;

  // ── Step state ──────────────────────────────────────────────────────────
  const [activeStep, setActiveStep] = useState(1);

  // ── Step 1: Mission ─────────────────────────────────────────────────────
  const [name, setName] = useState(initialQS?.name ?? "");
  const [mission, setMission] = useState(initialQS?.mission ?? "");
  const [showMissionAdvanced, setShowMissionAdvanced] = useState(false);
  const [workingDirectory, setWorkingDirectory] = useState("");
  const [defaultModel, setDefaultModel] = useState<string>(DEFAULT_MODEL);
  const [defaultPermissionMode, setDefaultPermissionMode] = useState<string>(
    DEFAULT_PERMISSION_MODE,
  );

  // ── Step 2: Roles ───────────────────────────────────────────────────────
  const [agents, setAgents] = useState<AgentDraft[]>(
    initialQS
      ? initialQS.agents.map((a) => ({
          ...createEmptyAgent(),
          roleName: a.roleName,
          roleDescription: a.roleDescription ?? "",
        }))
      : [createEmptyAgent()],
  );

  // ── Submission ──────────────────────────────────────────────────────────
  const [hasSelectedTemplate, setHasSelectedTemplate] = useState(!!initialQS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);
  const missionRef = useRef<HTMLTextAreaElement>(null);

  // On mount: if a template was pre-applied via quickStartHint, select the first
  // [...] placeholder in the mission textarea. Otherwise focus the name input.
  useEffect(() => {
    if (initialQS) {
      const textarea = missionRef.current;
      if (textarea) {
        const start = initialQS.mission.indexOf("[");
        const end = initialQS.mission.indexOf("]", start);
        if (start !== -1 && end !== -1) {
          textarea.focus();
          textarea.setSelectionRange(start, end + 1);
          return;
        }
      }
    }
    nameRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Quick start ─────────────────────────────────────────────────────────
  const applyQuickStart = useCallback((qs: QuickStart) => {
    setName(qs.name);
    setMission(qs.mission);
    setAgents(
      qs.agents.map((a) => ({
        ...createEmptyAgent(),
        roleName: a.roleName,
        roleDescription: a.roleDescription ?? "",
      })),
    );
    setHasSelectedTemplate(true);
    setActiveStep(1);
    // Select first [...] placeholder so user is guided to replace it
    setTimeout(() => {
      const textarea = missionRef.current;
      if (textarea) {
        const start = qs.mission.indexOf("[");
        const end = qs.mission.indexOf("]", start);
        if (start !== -1 && end !== -1) {
          textarea.focus();
          textarea.setSelectionRange(start, end + 1);
          return;
        }
      }
      nameRef.current?.focus();
    }, 0);
  }, []);

  // ── Agent CRUD ──────────────────────────────────────────────────────────
  const addAgent = useCallback(() => {
    setAgents((prev) => {
      if (prev.length >= MAX_AGENTS_PER_SQUAD) return prev;
      return [...prev, createEmptyAgent()];
    });
  }, []);

  const removeAgent = useCallback((id: string) => {
    setAgents((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const updateAgent = useCallback(
    (id: string, patch: Partial<AgentDraft>) => {
      setAgents((prev) =>
        prev.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      );
    },
    [],
  );

  // ── Validation ──────────────────────────────────────────────────────────
  const step1Valid = name.trim().length > 0 && mission.trim().length > 0;
  const step2Valid = agents.some((a) => a.roleName.trim().length > 0);
  const canLaunch = step1Valid && step2Valid && !isSubmitting;

  // ── Navigation ──────────────────────────────────────────────────────────
  const goNext = useCallback(() => {
    setActiveStep((s) => Math.min(s + 1, 3));
  }, []);

  const goBack = useCallback(() => {
    setActiveStep((s) => Math.max(s - 1, 1));
  }, []);

  // ── Launch ──────────────────────────────────────────────────────────────
  const handleLaunch = useCallback(async () => {
    if (!canLaunch) return;
    setIsSubmitting(true);
    setError(null);

    const agentInputs: CreateAgentInput[] = agents
      .filter((a) => a.roleName.trim())
      .map((a) => {
        const input: CreateAgentInput = { roleName: a.roleName.trim() };
        if (a.roleDescription.trim())
          input.roleDescription = a.roleDescription.trim();
        // Empty string means "use default" — always send explicit values so the
        // backend doesn't have to guess, and agents get the intended defaults.
        input.model = a.model || defaultModel || DEFAULT_MODEL;
        input.permissionMode = a.permissionMode || defaultPermissionMode || DEFAULT_PERMISSION_MODE;
        if (a.systemPrompt.trim()) input.systemPrompt = a.systemPrompt.trim();
        return input;
      });

    const request: CreateSquadRequest = {
      name: name.trim(),
      mission: mission.trim(),
      agents: agentInputs,
    };
    if (workingDirectory.trim())
      request.workingDirectory = workingDirectory.trim();

    try {
      await onLaunch(request);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to launch squad");
      setIsSubmitting(false);
    }
  }, [
    canLaunch,
    name,
    mission,
    workingDirectory,
    agents,
    defaultModel,
    defaultPermissionMode,
    onLaunch,
  ]);

  // ── Computed for review step ────────────────────────────────────────────
  const validAgents = agents.filter((a) => a.roleName.trim());

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="squad-creator">
      {/* ── Quick-Start Cards ──────────────────────────────────────── */}
      {activeStep === 1 && !hasSelectedTemplate && (
        <div className="squad-creator-quickstarts">
          <div className="divider-label">or start from a template</div>
          <div className="quick-start-grid" style={{ marginTop: "var(--space-4)" }}>
            {QUICK_STARTS.map((qs) => (
              <button
                key={qs.title}
                type="button"
                className="quick-start-card"
                onClick={() => applyQuickStart(qs)}
              >
                <div className="quick-start-card-title">{qs.title}</div>
                <div className="quick-start-card-meta">
                  {qs.agentCount} agents &middot; {qs.roles}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Step 1: Mission ────────────────────────────────────────── */}
      <div
        className="step"
        data-active={activeStep === 1}
        data-completed={activeStep > 1}
      >
        <div
          className="step-header"
          onClick={() => setActiveStep(1)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && setActiveStep(1)}
        >
          <span className="step-number">1</span>
          <span className="step-title">Mission</span>
          {activeStep > 1 && (
            <span className="step-summary">{name}</span>
          )}
        </div>

        <div className="step-body">
          <div className="step-body-inner">
            <div className="step-body-content">
              <div className="form-group">
                <label className="form-label" htmlFor="squad-name">
                  Squad Name
                </label>
                <input
                  ref={nameRef}
                  id="squad-name"
                  className="form-input"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 60))}
                  placeholder="e.g., Auth Refactor, Q2 Research, Blog Posts"
                  maxLength={60}
                />
                <span className="form-counter">{name.length}/60</span>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="squad-mission">
                  Mission
                </label>
                <span className="form-hint">
                  Describe what you want your squad to accomplish. Be specific
                  about the goal and any constraints.
                </span>
                <textarea
                  ref={missionRef}
                  id="squad-mission"
                  className="form-textarea"
                  value={mission}
                  onChange={(e) => setMission(e.target.value.slice(0, 2000))}
                  placeholder="Describe what you want your squad to accomplish..."
                  maxLength={2000}
                  rows={4}
                />
                <span
                  className={`form-counter${mission.length > 1800 ? (mission.length > 1950 ? " at-limit" : " near-limit") : ""}`}
                >
                  {mission.length}/2000
                </span>
              </div>

              {/* Advanced settings */}
              <div
                className="collapsible"
                data-open={showMissionAdvanced}
              >
                <button
                  type="button"
                  className="collapsible-trigger"
                  onClick={() => setShowMissionAdvanced(!showMissionAdvanced)}
                >
                  <span>Advanced Settings</span>
                  <svg
                    className="collapsible-trigger-icon"
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                  >
                    <path
                      d="M4 6l4 4 4-4"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <div className="collapsible-content">
                  <div className="collapsible-content-inner">
                    <div className="collapsible-body" style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                      <div className="form-group">
                        <label className="form-label" htmlFor="working-dir">
                          Working Directory
                        </label>
                        <span className="form-hint">
                          Where should your agents work? Leave blank for the
                          default workspace.
                        </span>
                        <input
                          id="working-dir"
                          className="form-input"
                          type="text"
                          value={workingDirectory}
                          onChange={(e) => setWorkingDirectory(e.target.value)}
                          placeholder="~/clawsquad-workspace/"
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label" htmlFor="default-model">
                          Default Model
                        </label>
                        <span className="form-hint">
                          Applies to all agents unless overridden per-role.
                        </span>
                        <select
                          id="default-model"
                          className="form-select"
                          value={defaultModel}
                          onChange={(e) =>
                            setDefaultModel(e.target.value as DefaultModel)
                          }
                        >
                          {MODEL_OPTIONS.filter((o) => o.value).map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label
                          className="form-label"
                          htmlFor="default-permission"
                        >
                          Default Permission Mode
                        </label>
                        <span className="form-hint">
                          Controls what agents can do without asking. 'Bypass
                          Permissions' is recommended for V1.
                        </span>
                        <select
                          id="default-permission"
                          className="form-select"
                          value={defaultPermissionMode}
                          onChange={(e) =>
                            setDefaultPermissionMode(
                              e.target.value as PermissionMode,
                            )
                          }
                        >
                          {PERMISSION_OPTIONS.filter((o) => o.value).map(
                            (o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ),
                          )}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="step-actions">
                {onCancel && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={onCancel}
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!step1Valid}
                  onClick={goNext}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Step 2: Roles ──────────────────────────────────────────── */}
      <div
        className="step"
        data-active={activeStep === 2}
        data-completed={activeStep > 2}
      >
        <div
          className="step-header"
          onClick={() => step1Valid && setActiveStep(2)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) =>
            e.key === "Enter" && step1Valid && setActiveStep(2)
          }
        >
          <span className="step-number">2</span>
          <span className="step-title">Roles</span>
          {activeStep > 2 && (
            <span className="step-summary">
              {validAgents.length} agent{validAgents.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="step-body">
          <div className="step-body-inner">
            <div className="step-body-content">
              <p
                style={{
                  fontSize: "var(--text-sm)",
                  color: "var(--color-text-secondary)",
                }}
              >
                Who's on the team?
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                {agents.map((agent, index) => (
                  <AgentRoleCard
                    key={agent.id}
                    agent={agent}
                    index={index}
                    canRemove={agents.length > 1}
                    onUpdate={(patch) => updateAgent(agent.id, patch)}
                    onRemove={() => removeAgent(agent.id)}
                  />
                ))}
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={addAgent}
                  disabled={agents.length >= MAX_AGENTS_PER_SQUAD}
                >
                  + Add Agent
                </button>
                <span className="agent-count">
                  {agents.length}/{MAX_AGENTS_PER_SQUAD} agents
                </span>
              </div>

              <div className="step-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={goBack}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!step2Valid}
                  onClick={goNext}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Step 3: Review & Launch ────────────────────────────────── */}
      <div
        className="step"
        data-active={activeStep === 3}
        data-completed={false}
      >
        <div
          className="step-header"
          onClick={() => step1Valid && step2Valid && setActiveStep(3)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) =>
            e.key === "Enter" && step1Valid && step2Valid && setActiveStep(3)
          }
        >
          <span className="step-number">3</span>
          <span className="step-title">Review &amp; Launch</span>
        </div>

        <div className="step-body">
          <div className="step-body-inner">
            <div className="step-body-content">
              {/* Squad summary */}
              <div>
                <h3
                  style={{
                    fontSize: "var(--text-lg)",
                    fontWeight: "var(--weight-semibold)",
                    color: "var(--color-text-primary)",
                    marginBottom: "var(--space-2)",
                  }}
                >
                  {name}
                </h3>
                <p
                  style={{
                    fontSize: "var(--text-sm)",
                    color: "var(--color-text-secondary)",
                    lineHeight: "var(--leading-relaxed)",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {mission}
                </p>
              </div>

              {/* Meta */}
              <div
                style={{
                  display: "flex",
                  gap: "var(--space-4)",
                  flexWrap: "wrap",
                  fontSize: "var(--text-xs)",
                  color: "var(--color-text-tertiary)",
                }}
              >
                {workingDirectory && (
                  <span>
                    Directory:{" "}
                    <span style={{ color: "var(--color-text-secondary)", fontFamily: "var(--font-mono)" }}>
                      {workingDirectory}
                    </span>
                  </span>
                )}
                <span>
                  Model:{" "}
                  <span style={{ color: "var(--color-text-secondary)" }}>
                    {defaultModel.charAt(0).toUpperCase() +
                      defaultModel.slice(1)}
                  </span>
                </span>
              </div>

              <hr className="divider" />

              {/* Agent table */}
              <div style={{ overflowX: "auto" }}>
                <table className="review-table">
                  <thead>
                    <tr>
                      <th>Role</th>
                      <th>Focus</th>
                      <th>Model</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validAgents.map((agent) => (
                      <tr key={agent.id}>
                        <td style={{ fontWeight: "var(--weight-medium)" }}>
                          {agent.roleName}
                        </td>
                        <td
                          style={{
                            color: agent.roleDescription
                              ? "var(--color-text-secondary)"
                              : "var(--color-text-disabled)",
                            fontStyle: agent.roleDescription
                              ? "normal"
                              : "italic",
                          }}
                        >
                          {agent.roleDescription || "Using squad mission"}
                        </td>
                        <td>
                          <span className="model-badge">
                            {agent.model || defaultModel}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {error && (
                <div className="output-error">{error}</div>
              )}

              <div className="step-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={goBack}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-lg"
                  disabled={!canLaunch}
                  onClick={handleLaunch}
                >
                  {isSubmitting ? "Launching..." : "Launch Squad"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Agent Role Card (sub-component) ───────────────────────────────────────── */

interface AgentRoleCardProps {
  agent: AgentDraft;
  index: number;
  canRemove: boolean;
  onUpdate: (patch: Partial<AgentDraft>) => void;
  onRemove: () => void;
}

function AgentRoleCard({
  agent,
  index,
  canRemove,
  onUpdate,
  onRemove,
}: AgentRoleCardProps) {
  return (
    <div className="card card-compact">
      <div className="card-header">
        <span
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--color-text-tertiary)",
            fontWeight: "var(--weight-semibold)",
          }}
        >
          Agent {index + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            className="btn btn-ghost btn-icon btn-sm"
            onClick={onRemove}
            aria-label={`Remove agent ${index + 1}`}
            title="Remove agent"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M10.5 3.5l-7 7M3.5 3.5l7 7"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <div className="form-group">
          <label className="form-label" htmlFor={`role-name-${agent.id}`}>
            Role Name
          </label>
          <input
            id={`role-name-${agent.id}`}
            className="form-input"
            type="text"
            value={agent.roleName}
            onChange={(e) => onUpdate({ roleName: e.target.value })}
            placeholder="e.g., Researcher, Backend Dev, Editor"
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor={`role-focus-${agent.id}`}>
            Focus
          </label>
          <input
            id={`role-focus-${agent.id}`}
            className="form-input"
            type="text"
            value={agent.roleDescription}
            onChange={(e) => onUpdate({ roleDescription: e.target.value })}
            placeholder="What should this agent focus on? Leave blank to use the squad mission."
          />
        </div>
      </div>

      {/* Per-agent advanced settings */}
      <div
        className="collapsible"
        data-open={agent.showAdvanced}
        style={{ marginTop: "var(--space-3)" }}
      >
        <button
          type="button"
          className="collapsible-trigger"
          onClick={() => onUpdate({ showAdvanced: !agent.showAdvanced })}
        >
          <span>Advanced</span>
          <svg
            className="collapsible-trigger-icon"
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
          >
            <path
              d="M3.5 5.25l3.5 3.5 3.5-3.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div className="collapsible-content">
          <div className="collapsible-content-inner">
            <div className="collapsible-body" style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <div className="form-group">
                <label
                  className="form-label"
                  htmlFor={`agent-model-${agent.id}`}
                >
                  Model Override
                </label>
                <select
                  id={`agent-model-${agent.id}`}
                  className="form-select"
                  value={agent.model}
                  onChange={(e) => onUpdate({ model: e.target.value })}
                >
                  {MODEL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label
                  className="form-label"
                  htmlFor={`agent-perm-${agent.id}`}
                >
                  Permission Mode Override
                </label>
                <select
                  id={`agent-perm-${agent.id}`}
                  className="form-select"
                  value={agent.permissionMode}
                  onChange={(e) => onUpdate({ permissionMode: e.target.value })}
                >
                  {PERMISSION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label
                  className="form-label"
                  htmlFor={`agent-prompt-${agent.id}`}
                >
                  Custom System Prompt
                </label>
                <span className="form-hint">
                  Override the auto-generated prompt. Leave blank to
                  auto-generate from mission + role.
                </span>
                <textarea
                  id={`agent-prompt-${agent.id}`}
                  className="form-textarea"
                  value={agent.systemPrompt}
                  onChange={(e) => onUpdate({ systemPrompt: e.target.value })}
                  placeholder="Leave blank to auto-generate..."
                  rows={3}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
