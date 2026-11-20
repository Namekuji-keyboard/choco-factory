import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, [open, onClose, dismissible]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && dismissible && onClose()}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className={clsx('panel animate-pop flex max-h-[90vh] w-full flex-col shadow-2xl outline-none', wide ? 'max-w-3xl' : 'max-w-lg')}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          {dismissible && (
            <button className="btn-ghost -mr-2 p-1.5" onClick={onClose} aria-label="閉じる">
              <X size={18} />
            </button>
          )}
        </div>
        <div className="scroll-thin overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span className="pointer-events-none absolute top-full left-1/2 z-40 mt-1.5 hidden -translate-x-1/2 rounded-md bg-fg px-2 py-1 text-xs whitespace-nowrap text-bg shadow-lg group-hover:block">
        {text}
      </span>
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted">{children}</kbd>;
}

export function Section({ title, children, right }: { title: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function useConfirm() {
  // シンプルな確認 (ネイティブ)。重要な操作のみで使う
  return (msg: string) => window.confirm(msg);
}
