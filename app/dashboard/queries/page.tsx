import QueryList from "@/components/queries/QueryList";

export default function ProviderQueriesPage() {
  return (
    <div className="space-y-5">
      <header className="cf-card p-7">
        <p className="cf-eyebrow">Queries</p>
        <h1 className="cf-display mt-2 text-2xl text-ink">Parents who want a call</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          They gave a number rather than starting a conversation. Ring them, book a time, or write
          instead — and mark where each one got to, so this list stays a to-do rather than a pile.
        </p>
      </header>

      <QueryList side="provider" />
    </div>
  );
}
