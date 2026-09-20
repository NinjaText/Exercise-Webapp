import { LEGAL_CONTACT_EMAIL, LEGAL_ENTITY_NAME, LEGAL_GOVERNING_LAW } from "./company";
import type { LegalDocumentData } from "./privacy-policy";

export const TERMS_OF_SERVICE: LegalDocumentData = {
  title: "Terms of Service",
  lastUpdated: "September 21, 2026",
  intro: `These terms govern your use of ${LEGAL_ENTITY_NAME} on the web and in our mobile apps. By creating an account you agree to them.`,
  sections: [
    {
      heading: "Accounts and roles",
      paragraphs: [
        "Trainers create organizations and invite Clients. Trainers are responsible for the accuracy of the programs, notes, and advice they provide. Clients are responsible for the accuracy of the information they share and for following their own healthcare provider's guidance.",
        "You must be at least 16 years old and provide accurate information. Keep your credentials confidential and notify us of any unauthorized use.",
      ],
    },
    {
      heading: "Not medical advice",
      paragraphs: [
        "The service provides tools for exercise programming and coaching. Content in the app, including AI-generated suggestions, is not medical advice, diagnosis, or treatment. Always consult a qualified healthcare professional before starting or changing an exercise program, and stop any activity that causes pain or discomfort.",
        "You use the service at your own risk. Exercise carries inherent risks of injury.",
      ],
    },
    {
      heading: "Subscriptions and payments",
      paragraphs: [
        "Trainer subscriptions and any program purchases are sold and managed through our website. Prices, trial periods, and renewal terms are shown at checkout. You can cancel any time; access continues until the end of the paid period. Fees are non-refundable except where required by law.",
        "The mobile apps do not sell subscriptions or digital goods.",
      ],
    },
    {
      heading: "Acceptable use",
      paragraphs: ["You agree not to misuse the service."],
      bullets: [
        "Do not access another person's account or data without authorization.",
        "Do not upload unlawful, harmful, or infringing content.",
        "Do not attempt to reverse engineer, scrape, or disrupt the service.",
        "Do not use the service to provide care you are not qualified or licensed to provide.",
      ],
    },
    {
      heading: "Your content",
      paragraphs: ["You keep ownership of the content you upload. You grant us a license to store, process, and display it as needed to run the service, including sharing it with the Trainers or Clients you work with and processing it with AI services on your behalf."],
    },
    {
      heading: "Termination",
      paragraphs: ["You can delete your account at any time in Settings. We may suspend or terminate accounts that violate these terms or create risk for other users. Sections that by their nature should survive termination do so."],
    },
    {
      heading: "Disclaimers and limitation of liability",
      paragraphs: [
        `The service is provided "as is" without warranties of any kind. To the fullest extent permitted by law, ${LEGAL_ENTITY_NAME} is not liable for indirect, incidental, or consequential damages, or for injuries arising from exercise performed using the service. Our total liability is limited to the amount you paid us in the twelve months before the claim.`,
      ],
    },
    {
      heading: "Governing law",
      paragraphs: [`These terms are governed by ${LEGAL_GOVERNING_LAW}, without regard to conflict-of-law rules.`],
    },
    {
      heading: "Changes and contact",
      paragraphs: [
        "We may update these terms; continued use after changes means you accept them. Material changes will be announced in the app or by email.",
        `Questions: ${LEGAL_CONTACT_EMAIL}.`,
      ],
    },
  ],
};
