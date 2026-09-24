import * as React from "react";
import { sendEmail } from "@/lib/email/send";
import { ProgramWelcomeEmail } from "@/lib/email/templates/program-welcome";

export async function sendProgramWelcomeEmail(args: {
  to: string;
  firstName?: string;
  programName: string;
  loginUrl: string;
  isNewAccount: boolean;
}): Promise<void> {
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
    }),
  });
}
