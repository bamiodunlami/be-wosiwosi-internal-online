import { useEffect, type ReactNode } from 'react';

/**
 * Centered modal overlay — click the backdrop or press Escape to close, and the
 * background scroll is locked while open. Scrollable / top-aligned on small
 * screens, centered on larger ones.
 */
export function Modal({
  onClose,
  children,
  size = 'md',
}: {
  onClose: () => void;
  children: ReactNode;
  size?: 'md' | 'lg';
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div
        className={`relative my-8 w-full rounded-xl bg-white p-5 shadow-xl ${
          size === 'lg' ? 'max-w-lg' : 'max-w-md'
        }`}
      >
        {children}
      </div>
    </div>
  );
}
