import { clerkAppearance } from "@/lib/ui/clerk-appearance";

/**
 * Apple 4.8 requires Sign in with Apple whenever another third-party login is
 * offered, and Google blocks OAuth inside Android web views. The shell
 * therefore offers email sign-in only. Style objects (not utility classes)
 * so Clerk's own display rules cannot win.
 */
const HIDDEN = { display: "none" } as const;

export function authAppearanceFor(isNative: boolean) {
  if (!isNative) return undefined;
  return {
    elements: {
      socialButtonsBlockButton: HIDDEN,
      socialButtonsIconButton: HIDDEN,
      dividerRow: HIDDEN,
    } as Record<string, typeof HIDDEN>,
  };
}

type Appearance = { elements?: Record<string, unknown> } & Record<string, unknown>;

/**
 * Layers the native rules over an existing Clerk appearance (e.g. the app's
 * `clerkAuthAppearance()`), so the shell keeps the product styling while the
 * social sign-in options disappear. The web gets `base` unchanged.
 */
export function withNativeAuthAppearance<T extends Appearance>(base: T, isNative: boolean): T {
  const native = authAppearanceFor(isNative);
  if (!native) return base;
  return { ...base, elements: { ...base.elements, ...native.elements } };
}

/**
 * Clerk's <UserProfile> "Connected accounts" section offers "Connect Google",
 * which would start Google OAuth inside the shell's web view (blocked on
 * Android, and undermines Apple 4.8's email-only sign-in). Hidden the same
 * way as the auth-screen social buttons, merged onto whatever appearance the
 * page already passes so none of its existing elements are lost.
 *
 * `profileSection__connectedAccounts` follows Clerk's documented
 * `profileSection__<id>` element-key pattern, but Clerk's <UserProfile> UI is
 * loaded from Clerk's CDN at runtime, so this exact key cannot be confirmed
 * against the installed package types. Needs on-device confirmation (that
 * the section is actually hidden in a native build) before this is relied on.
 */
interface AppearanceLike {
  variables?: Record<string, unknown>;
  elements?: Record<string, unknown>;
}

export function profileAppearanceFor<T extends AppearanceLike>(
  isNative: boolean,
  base: T = clerkAppearance as unknown as T
) {
  if (!isNative) return base;
  return {
    ...base,
    elements: {
      ...base.elements,
      profileSection__connectedAccounts: HIDDEN,
    },
  };
}
