import { useState, useCallback } from "react";
import type { TaskResponse, CreateTaskRequest } from "@clawsquad/shared";
import { useSquadStore } from "../stores/squadStore";
import { toast } from "../stores/toastStore";

// ─── Types ────────────────────────────────────────────────────────────────────

type TaskStatus = "pending" | "in_progress" | "completed";

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "pending",     label: "Pending"     },
  { status: "in_progress", label: "In Progress" },
  { status: "completed",   label: "Completed"   },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusColor(status: TaskStatus): string {
  switch (status) {
    case "pending":     return "var(--color-text-disabled)";
    case "in_progress": return "var(--color-blue-400)";
    case "completed":   return "var(--color-green-400)";
  }
}

function nextStatus(current: TaskStatus): TaskStatus {
  switch (current) {
    case "pending":     return "in_progress";
    case "in_progress": return "completed";
    case "completed":   return "pending";
  }
}

// ─── AddTaskForm ──────────────────────────────────────────────────────────────

interface AddTaskFormProps {
  squadId: string;
  agents: { id: string; roleName: string }[];
  onDone: () => void;
}

function AddTaskForm({ squadId, agents, onDone }: AddTaskFormProps) {
  const createTask = useSquadStore((s) => s.createTask);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    const t = title.trim();
    if (!t) return;
    setSubmitting(true);
    try {
      const req: CreateTaskRequest = { title: t };
      const desc = description.trim();
      if (desc) req.description = desc;
      if (assigneeId) req.assigneeId = assigneeId;
      await createTask(squadId, req);
      onDone();
    } catch {
      toast.error("Failed to create task");
    } finally {
      setSubmitting(false);
    }
  }, [title, description, assigneeId, createTask, squadId, onDone]);

  return (
    <div
      style={{
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border-default)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-3)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
      }}
    >
      <input
        type="text"
        className="form-input"
        placeholder="Task title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); if (e.key === "Escape") onDone(); }}
        autoFocus
        style={{ fontSize: "var(--text-sm)" }}
      />
      <textarea
        className="form-input"
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        style={{ fontSize: "var(--text-sm)", resize: "none" }}
      />
      {agents.length > 0 && (
        <select
          className="form-input"
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
          style={{ fontSize: "var(--text-sm)" }}
        >
          <option value="">Unassigned</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.roleName}</option>
          ))}
        </select>
      )}
      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={handleSubmit}
          disabled={submitting || !title.trim()}
        >
          {submitting ? "Adding…" : "Add Task"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── TaskCard ─────────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: TaskResponse;
  squadId: string;
  assigneeName: string | null;
}

function TaskCard({ task, squadId, assigneeName }: TaskCardProps) {
  const updateTask = useSquadStore((s) => s.updateTask);
  const deleteTask = useSquadStore((s) => s.deleteTask);
  const [loading, setLoading] = useState(false);

  const handleAdvance = useCallback(async () => {
    setLoading(true);
    try {
      await updateTask(squadId, task.id, { status: nextStatus(task.status) });
    } catch {
      toast.error("Failed to update task");
    } finally {
      setLoading(false);
    }
  }, [updateTask, squadId, task.id, task.status]);

  const handleDelete = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading(true);
    try {
      await deleteTask(squadId, task.id);
    } catch {
      toast.error("Failed to delete task");
      setLoading(false);
    }
  }, [deleteTask, squadId, task.id]);

  return (
    <div
      className="card card-compact"
      style={{ cursor: "pointer", opacity: loading ? 0.6 : 1 }}
      onClick={handleAdvance}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleAdvance(); } }}
      aria-label={`Task: ${task.title}. Click to advance status.`}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-2)" }}>
        <span
          style={{
            fontSize: "var(--text-sm)",
            fontWeight: "var(--weight-medium)",
            color: "var(--color-text-primary)",
            lineHeight: "var(--leading-snug)",
          }}
        >
          {task.title}
        </span>
        <button
          type="button"
          onClick={handleDelete}
          disabled={loading}
          aria-label="Delete task"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--color-text-disabled)",
            padding: "2px",
            flexShrink: 0,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      {task.description && (
        <p
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--color-text-tertiary)",
            marginTop: "var(--space-1)",
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {task.description}
        </p>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
        {assigneeName && (
          <span className="role-chip" style={{ fontSize: "var(--text-xs)" }}>
            {assigneeName}
          </span>
        )}
        <span
          style={{
            fontSize: "var(--text-xs)",
            color: statusColor(task.status),
            marginLeft: "auto",
          }}
        >
          → {nextStatus(task.status).replace("_", " ")}
        </span>
      </div>
    </div>
  );
}

// ─── TaskBoard ────────────────────────────────────────────────────────────────

export interface TaskBoardProps {
  squadId: string;
}

export function TaskBoard({ squadId }: TaskBoardProps) {
  const tasks = useSquadStore((s) => s.tasks.get(squadId) ?? []);
  const agents = useSquadStore((s) => s.agents);
  const squad = useSquadStore((s) => s.squads.get(squadId));
  const [showAddForm, setShowAddForm] = useState(false);

  const squadAgents = (squad?.agents ?? []).map((a) => agents.get(a.id) ?? a);

  const agentNameById = new Map(squadAgents.map((a) => [a.id, a.roleName]));

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "var(--space-4)",
        alignItems: "start",
      }}
    >
      {COLUMNS.map(({ status, label }) => {
        const columnTasks = tasks.filter((t) => t.status === status);
        const isPending = status === "pending";

        return (
          <div key={status}>
            {/* Column header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "var(--space-3)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: statusColor(status),
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: "var(--text-xs)",
                    fontWeight: "var(--weight-semibold)",
                    color: "var(--color-text-secondary)",
                    textTransform: "uppercase",
                    letterSpacing: "var(--tracking-wider)",
                  }}
                >
                  {label}
                </span>
                <span
                  style={{
                    fontSize: "var(--text-xs)",
                    color: "var(--color-text-disabled)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {columnTasks.length}
                </span>
              </div>
              {isPending && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowAddForm((v) => !v)}
                  aria-label="Add task"
                  style={{ padding: "2px var(--space-2)" }}
                >
                  + Add
                </button>
              )}
            </div>

            {/* Add task form — inline in pending column */}
            {isPending && showAddForm && (
              <div style={{ marginBottom: "var(--space-2)" }}>
                <AddTaskForm
                  squadId={squadId}
                  agents={squadAgents}
                  onDone={() => setShowAddForm(false)}
                />
              </div>
            )}

            {/* Task cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {columnTasks.length === 0 && !showAddForm && (
                <div
                  style={{
                    fontSize: "var(--text-xs)",
                    color: "var(--color-text-disabled)",
                    fontStyle: "italic",
                    textAlign: "center",
                    padding: "var(--space-4) 0",
                    border: "1px dashed var(--color-border-subtle)",
                    borderRadius: "var(--radius-md)",
                  }}
                >
                  No tasks
                </div>
              )}
              {columnTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  squadId={squadId}
                  assigneeName={task.assigneeId ? (agentNameById.get(task.assigneeId) ?? null) : null}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
