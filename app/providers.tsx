"use client";

/** Layout shell only — `GoogleOAuthProvider` mounts inside the auth UI when opened (see `app/page.tsx`). */
export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  return <>{children}</>;
};