import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Lightweight transient feedback — a toast that fades in, sits for a couple of
 * seconds, then fades out.
 *
 *   const toast = useToast();
 *   toast('Order completed');            // success (default)
 *   toast('Could not save', 'error');    // error
 *
 * Wrap the app once in <ToastProvider>; toasts stack bottom-centre.
 */

type ToastType = 'success' | 'error';

interface ToastData {
  id: number;
  message: string;
  type: ToastType;
  duration: number; // ms visible before the fade-out begins
}

type ToastFn = (message: string, type?: ToastType) => void;

const ToastContext = createContext<ToastFn | null>(null);

export function useToast(): ToastFn {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const nextId = useRef(1);

  const remove = useCallback((id: number) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback<ToastFn>((message, type = 'success') => {
    const id = nextId.current++;
    setToasts((cur) => [...cur, { id, message, type, duration: 2500 }]);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDone={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDone }: { toast: ToastData; onDone: (id: number) => void }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const enter = requestAnimationFrame(() => setShow(true));
    const hide = setTimeout(() => setShow(false), toast.duration);
    const done = setTimeout(() => onDone(toast.id), toast.duration + 300);
    return () => {
      cancelAnimationFrame(enter);
      clearTimeout(hide);
      clearTimeout(done);
    };
  }, [toast, onDone]);

  const tone = toast.type === 'error' ? 'bg-rose-600' : 'bg-brand-green';
  const icon = toast.type === 'error' ? '⚠' : '✓';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-auto flex max-w-sm items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-lg transition-opacity duration-300 ${tone} ${
        show ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <span aria-hidden>{icon}</span>
      {toast.message}
    </div>
  );
}
