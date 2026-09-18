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
    colorBackground: "var(--card)",
    colorInputBackground: "var(--background)",
    colorInputText: "var(--foreground)",
    colorDanger: "var(--destructive)",
    colorSuccess: "var(--success)",
    colorWarning: "var(--warning)",
    colorNeutral: "var(--foreground)",
    borderRadius: "0.5rem",
    fontFamily: "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
    fontSize: "0.875rem",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full shadow-none ring-1 ring-border rounded-xl",
    card: "shadow-none",
    navbar: "bg-muted/40 border-r border-border",
    navbarButton: "text-sm font-medium rounded-lg",
    navbarButtonIcon: "size-4",
    headerTitle: "text-base font-semibold tracking-tight",
    headerSubtitle: "text-sm text-muted-foreground",
    profileSectionTitleText: "text-sm font-semibold",
    formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-none",
    badge: "rounded-full bg-neutral-soft text-neutral-foreground",
    userButtonAvatarBox: "size-8",
  },
} as const;
