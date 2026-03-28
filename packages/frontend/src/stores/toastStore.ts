import { create } from "zustand";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastType = "error" | "success" | "info";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastStoreState {
  toasts: Toast[];
  add(message: string, type?: ToastType): string;
  remove(id: string): void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

let _idCounter = 0;

export const useToastStore = create<ToastStoreState>()((set) => ({
  toasts: [],

  add(message, type = "info") {
    const id = `toast-${++_idCounter}`;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    return id;
  },

  remove(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

// ─── Imperative helpers ───────────────────────────────────────────────────────
// Call these anywhere — inside or outside React components.

export const toast = {
  error: (message: string) => useToastStore.getState().add(message, "error"),
  success: (message: string) => useToastStore.getState().add(message, "success"),
  info: (message: string) => useToastStore.getState().add(message, "info"),
};
