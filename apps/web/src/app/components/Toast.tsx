"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Icon } from "../icons";

/**
 * Session toast system. `useToast().push(...)` queues a transient notification; the provider
 * (mounted in layout.tsx) renders a fixed bottom-right stack with auto-dismiss + manual close.
 * Augments the inline TxResult — does not replace it. Safe no-op if the provider is absent.
 */

export type ToastVariant = "success" | "error" | "warning" | "info";
export type ToastInput = { variant?: ToastVariant; title: string; message?: string; href?: string };
type Toast = ToastInput & { id: number };

const ToastContext = createContext<{ push: (toast: ToastInput) => void }>({ push: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      counter += 1;
      const id = counter;
      setToasts((current) => [...current, { ...input, id }]);
      setTimeout(() => dismiss(id), 5200);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      {toasts.length ? (
        <div className="toast-stack">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast ${toast.variant ?? "info"}`} role="status">
              <span className="toast-icon">
                {toast.variant === "success" ? (
                  <Icon.check s={15} />
                ) : toast.variant === "error" ? (
                  <Icon.x s={15} />
                ) : (
                  <Icon.bolt s={15} />
                )}
              </span>
              <div className="toast-body">
                <strong>{toast.title}</strong>
                {toast.message ? <p>{toast.message}</p> : null}
                {toast.href ? (
                  <a href={toast.href} target="_blank" rel="noreferrer">
                    View on Mantlescan →
                  </a>
                ) : null}
              </div>
              <button type="button" className="toast-close" onClick={() => dismiss(toast.id)} aria-label="Dismiss">
                <Icon.x s={13} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}
