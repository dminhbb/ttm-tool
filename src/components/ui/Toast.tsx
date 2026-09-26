'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

interface ToastItem {
  id: number;
  message: string;
}

interface ToastContextType {
  showToast: (message: string, durationMs?: number) => void;
}

const ToastContext = createContext<ToastContextType>({
  showToast: () => undefined,
});

let globalShowToast: ((message: string, durationMs?: number) => void) | null = null;

export function showToast(message: string, durationMs = 2000) {
  if (globalShowToast) {
    globalShowToast(message, durationMs);
  } else if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ttm-show-toast', { detail: { durationMs, message } }));
  }
}

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToastCallback = useCallback((message: string, durationMs = 2000) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, durationMs);
  }, []);

  useEffect(() => {
    globalShowToast = showToastCallback;
    const handleCustomEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ durationMs?: number; message: string }>;
      if (customEvent.detail?.message) {
        showToastCallback(customEvent.detail.message, customEvent.detail.durationMs ?? 2000);
      }
    };
    window.addEventListener('ttm-show-toast', handleCustomEvent);
    return () => {
      globalShowToast = null;
      window.removeEventListener('ttm-show-toast', handleCustomEvent);
    };
  }, [showToastCallback]);

  return (
    <ToastContext.Provider value={{ showToast: showToastCallback }}>
      {children}
      <div
        className="fixed top-12 left-1/2 -translate-x-1/2 z-[99999] pointer-events-none flex flex-col items-center gap-2"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="w-fit max-w-[90vw] px-5 py-2.5 rounded-full shadow-2xl transition-all duration-200 animate-in fade-in zoom-in-95"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <span
              className="text-sm md:text-base font-bold whitespace-nowrap text-white"
            >
              {toast.message}
            </span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
