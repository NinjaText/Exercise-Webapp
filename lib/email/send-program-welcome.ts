import * as React from "react";
import { getEmailBranding, templateBrand } from "@/lib/email/branding";
import { sendEmail } from "@/lib/email/send";
import { ProgramWelcomeEmail } from "@/lib/email/templates/program-welcome";

export async function sendProgramWelcomeEmail(args: {
  to: string;
  firstName?: string;
  programName: string;
  loginUrl: string;
  isNewAccount: boolean;
  /** The selling trainer's org — the buyer is a client of it, so the email carries its brand. */
  clerkOrgId: string | null;
}): Promise<void> {
  // Never throws: a failed lookup falls back to the product defaults.
  const branding = await getEmailBranding(args.clerkOrgId);
  await sendEmail({
    to: args.to,
    subject: args.isNewAccount
      ? `Welcome — set up your ${args.programName} account`
      : `Your new program: ${args.programName}`,
    react: React.createElement(ProgramWelcomeEmail, {
      firstName: args.firstName,
      programName: args.programName,
      loginUrl: args.loginUrl,
      isNewAccount: args.isNewAccount,
      brand: templateBrand(branding),
    }),
    // Unbranded → no display name / Reply-To: sent exactly as before branding.
    ...(branding.enabled ? { fromName: branding.fromName, replyTo: branding.replyTo } : {}),
  });
}
