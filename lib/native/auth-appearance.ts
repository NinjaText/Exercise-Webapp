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
