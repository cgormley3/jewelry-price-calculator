'use client';

import { useEffect, useRef, useState } from 'react';
import NextImage from 'next/image';
import { ORG_NAME, orgSiteUrl } from '@/lib/branding';

/** BoMA mark inside the circular FAB (`public/boma-info-card-mark.png`) */
const CIRCLE_MARK_SRC = '/boma-info-card-mark.png';
const HOVER_LEAVE_MS = 160;

/**
 * Persistent bottom-right BoMA info: circular FAB + expandable card (tap to toggle; hover expands on desktop).
 */
export function BomaInfoDock() {
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [hoverOpen, setHoverOpen] = useState(false);
  /** Desktop / trackpad: hover opens card. Touch-only: tap FAB only (avoids stray hover on mobile). */
  const [fineHover, setFineHover] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showCard = pinnedOpen || hoverOpen;

  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const apply = () => setFineHover(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const cancelLeaveTimer = () => {
    if (leaveTimerRef.current !== null) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  };

  const onDockEnter = () => {
    cancelLeaveTimer();
    setHoverOpen(true);
  };

  const onDockLeave = () => {
    cancelLeaveTimer();
    leaveTimerRef.current = setTimeout(() => setHoverOpen(false), HOVER_LEAVE_MS);
  };

  useEffect(() => () => cancelLeaveTimer(), []);

  useEffect(() => {
    if (!pinnedOpen) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setPinnedOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [pinnedOpen]);

  const siteUrl = orgSiteUrl();

  return (
    <div
      ref={rootRef}
      className="fixed z-[80] bottom-[max(1rem,env(safe-area-inset-bottom,0px))] right-[max(1rem,env(safe-area-inset-right,0px))]"
      onMouseEnter={fineHover ? onDockEnter : undefined}
      onMouseLeave={fineHover ? onDockLeave : undefined}
    >
      <div className="relative flex flex-col items-end">
        {showCard ? (
          <>
            <div
              id="boma-info-dock-card"
              role="region"
              aria-label={`About ${ORG_NAME}`}
              className="z-10 mb-0 w-[min(18rem,calc(100vw-2rem))] max-h-[min(70dvh,24rem)] overflow-y-auto overscroll-contain rounded-2xl border-2 border-brand bg-white p-4 text-left shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              <p className="text-sm leading-relaxed text-stone-700 sm:text-[13px]">
                <span className="font-bold text-foreground">The Vault</span> is provided by{' '}
                <span className="font-bold text-foreground">BoMA</span>. We are a 501(c)(3) non-profit located in
                Colorado dedicated to the art of metalsmithing.
              </p>
              <a
                href={siteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg py-2 text-xs font-black uppercase tracking-[0.1em] text-brand transition-colors hover:text-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 active:opacity-80 sm:min-h-0 sm:py-0 sm:text-[11px] touch-manipulation"
              >
                Visit our main site
                <span aria-hidden className="translate-y-px">
                  →
                </span>
              </a>
            </div>
            {/* Aligns with horizontal center of the 48px FAB */}
            <div
              className="mr-[calc(1.5rem-0.5px)] h-2 w-px shrink-0 self-end bg-brand"
              aria-hidden
            />
          </>
        ) : null}

        <button
          type="button"
          onClick={() => setPinnedOpen((o) => !o)}
          className="relative z-20 flex h-12 w-12 shrink-0 touch-manipulation items-center justify-center overflow-hidden rounded-full border-2 border-brand bg-white shadow-lg transition hover:bg-amber-50/80 hover:shadow-xl active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          aria-expanded={showCard}
          aria-controls="boma-info-dock-card"
        >
          <NextImage
            src={CIRCLE_MARK_SRC}
            alt=""
            width={3000}
            height={3000}
            className="h-full w-full object-contain object-center pointer-events-none select-none"
            sizes="48px"
            unoptimized
          />
          <span className="sr-only">About {ORG_NAME}</span>
        </button>
      </div>
    </div>
  );
}
