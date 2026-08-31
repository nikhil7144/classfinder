import Link from "next/link";

const cards = [
  {
    href: "/admin/providers",
    title: "Providers",
    description: "Approve, feature, or suspend coaches, tutors, coaching centers, and event planners.",
  },
  {
    href: "/admin/provider-categories",
    title: "Provider Categories",
    description: "Manage the self-description labels providers pick at signup (Coach, Home Tutor, Sports Academy, etc.).",
  },
  {
    href: "/admin/service-categories",
    title: "Service Categories",
    description: "Curate what providers actually teach or coach — sports, mind games, subjects, exams, and more.",
  },
  {
    href: "/admin/api-usage",
    title: "API Usage",
    description: "Token usage and estimated cost for AI-assisted matching.",
  },
];

export default function AdminDashboard() {
  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/60 to-transparent pointer-events-none" />
        <div className="relative z-10">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-gray-500">
            Admin Workspace
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-gray-900">
            Platform Control Center
          </h1>
          <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-gray-600">
            Manage provider approvals and the master data that powers profile creation and
            discovery.
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group rounded-3xl border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
          >
            <h2 className="text-xl font-semibold text-gray-900 group-hover:text-indigo-700">
              {card.title}
            </h2>
            <p className="mt-3 text-sm leading-6 text-gray-600">{card.description}</p>
            <div className="mt-6 inline-flex rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white">
              Open Section
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
