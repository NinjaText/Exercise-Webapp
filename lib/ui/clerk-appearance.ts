/**
 * Maps Clerk's themable variables and elements to our design tokens so the
 * embedded UserProfile and UserButton stop looking like a separate app.
 * Values are CSS custom properties so light/dark follow the page theme.
 */
export const clerkAppearance = {
  variables: {
    colorPrimary: "var(--primary)",
    colorText: "var(--foreground)",
    colorTextSecondary: "var(--muted-foreground)",
    colorBackground: "var(--surface)",
    colorInputBackground: "var(--surface)",
    colorInputText: "var(--foreground)",
    colorDanger: "var(--destructive)",
    colorSuccess: "var(--success)",
    colorWarning: "var(--warning)",
    colorNeutral: "var(--foreground)",
    // Matches rounded-md (--radius-md: 0.8 x the 0.75rem base) used by inputs and buttons.
    borderRadius: "0.6rem",
    fontFamily: "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
    fontSize: "0.875rem",
  },
  elements: {
    // Clerk's own styles are unlayered, so overrides need `!` to beat them.
    card: "shadow-none! border-0! rounded-none!",
    navbar: "bg-surface-muted! border-r! border-border! shadow-none!",
    scrollBox: "rounded-none! shadow-none! border-0!",
    pageScrollBox: "px-6! py-6!",
    navbarButton: "text-sm! font-medium! rounded-lg!",
    navbarButtonIcon: "size-4",
    headerTitle: "text-base! font-semibold! tracking-tight!",
    headerSubtitle: "text-sm text-muted-foreground",
    profileSectionTitleText: "text-sm! font-semibold!",
    formButtonPrimary: "bg-primary! text-primary-foreground! hover:bg-primary/90! shadow-none!",
    badge: "rounded-full! bg-neutral-soft! text-neutral-foreground!",
    userButtonAvatarBox: "size-8",
  },
} as const;

/**
 * <UserProfile> only: full-width card with a hairline ring instead of Clerk's
 * default shadow. Kept out of the shared appearance so <UserButton>'s popover
 * is not stretched to full width.
 */
export const userProfileAppearance = {
  variables: clerkAppearance.variables,
  elements: {
    ...clerkAppearance.elements,
    rootBox: "w-full!",
    cardBox:
      "w-full! max-w-none! rounded-xl! border-0! shadow-xs! ring-1! ring-border! overflow-hidden!",
  },
} as const;

/*
 * Auth variant for <SignIn>/<SignUp> inside AuthShell: card-less (the shell's
 * right panel is the surface), left-aligned, full-width controls that match
 * our Input (h-9, hairline, border-strong on hover, ring on focus) and Button
 * (h-9 solid primary / hairline secondary). Inputs and the primary button are
 * 44px below `sm` so phone taps are comfortable (spec §4).
 *
 * Clerk's own styles are unlayered, so they beat Tailwind's layered
 * utilities; every override here carries the `!` important modifier to win.
 */
const AUTH_INPUT =
  "h-11! sm:h-9! w-full! rounded-md! border! border-input! bg-surface! px-3! text-sm! text-foreground! shadow-xs! outline-none! transition-[color,border-color,box-shadow]! hover:border-border-strong! focus-visible:border-ring! focus-visible:ring-3! focus-visible:ring-ring/50! motion-reduce:transition-none!";

const AUTH_SECONDARY_BUTTON =
  "h-9! rounded-md! border! border-input! bg-surface! bg-none! text-sm! font-medium! text-foreground! shadow-xs! hover:bg-surface-muted! hover:border-border-strong! focus-visible:ring-3! focus-visible:ring-ring/50! motion-reduce:transition-none!";

export interface ClerkAuthAppearanceOptions {
  /**
   * Hide Clerk's header (title + subtitle). Off by default: on later steps
   * (verify email, second factor) that header carries the step's instructions,
   * so only hide it where AuthShell's own headline fully covers every step.
   */
  hideHeader?: boolean;
}

export function clerkAuthAppearance({ hideHeader = false }: ClerkAuthAppearanceOptions = {}) {
  return {
    variables: clerkAppearance.variables,
    elements: {
      rootBox: "w-full!",
      cardBox: "w-full! max-w-none! rounded-none! border-0! bg-transparent! shadow-none!",
      card: "w-full! gap-6! rounded-none! border-0! bg-transparent! p-0! shadow-none!",
      // AuthShell shows the org identity; never repeat Clerk's dashboard logo.
      logoBox: "hidden!",
      header: hideHeader ? "hidden!" : "items-start! text-left! gap-1!",
      headerTitle: "text-heading! text-foreground!",
      headerSubtitle: "text-body! text-muted-foreground!",
      socialButtons: "gap-2!",
      socialButtonsBlockButton: AUTH_SECONDARY_BUTTON,
      socialButtonsBlockButtonText: "text-sm! font-medium!",
      dividerLine: "bg-border!",
      dividerText: "text-caption! text-muted-foreground!",
      form: "gap-4!",
      formField: "gap-1.5!",
      formFieldLabel: "text-label! text-foreground!",
      formFieldInput: AUTH_INPUT,
      otpCodeFieldInput: "rounded-md! border! border-input! bg-surface! shadow-xs! focus-visible:border-ring! focus-visible:ring-3! focus-visible:ring-ring/50!",
      formFieldAction: "text-label! text-primary! hover:underline!",
      formFieldErrorText: "text-caption! text-destructive!",
      formButtonPrimary:
        "h-11! sm:h-9! w-full! rounded-md! border-0! bg-primary! bg-none! text-sm! font-medium! normal-case! text-primary-foreground! shadow-xs! hover:bg-primary/90! focus-visible:ring-3! focus-visible:ring-ring/50! motion-reduce:transition-none!",
      alternativeMethodsBlockButton: AUTH_SECONDARY_BUTTON,
      identityPreview: "rounded-md! border! border-border! bg-surface-muted! shadow-none!",
      identityPreviewEditButton: "text-primary!",
      // The card's footer ("Don't have an account?", "Secured by Clerk") sits on
      // a tinted band by default; flatten it onto the panel.
      footer: "bg-transparent! bg-none! border-0! p-0! pt-2!",
      footerAction: "justify-start! px-0!",
      footerActionText: "text-body! text-muted-foreground!",
      footerActionLink: "text-body! font-medium! text-primary! hover:underline!",
    },
  } as const;
}
