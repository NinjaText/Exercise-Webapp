"use client";

import { SignIn, SignUp } from "@clerk/nextjs";
import { useNative } from "@/hooks/use-native";
import { withNativeAuthAppearance } from "@/lib/native/auth-appearance";
import { clerkAuthAppearance } from "@/lib/ui/clerk-appearance";

interface NativeAwareAuthProps {
  nativeFromServer: boolean;
  /** Clerk's routing mode for invite-link onboarding flows (path routing needs a `path` prop we don't use). */
  routing?: "hash";
  forceRedirectUrl?: string;
  /** Where to go when the visitor switches to sign-in from the sign-up form. */
  signInForceRedirectUrl?: string;
}

/**
 * `nativeFromServer` (user agent) makes the real shell correct on first paint;
 * `useNative()` additionally honours the ?native= dev override in a browser.
 */
export function NativeAwareSignIn({
  nativeFromServer,
  routing,
  forceRedirectUrl = "/onboarding",
}: NativeAwareAuthProps) {
  const { isNative } = useNative();
  return (
    <SignIn
      routing={routing}
      forceRedirectUrl={forceRedirectUrl}
      appearance={withNativeAuthAppearance(clerkAuthAppearance(), nativeFromServer || isNative)}
    />
  );
}

export function NativeAwareSignUp({
  nativeFromServer,
  routing,
  forceRedirectUrl = "/onboarding",
  signInForceRedirectUrl,
}: NativeAwareAuthProps) {
  const { isNative } = useNative();
  return (
    <SignUp
      routing={routing}
      forceRedirectUrl={forceRedirectUrl}
      signInForceRedirectUrl={signInForceRedirectUrl}
      appearance={withNativeAuthAppearance(clerkAuthAppearance(), nativeFromServer || isNative)}
    />
  );
}
