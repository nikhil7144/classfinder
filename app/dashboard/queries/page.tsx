import ProviderTabs from "@/components/provider/ProviderTabs";
import QueryList from "@/components/queries/QueryList";

export default function ProviderQueriesPage() {
  return (
    // app/dashboard has no layout, so each page carries its own container.
    // This one did not, which is why it ran edge to edge and lost the tabs.
    <div className="min-h-screen bg-bg py-10">
      <div className="mx-auto max-w-5xl space-y-5 px-6">
        <ProviderTabs />

        <header className="cf-card p-7">
          <p className="cf-eyebrow">Queries</p>
          <h1 className="cf-display mt-2 text-2xl text-ink">Parents who want a call</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            They gave a number rather than starting a conversation. Ring them, book a time, or
            write instead — and mark where each one got to.
          </p>
        </header>

        <QueryList side="provider" />
      </div>
    </div>
  );
}
