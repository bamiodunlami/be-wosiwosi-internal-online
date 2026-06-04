import { useState } from 'react';
import { Modal } from './modal';

/**
 * A product thumbnail that opens a larger view (lightbox) on click. Keeps the
 * small inline size in lists/tables, but lets a packer tap to see the image.
 */
export function ProductThumb({ src, alt = '' }: { src: string; alt?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={alt ? `View image of ${alt}` : 'View product image'}
        className="h-8 w-8 shrink-0 overflow-hidden rounded ring-1 ring-transparent transition hover:ring-2 hover:ring-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green"
      >
        <img src={src} alt={alt} className="h-full w-full object-cover" />
      </button>

      {open && (
        <Modal onClose={() => setOpen(false)} size="lg">
          <img
            src={src}
            alt={alt}
            className="mx-auto max-h-[70vh] w-auto rounded-lg object-contain"
          />
          {alt && <p className="mt-3 text-center text-sm text-slate-600">{alt}</p>}
        </Modal>
      )}
    </>
  );
}
