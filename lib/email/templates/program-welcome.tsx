import * as React from "react";
import { EmailLayout, Paragraph } from "./layout";
import type { EmailBrandProps } from "@/lib/email/branding";

interface ProgramWelcomeEmailProps {
  firstName?: string;
  programName: string;
  loginUrl: string;
  isNewAccount: boolean;
  /** Org branding — set only when a client receives this (see lib/email/branding.ts). */
  brand?: EmailBrandProps;
}

export function ProgramWelcomeEmail({
  brand,
  firstName,
  programName,
  loginUrl,
  isNewAccount,
}: ProgramWelcomeEmailProps) {
  return (
    <EmailLayout
      title="Welcome"
      organizationName={brand?.organizationName}
      accent={brand?.accent ?? "#2563eb"}
      logoUrl={brand?.logoUrl}
      greeting={firstName ? `Welcome, ${firstName}!` : "Welcome!"}
      intro={
        <>
          Your purchase is confirmed and <strong>{programName}</strong> is ready in your account.
        </>
      }
      details={[{ label: "Program", value: programName }]}
      cta={{
        label: isNewAccount ? "Set Up My Account" : "Access My Program",
        href: loginUrl,
      }}
      footnote={
        <>
          If the button doesn't work, copy this link into your browser:
          <br />
          {loginUrl}
        </>
      }
    >
      <Paragraph>
        {isNewAccount
          ? "Click below to set your password and start your program:"
          : "Click below to log in and view your new program:"}
      </Paragraph>
    </EmailLayout>
  );
}
