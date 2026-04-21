'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { CredentialResponse } from '@react-oauth/google';

const GoogleLogin = dynamic(
  () => import('@react-oauth/google').then((m) => m.GoogleLogin),
  { ssr: false }
);

/** GSI large button + “Continue with …” needs ~260–320px; cap to parent so we never overflow the modal. */
const BTN_ABS_MIN = 120;
const BTN_MAX = 320;

type Props = {
  onSuccess: (credentialResponse: CredentialResponse) => void;
  onError: () => void;
  /** Bump when the auth sheet opens or step changes so GSI gets a fresh mount (avoids stacked iframes). */
  remountKey: string | number;
};

export function AuthGoogleLogin({ onSuccess, onError, remountKey }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [btnWidth, setBtnWidth] = useState(BTN_ABS_MIN);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const w = el.getBoundingClientRect().width;
      const px = Math.floor(w);
      setBtnWidth(Math.max(BTN_ABS_MIN, Math.min(BTN_MAX, px)));
    };
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, [remountKey]);

  return (
    <div
      ref={wrapRef}
      className="flex w-full min-w-0 max-w-full touch-manipulation justify-center [&>div]:min-w-0 [&_iframe]:max-w-full"
    >
      <GoogleLogin
        key={remountKey}
        onSuccess={onSuccess}
        onError={onError}
        theme="outline"
        size="large"
        width={btnWidth}
        shape="pill"
        text="continue_with"
      />
    </div>
  );
}
