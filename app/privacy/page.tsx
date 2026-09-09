import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "@/components/LegalPage";
import { BRAND } from "@/lib/brand";

/**
 * The privacy notice.
 *
 * Written against the schema rather than from a template: every claim below
 * was checked against db/ and api/. Where the code does something a reader
 * would not expect — seeker photo buckets are public-read, and the ranking
 * sends a learner's age and the parent's notes to Google — it says so.
 *
 * NOT legal advice and not reviewed by a lawyer. India's DPDP Act treats
 * anyone under 18 as a child and requires verifiable parental consent, and it
 * prohibits profiling of children; whether the AI ranking counts is a question
 * for counsel, not for this file. See the note in `app/terms/page.tsx` too.
 */

/** Must be a mailbox somebody reads. noreply@ is not a grievance address. */
const CONTACT_EMAIL = "privacy@aspire91.com";

const UPDATED = "9 September 2026";

export const metadata: Metadata = {
  title: `Privacy — ${BRAND.name}`,
  description:
    "What Aspire91 collects, what a coach can and cannot see, when a phone number is shared, and what we hold about a child.",
  alternates: { canonical: `${BRAND.siteUrl}/privacy` },
};

const SECTIONS: LegalSection[] = [
  {
    id: "children",
    heading: "Children",
    body: [
      "This is the part most parents want first, so it goes first.",
      "A child does not have an account here. The account belongs to you, the adult, and everything on it is entered by you.",
      "We hold two things about the child you are looking for classes for: their age, and their level — beginner, improver and so on. That is the whole of it.",
    ],
    bullets: [
      "We do not ask for, and cannot store, a child's name. There is no field for it.",
      "We do not hold a child's photograph, school, class section, or any contact detail for them.",
      "A coach never receives a way to contact a child. They can reach you, and only in the ways described below.",
      "Nothing about a child is shown on a public page.",
    ],
  },
  {
    id: "phone",
    heading: "Your phone number, and when a coach gets it",
    body: [
      "Your number is never given to a coach automatically. Sharing it is a separate decision you make, one request at a time, and it is off unless you switch it on.",
      "Until you share it, a coach replies to you inside Aspire91 and cannot see the number at all — not on your profile, not on your request, not in the list of families they browse.",
    ],
    bullets: [
      "Contacting a coach does not share your number. Sharing is a separate switch on that request, off by default.",
      "Starting a group does not share your number. The same switch sits on the group, also off by default.",
      "You can turn sharing off again after turning it on. A coach who has already written it down is beyond our reach, which is why the switch exists before the first message rather than after.",
      "A coach can never see the number of a parent who has not shared it with that coach. Sharing with one coach does not share with another.",
    ],
  },
  {
    id: "collect",
    heading: "What we collect",
    body: ["From a parent, when you choose to give it:"],
    bullets: [
      "Your email address, which is how you sign in.",
      "Your name, your city and area, and a profile photo if you upload one.",
      "What you are looking for: subjects, the learner's age and level, preferred days and times, whether you want classes at home or at a centre, and a budget range.",
      "Anything you type into a notes field or a message.",
      "Your phone number, if you enter one. See the section above for who can see it.",
    ],
  },
  {
    id: "coaches",
    heading: "What a coach can see",
    body: [
      "A coach who teaches what you are looking for, in an area they cover, can see your requirement: the subjects, the learner's age and level, your area, your preferred days and times, your budget range, and your notes. That is the point of the product — it is what lets them answer you properly instead of asking you to repeat yourself.",
      "They see your name once you contact them or join a group they can see. They see your phone number only if you have shared it on that request.",
    ],
  },
  {
    id: "photos",
    heading: "Photographs",
    body: [
      "Profile photos and anything posted to a coach's Space are stored in public buckets. That means the file itself is reachable by anyone who has its address, even though your profile is not listed publicly and is not indexed by search engines.",
      "We are telling you this plainly rather than burying it: if you would not want a photograph to be reachable by a link, do not upload it. This applies to a parent's profile photo as much as to a coach's.",
      "Uploads are capped at 5 MB and must be images.",
    ],
  },
  {
    id: "ai",
    heading: "The suggestions, and what goes to Google",
    body: [
      "When a ranking is produced — coaches sorted for a parent, or families sorted for a coach — the requirement is sent to Google's Gemini model, which returns an order and a short reason for each.",
      "What is sent is deliberately stripped of identity. It carries the subjects wanted, the area, the distance, the learner's age and level, preferred days and times, the budget, the number of students, and anything typed into the notes field.",
    ],
    bullets: [
      "No name, email address or phone number is sent, for the parent or the child.",
      "A coach's public listing details are sent when ranking families for them — the name on their listing, what they teach, their areas, fees and availability.",
      "The model orders a list we have already decided you are allowed to see. It does not decide who is eligible; your areas and subjects do.",
      "Because free-text notes are sent as written, do not type anything into a notes field you would not want leaving the platform.",
    ],
  },
  {
    id: "messages",
    heading: "Messages",
    body: [
      "Messages between you and a coach, and messages in a group chat, are stored so both sides can read the conversation later. Group messages are visible to the members of that group.",
      "We may read a conversation where it is reported to us, to deal with the report.",
    ],
  },
  {
    id: "keeping",
    heading: "How long we keep things, and deleting your account",
    body: [
      "We keep your account and its contents while the account exists. Deleting your account removes your profile, your requirement and your groups.",
      "Ask us at the address at the bottom and we will delete your account. We may keep a minimal record where we are required to.",
    ],
  },
  {
    id: "rights",
    heading: "Your rights",
    body: [
      "India's Digital Personal Data Protection Act gives you the right to know what we hold about you, to have it corrected, to have it erased, and to withdraw a consent you gave earlier. Withdrawing consent to share a phone number is a switch you control yourself; for anything else, write to us.",
      "If you are not satisfied with how we answer, you may complain to the Data Protection Board of India.",
    ],
  },
  {
    id: "contact",
    heading: "Contact",
    body: [
      `Write to ${CONTACT_EMAIL} for anything on this page — a question, a correction, a deletion, or a complaint.`,
      `${BRAND.name} is run by ${BRAND.legalName}.`,
    ],
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Privacy"
      title="What we collect, and who sees it"
      updated={UPDATED}
      intro="A short notice, written to be read. It says what we hold about you and your child, what a coach can see, and when — if ever — your phone number reaches them."
      sections={SECTIONS}
    />
  );
}
