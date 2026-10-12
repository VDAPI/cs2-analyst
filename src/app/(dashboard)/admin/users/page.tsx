import { Search } from "lucide-react";
import { Button, Input, PageHeader } from "@/components/ui";
import { AdminNav } from "@/components/admin/admin-nav";
import { AdminUsersList } from "@/components/admin/admin-users-list";
import { countAdminUploads, getAdminUsers, planLimitLabels } from "@/lib/admin/data";
import { getAdminUser } from "@/lib/admin/session";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const [admin, users, counts] = await Promise.all([getAdminUser(), getAdminUsers(q), countAdminUploads()]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Użytkownicy"
        description="Plan, wykorzystanie limitu w tym miesiącu i własny limit dem dla wybranych graczy."
      />
      <AdminNav failed={counts.failed} />

      <form action="/admin/users" className="flex gap-2 sm:max-w-md" role="search">
        <label htmlFor="admin-user-search" className="sr-only">
          Szukaj użytkownika
        </label>
        <Input
          id="admin-user-search"
          name="q"
          defaultValue={q}
          placeholder="Email, nick FACEIT, Steam ID"
          autoComplete="off"
        />
        <Button type="submit" variant="secondary" size="icon" aria-label="Szukaj" className="h-auto shrink-0">
          <Search className="h-4 w-4" aria-hidden />
        </Button>
      </form>

      <AdminUsersList users={users} selfId={admin?.id ?? ""} planLimits={planLimitLabels()} />
    </div>
  );
}
