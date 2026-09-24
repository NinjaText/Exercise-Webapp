import * as React from "react";
import { EmailLayout, Paragraph } from "./layout";

interface ProgramWelcomeEmailProps {
  firstName?: string;
  programName: string;
  loginUrl: string;
  isNewAccount: boolean;
}

export function ProgramWelcomeEmail({
  firstName,
  programName,
  loginUrl,
  isNewAccount,
}: ProgramWelcomeEmailProps) {
  return (
    <EmailLayout
      title="Welcome"
      accent="#2563eb"
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
