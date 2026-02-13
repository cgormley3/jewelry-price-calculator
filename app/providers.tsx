"use client";
import { GoogleOAuthProvider } from "@react-oauth/google";

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <GoogleOAuthProvider clientId="YOUR_COPIED_CLIENT_ID.apps.googleusercontent.com">
      {children}
    </GoogleOAuthProvider>
  );
};