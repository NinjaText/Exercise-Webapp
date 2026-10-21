import type { Metadata, Viewport } from "next";
import { PRODUCT_ICONS } from "@/lib/branding/metadata";
import { PRODUCT_NAME } from "@/lib/brand";
import { Inter, Lexend } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ToastProvider } from "@/components/providers/toast-provider";
import { NativeProvider } from "@/components/providers/native-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ClipboardProvider } from "@/lib/clipboard-context";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const lexend = Lexend({
  variable: "--font-lexend",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: { default: PRODUCT_NAME, template: `%s | ${PRODUCT_NAME}` },
  applicationName: PRODUCT_NAME,
  // Config (not app/favicon.ico file convention) so a branded org's nested
  // `icons` replaces it instead of Next injecting the product icon first.
  icons: PRODUCT_ICONS,
  description:
    "MIA, your Movement Intelligence Assistant. Build personalized, evidence-informed exercise programs in minutes, then deliver and track them with your clients.",
  openGraph: {
    siteName: PRODUCT_NAME,
    images: [{ url: "/brand/icon-512.png", width: 512, height: 512, alt: PRODUCT_NAME }],
  },
};

// viewport-fit=cover lets the page extend under the iOS notch and home
// indicator so header and tab bar can pad with env(safe-area-inset-*).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      localization={{
        signIn: {
          start: {
            title: `Sign in to ${PRODUCT_NAME}`,
          },
        },
      }}
    >
      <html lang="en" suppressHydrationWarning>
        <body
          className={`${inter.variable} ${lexend.variable} font-sans antialiased`}
        >
          <NativeProvider>
            <TooltipProvider>
              <ClipboardProvider>
                {children}
                <ToastProvider />
              </ClipboardProvider>
            </TooltipProvider>
          </NativeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
