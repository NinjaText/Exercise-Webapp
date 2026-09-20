import { LEGAL_CONTACT_EMAIL, LEGAL_ENTITY_NAME } from "./company";

export interface LegalSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface LegalDocumentData {
  title: string;
  /** Human-readable date shown under the title. */
  lastUpdated: string;
  intro: string;
  sections: LegalSection[];
}

export const PRIVACY_POLICY: LegalDocumentData = {
  title: "Privacy Policy",
  lastUpdated: "September 21, 2026",
  intro: `${LEGAL_ENTITY_NAME} ("we", "us") provides a platform where fitness and rehabilitation professionals ("Trainers") build exercise programs and coach the people they work with ("Clients"). This policy explains what we collect, why, and the choices you have. It applies to our website, web app, and mobile apps.`,
  sections: [
    {
      heading: "Information we collect",
      paragraphs: ["We collect information you give us, information generated as you use the service, and limited technical data from your device."],
      bullets: [
        "Account details: name, email address, phone number, profile photo, and your role (Trainer or Client).",
        "Health and fitness information: goals, limitations, injuries, pain scores, body metrics, progress photos, workout logs, check-in answers, nutrition logs, and notes your Trainer records about you.",
        "Communications: messages and voice notes exchanged between Trainers and Clients.",
        "Device and usage data: device type, operating system, app version, push notification tokens, IP address, and pages or features used.",
        "Payment information for Trainers is processed by Stripe; we store subscription status but never full card numbers.",
      ],
    },
    {
      heading: "How we use information",
      paragraphs: ["We use your information to run the service and improve it. We do not sell personal information."],
      bullets: [
        "To create and deliver exercise programs, track adherence, and let Trainers and Clients communicate.",
        "To generate program suggestions and summaries using artificial-intelligence services acting on our behalf.",
        "To send notifications you have opted into, such as workout reminders and new-message alerts.",
        "To secure accounts, prevent abuse, and meet legal obligations.",
      ],
    },
    {
      heading: "Who can see your information",
      paragraphs: [
        "If you are a Client, the Trainers in your organization can see the health and fitness information you share and your activity in the app. If you are a Trainer, your Clients can see the programs, messages, and notes you share with them.",
        "We use service providers that process data on our behalf under contract, including cloud hosting and databases, authentication, payment processing, file storage, real-time messaging, email delivery, push notification delivery, and AI model providers. They may only use your data to provide services to us.",
        "We disclose information when required by law, to protect the rights and safety of users, or as part of a merger or acquisition with notice to you.",
      ],
    },
    {
      heading: "Retention and deletion",
      paragraphs: [
        "We keep your information while your account is active. You can delete your account at any time from Settings in the web or mobile app. Deletion removes your profile, health and fitness records, messages, and notification devices. Trainers must first deactivate or transfer their active Clients.",
        "Some records may be retained where required for legal, billing, or security purposes, and then deleted.",
      ],
    },
    {
      heading: "Your choices and rights",
      paragraphs: ["Depending on where you live, you may have rights to access, correct, export, or delete your information, and to object to certain processing."],
      bullets: [
        "Update your profile and notification preferences in Settings.",
        "Turn off push notifications in Settings or in your device settings.",
        `Contact us at ${LEGAL_CONTACT_EMAIL} to exercise any right not available in the app.`,
      ],
    },
    {
      heading: "Children",
      paragraphs: ["The service is not directed to children under 16, and we do not knowingly collect their information. If you believe a child has provided us information, contact us and we will delete it."],
    },
    {
      heading: "Security",
      paragraphs: ["We use encryption in transit, access controls, and audit logging to protect your information. No system is perfectly secure; keep your password private and tell us immediately if you suspect unauthorized access."],
    },
    {
      heading: "Changes to this policy",
      paragraphs: ["We will post any changes on this page and update the date above. Material changes will be announced in the app or by email."],
    },
    {
      heading: "Contact",
      paragraphs: [`Questions about this policy: ${LEGAL_CONTACT_EMAIL}.`],
    },
  ],
};
