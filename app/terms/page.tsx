import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "@/components/LegalPage";
import { BRAND } from "@/lib/brand";

/**
 * The terms of use.
 *
 * A companion to /privacy, and the second document Google asks for before it
 * will verify an OAuth consent screen. Same caveat: written against what the
 * product actually does, but not reviewed by a lawyer.
 */

const CONTACT_EMAIL = "support@aspire91.com";
const UPDATED = "9 September 2026";

export const metadata: Metadata = {
  title: `Terms — ${BRAND.name}`,
  description:
    "The terms for using Aspire91: who may hold an account, how listings are reviewed, what we do and do not do between a family and a coach.",
  alternates: { canonical: `${BRAND.siteUrl}/terms` },
};

const SECTIONS: LegalSection[] = [
  {
    id: "who",
    heading: "Who can use Aspire91",
    body: [
      "You must be 18 or older to hold an account. A parent or guardian holds the account and acts for the child they are finding classes for; a child does not sign up and does not have an account here.",
      "You are responsible for what is done through your account.",
    ],
  },
  {
    id: "what-we-are",
    heading: "What Aspire91 is, and is not",
    body: [
      "Aspire91 introduces families to coaches, tutors and academies near them. That is the whole of our role.",
      "The class itself is an arrangement between you and the coach. We are not a party to it. We do not set fees, take payment, employ coaches, supervise classes, or guarantee that any class happens or is any good.",
    ],
  },
  {
    id: "listings",
    heading: "Listings and review",
    body: [
      "A coach creates their own listing and is responsible for it being true. We read every listing before it becomes visible to families, and we may decline one, ask for changes, or take one down.",
      "That review is a check on the listing, not an endorsement, a background check, or a verification of qualifications. Satisfy yourself about anyone you are considering, as you would with any teacher.",
    ],
  },
  {
    id: "groups",
    heading: "Groups",
    body: [
      "Families can form a group to approach a coach together. A group needs two or more families, and the person who creates it sets how long it stays open.",
      "What the group then agrees with a coach is between them. We do not hold money for a group or divide fees.",
    ],
  },
  {
    id: "conduct",
    heading: "How to behave here",
    body: ["Using Aspire91 means not doing the following."],
    bullets: [
      "Posting anything false, misleading, unlawful, or that is not yours to post.",
      "Posting a photograph of a child without the right to do so.",
      "Using another person's account, or creating a listing for a business that is not yours.",
      "Collecting other people's details for advertising, or contacting anyone for anything other than the class they asked about.",
      "Trying to get round the review, the area rules, or anything else the product does on purpose.",
    ],
  },
  {
    id: "content",
    heading: "What you post",
    body: [
      "What you post stays yours. You give us permission to show it on Aspire91 — a coach's Space posts appear on their page and in the feeds families read, which is what those posts are for.",
      "We may hide or remove anything reported to us, and a post that gathers enough reports is hidden automatically while we look at it.",
    ],
  },
  {
    id: "fees",
    heading: "Fees",
    body: [
      "Listing on Aspire91 is free at the moment, and running events is free too while we are getting started. If that changes we will say so before it takes effect.",
      "Any fee a family pays for a class is paid to the coach directly. It does not pass through us.",
    ],
  },
  {
    id: "liability",
    heading: "Where we stand",
    body: [
      "Aspire91 is provided as it is. We do not promise it will be uninterrupted or error-free, and we are not responsible for what happens in a class or in any arrangement made through the introduction.",
      "Nothing here limits anything that cannot be limited under Indian law.",
    ],
  },
  {
    id: "ending",
    heading: "Ending it",
    body: [
      "You can stop using Aspire91 and ask us to delete your account at any time.",
      "We may suspend or close an account that breaks these terms, and we will say why unless there is a reason we cannot.",
    ],
  },
  {
    id: "law",
    heading: "Law",
    body: [
      "These terms are governed by the law of India, and the courts of India have jurisdiction over any dispute.",
    ],
  },
  {
    id: "contact",
    heading: "Contact",
    body: [
      `Write to ${CONTACT_EMAIL} with anything about these terms.`,
      `${BRAND.name} is run by ${BRAND.legalName}.`,
    ],
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Terms"
      title="Terms of use"
      updated={UPDATED}
      intro="What you can expect from Aspire91, and what we expect from you. Short, and in plain words."
      sections={SECTIONS}
    />
  );
}
