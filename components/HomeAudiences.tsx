import Link from "next/link";

/**
 * What the two sides of the marketplace can actually do here.
 *
 * The section above these lists what the product covers; a taxonomy of
 * subjects is what every directory has. These say what an account is for,
 * which is the part a visitor cannot infer from a grid of categories.
 *
 * Every claim below is a feature that exists — group activation at two
 * families, one open query per coach, Spaces readable signed-out, the
 * ranking that orders but does not select. Marketing copy that outruns the
 * build is a support ticket with a delay on it.
 */

type Capability = { title: string; body: string };

type SectionProps = {
  eyebrow: string;
  heading: string;
  intro: string;
  items: Capability[];
  cta: { href: string; label: string };
  /**
   * The coaches' half sits on a raised band. That is deliberately the only
   * thing separating the two audiences: globals.css gives the coral-to-gold
   * gradient to primary actions and teal to success, so a section that tinted
   * itself for decoration would be borrowing a meaning it does not have.
   */
  raised?: boolean;
};

function AudienceSection({ eyebrow, heading, intro, items, cta, raised = false }: SectionProps) {
  return (
    <section className={raised ? "border-y border-line bg-surface" : ""}>
      <div className="mx-auto max-w-5xl px-6 py-24">
        <p className="cf-eyebrow">{eyebrow}</p>

        <h2 className="cf-display mt-3 max-w-2xl text-[clamp(1.7rem,3.4vw,2.4rem)] leading-[1.15] text-ink">
          {heading}
        </h2>

        <p className="mt-4 max-w-2xl leading-relaxed text-muted">{intro}</p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {items.map((item, i) => (
            /* cf-card is --surface, which is the band's own colour, so the
               raised half lifts its cards a step to keep the edges visible. */
            <div key={item.title} className={`cf-card p-6 ${raised ? "bg-surface-2" : ""}`}>
              <p className="font-mono text-xs tracking-widest text-faint">
                {String(i + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-3 font-display text-base font-bold text-ink">{item.title}</h3>
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
    title: "Get your neighbours in on it",
    body:
      "Two families wanting the same thing already counts as a group, and it is a better deal " +
      "than either of you alone. Post what you are after, choose how long it stays open, and the " +
      "neighbours who join are in it with you.",
  },
  {
    title: "Ask a coach directly",
    body:
      "One open query per coach, carrying what you are looking for. They read it before they " +
      "answer, so the first reply is about your child rather than a request for the details you " +
      "have already given.",
  },
  {
    title: "Then talk it through",
    body:
      "A written reply opens a conversation. Groups get a chat of their own as well, so the " +
      "families who would share a coach can settle between themselves what they actually want.",
  },
  {
    title: "Read the Space before you commit",
    body:
      "Coaches post what they are really doing — sessions, results, photos, video. You can read " +
      "all of it signed out. An account is for following and replying, not for looking.",
  },
];

const FOR_COACHES: Capability[] = [
  {
    title: "See who is asking, near you",
    body:
      "Parents who have written down a requirement, and groups of neighbours who have got " +
      "together — narrowed to what you teach and where you teach it. Write once; they decide " +
      "whether to answer.",
  },
  {
    title: "Suggestions that say why",
    body:
      "Ask for your best matches and the ranking lifts the families worth your attention to the " +
      "top, each with a line explaining the placement. It does not choose who you can see — your " +
      "areas and services do that — it only orders them. Parents get the same thing pointed at " +
      "coaches.",
  },
  {
    title: "Run a Space",
    body:
      "A page of your own for sessions, results, photos and video. It is what a family reads " +
      "while deciding, and the one thing a directory entry cannot show them.",
  },
  {
    title: "Run events",
    body:
      "Tournaments, workshops and showcases, with the categories families enter through. A new " +
      "event is a draft nobody else can see until you publish it.",
  },
];

export default function HomeAudiences() {
  return (
    <>
      <AudienceSection
        eyebrow="For families"
        heading="Finding someone is the start, not the whole of it"
        intro="Searching is free and needs no account. What follows is what an account is for."
        items={FOR_FAMILIES}
        cta={{ href: "/signup/seeker", label: "Join as a family" }}
      />

      <AudienceSection
        raised
        eyebrow="For coaches and academies"
        heading="Families who have already said what they want"
        intro={
          "You are not working a cold list. Everyone here has written down what they need, near " +
          "where you teach it."
        }
        items={FOR_COACHES}
        cta={{ href: "/signup/provider", label: "List your classes" }}
      />
    </>
  );
}
