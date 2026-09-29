import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "@/components/LegalPage";
import { BRAND } from "@/lib/brand";

/**
 * Account deletion — the page Google Play requires for any app that lets
 * someone create an account, reachable without installing the app.
 *
 * One page for both flavors: a seeker and a coach hold the same kind of
 * account, deleted the same way, so there is nothing flavor-specific to say
 * twice. Content matches /privacy's "How long we keep things" section rather
 * than restating it differently — Play reviews this against that page.
 */

const CONTACT_EMAIL = "privacy@aspire91.com";
const UPDATED = "29 September 2026";

export const metadata: Metadata = {
  title: `Delete your account — ${BRAND.name}`,
  description:
    "How to request deletion of your Aspire91 account, on the seeker or the coach app, and what is deleted or kept.",
  alternates: { canonical: `${BRAND.siteUrl}/delete-account` },
};

const SECTIONS: LegalSection[] = [
  {
    id: "request",
    heading: "How to request deletion",
    body: [
      `Write to ${CONTACT_EMAIL} from the email address your account uses, with the subject "Delete my account". Say whether you are a seeker (parent) or a coach — the account works the same way on either app.`,
      "We do not currently offer a self-service delete button in the app or on the website; every request is handled by a person, which is also why we ask you to write from your own account's address — it is how we confirm the request is really yours.",
      "We act on a verified request within 30 days.",
    ],
  },
  {
    id: "what-goes",
    heading: "What is deleted",
    body: ["Deleting your account removes:"],
    bullets: [
      "Your profile — name, phone number, city and area, and your photo.",
      "For a seeker: your requirement (subjects, learner age and level, budget, notes) and its history.",
      "For a coach: your listing, its certifications and availability, and your Space and its posts.",
      "Your groups, your messages, and your trial-class records.",
      "The account itself and its sign-in.",
    ],
  },
  {
    id: "what-stays",
    heading: "What we may keep",
    body: [
      "A minimal record where we are required to keep one — for example, an event entry already handed to an organiser, or a record needed to resolve a dispute or complaint that was already open when you asked to delete your account.",
      "Anything you sent inside a conversation stays legible to the other person in it, the same way a text message you sent does not vanish from someone else's phone. Deleting your account removes it from your side and removes your name and identity from it going forward.",
    ],
  },
  {
    id: "contact",
    heading: "Contact",
    body: [
      `Write to ${CONTACT_EMAIL} for a deletion request, or any question about it.`,
      `${BRAND.name} is run by ${BRAND.legalName}. See ${BRAND.siteUrl}/privacy for the full privacy notice.`,
    ],
  },
];

export default function DeleteAccountPage() {
  return (
    <LegalPage
      eyebrow="Account deletion"
      title="Delete your account"
      updated={UPDATED}
      intro="How to ask us to delete your Aspire91 account — seeker or coach — and what that does and does not remove."
      sections={SECTIONS}
    />
  );
}
