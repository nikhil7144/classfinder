import Link from "next/link";

/**
 * What each side of the marketplace can do, on the landing page.
 *
 * Plain feature copy: a heading that names the thing, a sentence or two that
 * says what it does. Every line maps to something that ships — group
 * activation at two families, one open query per coach, Spaces readable
 * signed-out, drafts hidden until published.
 */

type Capability = { title: string; body: string };

type SectionProps = {
  eyebrow: string;
  heading: string;
  intro: string;
  items: Capability[];
  cta: { href: string; label: string };
  /**
   * The coaches' half sits on a raised band. That is the only thing dividing
   * the two: globals.css gives the coral gradient to primary actions and teal
   * to success, so a decorative tint here would borrow a meaning it lacks.
   */
  raised?: boolean;
};

function AudienceSection({ eyebrow, heading, intro, items, cta, raised = false }: SectionProps) {
  return (
    <section className={raised ? "border-y border-line bg-surface" : ""}>
      <div className="mx-auto max-w-5xl px-6 py-24">
        <p className="cf-eyebrow">{eyebrow}</p>

        <h2 className="cf-display mt-3 text-[clamp(1.7rem,3.4vw,2.4rem)] leading-[1.15] text-ink">
          {heading}
        </h2>

        <p className="mt-4 max-w-2xl leading-relaxed text-muted">{intro}</p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {items.map((item) => (
            /* cf-card is --surface, the band's own colour, so the raised half
               lifts its cards a step to keep the edges visible. */
            <div key={item.title} className={`cf-card p-6 ${raised ? "bg-surface-2" : ""}`}>
              <h3 className="font-display text-base font-bold text-ink">{item.title}</h3>
              <p className="mt-2.5 text-sm leading-6 text-muted">{item.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-10">
          <Link href={cta.href} className="cf-btn-primary inline-block">
            {cta.label}
          </Link>
        </div>
      </div>
    </section>
  );
}

const FOR_FAMILIES: Capability[] = [
  {
    title: "Create a group with neighbours",
    body: "Two families are enough to start a group. Say what you need, and share a coach between you.",
  },
  {
    title: "Contact a coach",
    body: "Send one request. The coach reads what you are looking for before they reply.",
  },
  {
    title: "Chat in the app",
    body: "When a coach replies, you get a chat with them. Groups get their own chat too.",
  },
  {
    title: "See a coach's Space",
    body: "Coaches post photos, videos and updates. You can read all of it without an account.",
  },
];

const FOR_COACHES: Capability[] = [
  {
    title: "See families looking for you",
    body: "Parents and groups near you who have already said what they want. Reply once, in one place.",
  },
  {
    title: "Get AI suggestions",
    body: "We put the families that fit you best at the top, with a short reason for each one.",
  },
  {
    title: "Run your own Space",
    body: "Post photos, videos and updates. Parents read it while they are deciding.",
  },
  {
    title: "Run events",
    body: "Create tournaments and workshops. Families enter through Aspire91.",
  },
];

export default function HomeAudiences() {
  return (
    <>
      <AudienceSection
        eyebrow="For families"
        heading="What you can do"
        intro="Searching is free and needs no account. With one, you can also do this."
        items={FOR_FAMILIES}
        cta={{ href: "/signup/seeker", label: "Join as a family" }}
      />

      <AudienceSection
        raised
        eyebrow="For coaches"
        heading="What you get"
        intro="Reach parents near you who are already looking for what you teach."
        items={FOR_COACHES}
        cta={{ href: "/for-coaches", label: "See how it works for coaches" }}
      />
    </>
  );
}
