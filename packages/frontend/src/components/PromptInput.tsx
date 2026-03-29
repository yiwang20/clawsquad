import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
  type FormEvent,
} from "react";
import type { AgentStatus } from "@clawsquad/shared";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DISABLED_HINT: Record<AgentStatus, string | null> = {
  idle:    "Start the agent to send a prompt.",
  running: null, // enabled (abort shown, input enabled)
  waiting: null, // enabled
  stopped: "Restart the agent to continue.",
  error:   "Restart the agent to continue.",
};

function isInputEnabled(status: AgentStatus): boolean {
  return status === "running" || status === "waiting";
}

// ─── PromptInput ──────────────────────────────────────────────────────────────

export interface PromptInputProps {
  agentStatus: AgentStatus;
  onSend: (prompt: string) => void;
  onAbort: () => void;
  /** Placeholder text shown in the textarea. */
  placeholder?: string;
}

export function PromptInput({
  agentStatus,
  onSend,
  onAbort,
  placeholder = "Send a message… (Enter to send, Shift+Enter for newline)",
}: PromptInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const enabled = isInputEnabled(agentStatus);
  const hint = DISABLED_HINT[agentStatus];

  // Auto-resize textarea to content
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`; // cap at 10rem
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [value, resizeTextarea]);

  // Focus textarea when agent becomes ready
  useEffect(() => {
    if (enabled) {
      textareaRef.current?.focus();
    }
  }, [enabled]);

  const handleSubmit = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      const prompt = value.trim();
      if (!prompt || !enabled) return;
      onSend(prompt);
      setValue("");
      // Reset height after clearing
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    },
    [value, enabled, onSend]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const canSend = enabled && value.trim().length > 0;
  const showAbort = agentStatus === "running";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-1)",
      }}
    >
      {/* Disabled hint */}
      {!enabled && hint && (
        <div className="prompt-input-disabled-hint">{hint}</div>
      )}

      {/* Input row */}
      <form
        onSubmit={handleSubmit}
        className="prompt-input-container"
        aria-label="Send a prompt"
      >
        <textarea
          ref={textareaRef}
          id="prompt-input"
          name="prompt"
          className="prompt-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={enabled ? placeholder : hint ?? "Agent unavailable"}
          disabled={!enabled}
          rows={1}
          aria-label="Prompt input"
          aria-disabled={!enabled}
        />

        <div style={{ display: "flex", gap: "var(--space-2)", flexShrink: 0 }}>
          {/* Abort button — only shown while agent is running */}
          {showAbort && (
            <button
              type="button"
              className="btn btn-danger btn-sm btn-icon"
              onClick={onAbort}
              title="Abort current task"
              aria-label="Abort"
            >
              {/* Stop square icon */}
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="currentColor"
                aria-hidden="true"
              >
                <rect x="2" y="2" width="10" height="10" rx="1" />
              </svg>
            </button>
          )}

          {/* Send button */}
          <button
            type="submit"
            className="btn btn-primary btn-sm btn-icon"
            disabled={!canSend}
            title="Send prompt (Enter)"
            aria-label="Send"
          >
            {/* Send arrow icon */}
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 7H2M7 2l5 5-5 5" />
            </svg>
          </button>
        </div>
      </form>

      {/* Keyboard hint — shown when enabled */}
      {enabled && (
        <div
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--color-text-disabled)",
            textAlign: "right",
            paddingRight: "var(--space-1)",
          }}
        >
          Enter to send · Shift+Enter for newline
          {showAbort && (
            <span style={{ marginLeft: "var(--space-3)" }}>
              · Click ■ to abort
            </span>
          )}
        </div>
      )}
    </div>
  );
}
