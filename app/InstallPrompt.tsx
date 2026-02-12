"use client";

import { useState, useEffect } from 'react';

export default function InstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Check if it's an iPhone/iPad
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    // Check if it's already installed/running as an app
    const isStandalone = (window.navigator as any).standalone || window.matchMedia('(display-mode: standalone)').matches;

    // Only show to iPhone users who haven't installed it yet
    if (isIOS && !isStandalone) {
      setShowPrompt(true);
    }
  }, []);

  if (!showPrompt) return null;

  return (
    <div className="mt-10 p-6 bg-[#A5BEAC]/10 rounded-[2rem] border-2 border-dashed border-[#A5BEAC]/30 text-center mx-4 mb-10">
      <p className="text-[10px] font-black uppercase text-slate-700 tracking-widest">
        Install The Vault
      </p>
      <p className="text-[11px] text-stone-500 mt-2 leading-relaxed">
        For the best experience, tap the <span className="inline-block bg-white p-1 rounded border border-stone-200"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg></span> icon and select <br />
        <span className="font-black text-slate-900 italic">"Add to Home Screen"</span>
      </p>
    </div>
  );
}