import { describe, it, expect } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionReminderEmail } from "../session-reminder";
import { CheckInAssignedEmail } from "../check-in-assigned";
import { NewMessageEmail } from "../new-message";
import { VoiceMemoAddedEmail } from "../voice-memo-added";
import { FeedbackResponseEmail } from "../feedback-response";
import { NutritionCommentEmail } from "../nutrition-comment";
import { NutritionNudgeEmail } from "../nutrition-nudge";
import { ProgramWelcomeEmail } from "../program-welcome";
import { ShareProgramEmail } from "../share-program";

const LOGO = "https://assets.test/branding/org_1/logo-on-dark-abcd1234.png";
const brand = { organizationName: "Summit PT", accent: "#0f766e", logoUrl: LOGO };

/**
 * Every template that can be sent to a CLIENT accepts `brand` and forwards it
 * to EmailLayout. Without `brand` it keeps its current, product-branded look.
 */
const cases: Array<{
  name: string;
  defaultAccent: string;
  el: (b?: typeof brand) => React.ReactElement;
}> = [
  {
    name: "SessionReminderEmail",
    defaultAccent: "#2563eb",
    el: (b) => (
      <SessionReminderEmail
        clientName="Sarah"
        sessionDate="Mon"
        sessionTime="9 AM"
        workoutName="Lower A"
        sessionLink="https://app.test/s"
        brand={b}
      />
    ),
  },
  {
    name: "CheckInAssignedEmail",
    defaultAccent: "#2563eb",
    el: (b) => (
      <CheckInAssignedEmail
        recipientName="Sarah"
        templateName="Weekly"
        dueDate="Fri"
        checkInLink="https://app.test/c"
        brand={b}
      />
    ),
  },
  {
    name: "NewMessageEmail",
    defaultAccent: "#2563eb",
    el: (b) => (
      <NewMessageEmail
        recipientName="Sarah"
        senderName="Mike"
        sentAt="now"
        preview="hi"
        messagesLink="https://app.test/m"
        brand={b}
      />
    ),
  },
  {
    name: "VoiceMemoAddedEmail",
    defaultAccent: "#16a34a",
    el: (b) => (
      <VoiceMemoAddedEmail
        recipientName="Sarah"
        senderName="Mike"
        workoutName="Lower A"
        sessionLink="https://app.test/m"
        role="client"
        brand={b}
      />
    ),
  },
  {
    name: "FeedbackResponseEmail",
    defaultAccent: "#2563eb",
    el: (b) => (
      <FeedbackResponseEmail
        recipientName="Sarah"
        trainerName="Mike"
        responsePreview="nice"
        dashboardLink="https://app.test/d"
        brand={b}
      />
    ),
  },
  {
    name: "NutritionCommentEmail",
    defaultAccent: "#2563eb",
    el: (b) => (
      <NutritionCommentEmail
        recipientName="Sarah"
        authorName="Mike"
        commentPreview="more protein"
        nutritionLink="https://app.test/n"
        isReply={false}
        brand={b}
      />
    ),
  },
  {
    name: "NutritionNudgeEmail",
    defaultAccent: "#2563eb",
    el: (b) => (
      <NutritionNudgeEmail
        recipientName="Sarah"
        headline="Log meals"
        detail="none today"
        nutritionLink="https://app.test/n"
        brand={b}
      />
    ),
  },
  {
    name: "ProgramWelcomeEmail",
    defaultAccent: "#2563eb",
    el: (b) => (
      <ProgramWelcomeEmail
        firstName="Sarah"
        programName="Strong 12"
        loginUrl="https://app.test/l"
        isNewAccount
        brand={b}
      />
    ),
  },
  {
    name: "ShareProgramEmail",
    defaultAccent: "#2563eb",
    el: (b) => (
      <ShareProgramEmail
        programName="Strong 12"
        clientName="Sarah"
        senderName="Mike"
        pdfLink="https://app.test/p"
        brand={b}
      />
    ),
  },
];

describe("client-facing templates carry the org brand", () => {
  for (const c of cases) {
    it(`${c.name} applies brand name, accent and logo`, () => {
      const html = renderToStaticMarkup(c.el(brand));

      expect(html).toContain("Summit PT");
      expect(html).toContain("#0f766e");
      expect(html).toContain(`src="${LOGO}"`);
      expect(html).not.toContain("INMOTUS RX");
      expect(html).not.toContain(c.defaultAccent);
    });

    it(`${c.name} keeps its current look without brand`, () => {
      const html = renderToStaticMarkup(c.el(undefined));

      expect(html).toContain("INMOTUS RX");
      expect(html).toContain(c.defaultAccent);
      expect(html).not.toContain("<img");
    });
  }
});
