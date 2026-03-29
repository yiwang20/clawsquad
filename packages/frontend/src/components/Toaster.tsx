import { useEffect } from "react";
import { useToastStore, type Toast } from "../stores/toastStore";

// ─── Auto-dismiss duration ────────────────────────────────────────────────────

const DISMISS_MS = 4_500;

// ─── Single toast ─────────────────────────────────────────────────────────────

const BG: Record<Toast["type"], string> = {
  error: "var(--color-error, #ef4444)",
  success: "var(--color-success, #22c55e)",
  info: "var(--color-accent, #7c3aed)",
};

function ToastItem({ toast }: { toast: Toast }) {
  const remove = useToastStore((s) => s.remove);

  useEffect(() => {
    const timer = setTimeout(() => remove(toast.id), DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast.id, remove]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "var(--space-3, 12px)",
        padding: "var(--space-3, 12px) var(--space-4, 16px)",
        background: "var(--color-bg-surface, #1a1d27)",
        border: `1px solid ${BG[toast.type]}`,
        borderLeft: `3px solid ${BG[toast.type]}`,
        borderRadius: "var(--radius-md, 6px)",
        boxShadow: "var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.4))",
        minWidth: 260,
        maxWidth: 400,
        fontSize: "var(--text-sm, 13px)",
        color: "var(--color-text-primary, #e2e8f0)",
        lineHeight: "var(--leading-normal, 1.5)",
        pointerEvents: "all",
        animation: "toast-in 0.2s ease",
      }}
    >
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button
        type="button"
        onClick={() => remove(toast.id)}
        aria-label="Dismiss"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--color-text-tertiary, #64748b)",
          fontSize: "var(--text-base, 14px)",
          lineHeight: 1,
          padding: 0,
          flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}

// ─── Container ────────────────────────────────────────────────────────────────

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div
        aria-live="polite"
        style={{
          position: "fixed",
          bottom: "var(--space-6, 24px)",
          right: "var(--space-6, 24px)",
          zIndex: 'var(--z-toast)',
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2, 8px)",
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} />
        ))}
      </div>
    </>
  );
}
