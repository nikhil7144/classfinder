"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import PageSkeleton from "@/components/ui/PageSkeleton";

const navItems = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/providers", label: "Providers" },
  { href: "/admin/organisers", label: "Organisers" },
  { href: "/admin/locations", label: "Cities & Areas" },
  { href: "/admin/provider-categories", label: "Provider Categories" },
  { href: "/admin/service-categories", label: "Service Categories" },
  { href: "/admin/moderation", label: "Moderation" },
  { href: "/admin/audience", label: "Audience" },
  { href: "/admin/api-usage", label: "API Usage" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        router.push("/");
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userData.user.id)
        .single();

      if (data?.role !== "admin") {
        router.push("/");
      } else {
        setLoading(false);
      }
    };

    checkAdmin();
  }, [router]);

  if (loading) return <PageSkeleton variant="dashboard" />;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto flex min-h-screen max-w-7xl gap-6 px-6 py-6">
        <aside className="w-72 rounded-3xl bg-gray-900 p-6 text-white shadow-[0_10px_40px_rgba(0,0,0,0.16)]">
          <div className="mb-8">
            <p className="text-xs uppercase tracking-[0.24em] text-gray-400">ClassFinder</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight">Admin Panel</h2>
            <p className="mt-2 text-sm text-gray-400">
              Manage providers, taxonomy, and platform approvals.
            </p>
          </div>

          <nav className="space-y-2 text-sm">
            {navItems.map((item) => {
              const active = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-2xl px-4 py-3 transition ${
                    active
                      ? "bg-white text-gray-900 font-semibold"
                      : "text-gray-300 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1">
          <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm min-h-[calc(100vh-3rem)]">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
