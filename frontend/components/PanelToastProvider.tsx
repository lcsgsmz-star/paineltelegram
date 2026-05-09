import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type ToastType = 'success' | 'error';

type ToastState = {
  id: number;
  message: string;
  type: ToastType;
};

type PanelToastContextValue = {
  showToast: (type: ToastType, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  clear: () => void;
};

const PanelToastContext = createContext<PanelToastContextValue | null>(null);

export function PanelToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, 4200);

    return () => window.clearTimeout(timer);
  }, [toast]);

  const showToast = useCallback((type: ToastType, message: string) => {
    setToast({
      id: Date.now(),
      type,
      message,
    });
  }, []);

  const value = useMemo<PanelToastContextValue>(
    () => ({
      showToast,
      success: (message) => showToast('success', message),
      error: (message) => showToast('error', message),
      clear: () => setToast(null),
    }),
    [showToast],
  );

  return (
    <PanelToastContext.Provider value={value}>
      {children}

      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex justify-center px-3 sm:bottom-6">
        {toast && (
          <div
            role="status"
            className={`pointer-events-auto w-full max-w-xl rounded-2xl border px-4 py-3 text-sm shadow-2xl backdrop-blur ${
              toast.type === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-100'
                : 'border-rose-500/30 bg-rose-500/15 text-rose-100'
            }`}
          >
            {toast.message}
          </div>
        )}
      </div>
    </PanelToastContext.Provider>
  );
}

export function usePanelToast() {
  const context = useContext(PanelToastContext);

  if (!context) {
    throw new Error('usePanelToast deve ser usado dentro de PanelToastProvider.');
  }

  return context;
}
