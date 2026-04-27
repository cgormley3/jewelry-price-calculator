import type { ReactNode } from "react";
import Link from "next/link";
import { ORG_NAME } from "@/lib/branding";

type LegalPageShellProps = {
  title: string;
  lastUpdated: string;
  children: ReactNode;
};

export function LegalPageShell({ title, lastUpdated, children }: LegalPageShellProps) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 md:py-14 pb-[calc(2.5rem+env(safe-area-inset-bottom,0px))]">
        <Link
          href="/"
          className="text-sm font-bold text-brand hover:underline mb-8 inline-block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 rounded"
        >
          ← Back to The Vault
        </Link>
        <h1 className="text-2xl md:text-3xl font-black text-foreground tracking-tight mb-2">{title}</h1>
        <p className="text-sm text-stone-500 mb-8">
          {ORG_NAME} · {lastUpdated}
        </p>
        <div className="text-sm text-stone-800 leading-relaxed space-y-6 [&_h2]:text-base [&_h2]:font-black [&_h2]:text-foreground [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:first:mt-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_a]:text-brand [&_a]:font-semibold hover:[&_a]:underline">
          {children}
        </div>
      </div>
    </div>
  );
}
