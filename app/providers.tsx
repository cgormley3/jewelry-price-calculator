"use client";
import { GoogleOAuthProvider } from "@react-oauth/google";

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <GoogleOAuthProvider clientId="643516163366-2p8gonpdt21vmpquegh117raodgcpfci.apps.googleusercontent.com">
      {children}
    </GoogleOAuthProvider>
  );
};