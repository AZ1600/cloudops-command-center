"use client";

import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";

export function AuthProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  if (!enabled) return children;
  return (
    <ClerkProvider
      signInUrl="/login"
      signInForceRedirectUrl="/"
      signUpForceRedirectUrl="/"
    >
      {children}
    </ClerkProvider>
  );
}
