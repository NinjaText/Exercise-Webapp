"use client";

import { SignIn, SignUp } from "@clerk/nextjs";
import { useNative } from "@/hooks/use-native";
import { withNativeAuthAppearance } from "@/lib/native/auth-appearance";
import { clerkAuthAppearance } from "@/lib/ui/clerk-appearance";

/**
 * `nativeFromServer` (user agent) makes the real shell correct on first paint;
 * `useNative()` additionally honours the ?native= dev override in a browser.
 */
export function NativeAwareSignIn({ nativeFromServer }: { nativeFromServer: boolean }) {
  const { isNative } = useNative();
  return (
    <SignIn
      forceRedirectUrl="/onboarding"
      appearance={withNativeAuthAppearance(clerkAuthAppearance(), nativeFromServer || isNative)}
    />
  );
}

export function NativeAwareSignUp({ nativeFromServer }: { nativeFromServer: boolean }) {
  const { isNative } = useNative();
  return (
    <SignUp
      forceRedirectUrl="/onboarding"
      appearance={withNativeAuthAppearance(clerkAuthAppearance(), nativeFromServer || isNative)}
    />
  );
}
