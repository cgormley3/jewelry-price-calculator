'use client';

import { useEffect, useRef, useState } from 'react';
import NextImage from 'next/image';
import { ORG_NAME, orgSiteUrl } from '@/lib/branding';

const ANVIL_SRC = '/boma-anvil-mark.png';
const HAMMER_SRC = '/boma-hammer-mark.png';
const HOVER_LEAVE_MS = 160;

/**
 * Persistent bottom-right BoMA info: anvil FAB + expandable card (tap to toggle; hover expands on desktop).
 */
export function BomaInfoDock() {
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [hoverOpen, setHoverOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showCard = pinnedOpen || hoverOpen;

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
      onMouseEnter={onDockEnter}
      onMouseLeave={onDockLeave}
    >
      <div className="relative flex flex-col items-end">
        <div
          id="boma-info-dock-card"
          role="region"
          aria-label={`About ${ORG_NAME}`}
          className={`absolute bottom-[calc(100%+0.5rem)] right-0 w-[min(18rem,calc(100vw-2rem))] max-h-[min(70vh,24rem)] overflow-y-auto rounded-2xl border-2 border-brand bg-white p-4 shadow-xl text-left transition-[opacity,transform] duration-200 ease-out ${
            showCard ? 'pointer-events-auto z-10 opacity-100 translate-y-0' : 'pointer-events-none z-0 opacity-0 -translate-y-1'
          }`}
          aria-hidden={!showCard}
        >
          <p className="text-[13px] leading-relaxed text-stone-700">
            <span className="font-bold text-foreground">The Vault</span> is provided by{' '}
            <span className="font-bold text-foreground">BoMA</span>. We are a 501(c)(3) non-profit located in
            Colorado dedicated to the art of metalsmithing.
          </p>
          <a
            href={siteUrl}
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={showCard ? 0 : -1}
            className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.1em] text-brand hover:text-forest transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 rounded-lg"
          >
            Visit our main site
            <span aria-hidden className="translate-y-px">
              →
            </span>
          </a>
        </div>

        <button
          type="button"
          onClick={() => setPinnedOpen((o) => !o)}
          className="relative z-20 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-brand bg-white shadow-lg transition hover:bg-amber-50/80 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          aria-expanded={showCard}
          aria-controls="boma-info-dock-card"
        >
          <span className="relative block h-8 w-8 shrink-0" aria-hidden>
            <NextImage
              src={ANVIL_SRC}
              alt=""
              width={112}
              height={112}
              className="pointer-events-none select-none object-contain absolute bottom-0 left-1/2 z-0 h-[26px] w-[26px] max-w-none -translate-x-1/2"
              sizes="32px"
              unoptimized
            />
            <NextImage
              src={HAMMER_SRC}
              alt=""
              width={112}
              height={112}
              className="pointer-events-none select-none object-contain absolute left-1/2 top-0 z-10 h-[15px] w-[24px] max-w-none -translate-x-1/2 translate-y-px"
              sizes="32px"
              unoptimized
            />
          </span>
          <span className="sr-only">About {ORG_NAME}</span>
        </button>
      </div>
    </div>
  );
}
