import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent, ReactNode } from 'react';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { useTranslation } from 'react-i18next';

import clsx from 'clsx';
import { X } from 'lucide-react';

import { IconButton } from './Button.tsx';
import styles from './Sheet.module.css';

export type SheetProps = {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** Buttons pinned to the bottom of the sheet. */
  footer?: ReactNode;
  /** Shown before the title, e.g. a back button for a step inside the sheet. */
  headerStart?: ReactNode;
  /** Shown after the title, before the close button, e.g. a menu. */
  headerEnd?: ReactNode;
  /** Shown under the title, outside the scrolling part, e.g. a search box. */
  toolbar?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** As tall as the screen allows, whatever its content (a list being searched). */
  tall?: boolean;
  /** Makes the sheet a form; Enter and submit buttons call it. */
  onSubmit?: () => void;
  className?: string;
};

const PHONE = '(max-width: 640px)';

/**
 * The visible part of the screen. When the on-screen keyboard opens on iOS
 * the page doesn't shrink, so the sheet follows this area to stay above it.
 */
function useVisibleViewport(enabled: boolean): CSSProperties | undefined {
  const [style, setStyle] = useState<CSSProperties>();
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!enabled || !viewport) return;
    const update = () => {
      const covered = window.innerHeight - viewport.height > 1;
      setStyle(covered ? { top: viewport.offsetTop, height: viewport.height, bottom: 'auto' } : undefined);
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, [enabled]);
  return style;
}

/** Swipe the top of the sheet down to close it (on phones). */
function useSwipeToClose(onClose: () => void) {
  const start = useRef<{ y: number; time: number } | null>(null);
  const [offset, setOffset] = useState(0);

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (!window.matchMedia(PHONE).matches) return;
    if ((event.target as HTMLElement).closest('button, a, input, textarea, select')) return;
    start.current = { y: event.clientY, time: event.timeStamp };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (start.current) setOffset(Math.max(0, event.clientY - start.current.y));
  };
  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    if (!start.current) return;
    const distance = event.clientY - start.current.y;
    const speed = distance / Math.max(1, event.timeStamp - start.current.time);
    start.current = null;
    if (distance > 110 || (distance > 30 && speed > 0.6)) onClose();
    setOffset(0);
  };

  return {
    offset,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}

/** A bottom sheet on phones, a centered dialog on larger screens. */
export function Sheet({
  isOpen,
  onClose,
  title,
  children,
  footer,
  headerStart,
  headerEnd,
  toolbar,
  size = 'md',
  tall = false,
  onSubmit,
  className,
}: SheetProps) {
  const { t } = useTranslation();
  const viewport = useVisibleViewport(isOpen);
  const swipe = useSwipeToClose(onClose);

  const content = (
    <>
      <div className={styles.body}>{children}</div>
      {footer && <div className={styles.footer}>{footer}</div>}
    </>
  );

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={open => {
        if (!open) onClose();
      }}
      isDismissable
      className={styles.overlay}
      style={viewport}
    >
      <Modal
        className={clsx(styles.modal, styles[size], tall && styles.tall, swipe.offset > 0 && styles.dragging)}
        style={swipe.offset > 0 ? { transform: `translateY(${swipe.offset}px)` } : undefined}
      >
        <Dialog className={clsx(styles.dialog, className)}>
          <div className={styles.top} {...swipe.handlers}>
            <div className={styles.grabber} aria-hidden />
            <div className={styles.header}>
              {headerStart}
              <Heading slot="title" className={styles.title}>
                {title}
              </Heading>
              {headerEnd}
              <IconButton label={t('common.close')} onClick={onClose} className={styles.close}>
                <X size={22} />
              </IconButton>
            </div>
            {toolbar && <div className={styles.toolbar}>{toolbar}</div>}
          </div>
          {onSubmit ? (
            <form
              className={styles.form}
              noValidate
              onSubmit={event => {
                event.preventDefault();
                onSubmit();
              }}
            >
              {content}
            </form>
          ) : (
            content
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
