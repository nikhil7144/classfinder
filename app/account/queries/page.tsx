import QueryList from "@/components/queries/QueryList";

export default function SeekerQueriesPage() {
  return (
    <div className="space-y-5">
      <header className="cf-card p-7">
        <p className="cf-eyebrow">Requests</p>
        <h1 className="cf-display mt-2 text-2xl text-ink">Coaches you asked to call</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Where each request got to. If a coach writes instead of calling, the conversation opens
          in your messages and says which request it came from.
        </p>
      </header>

      <QueryList side="seeker" />
    </div>
  );
}
