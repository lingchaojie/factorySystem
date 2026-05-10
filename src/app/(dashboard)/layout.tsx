import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireUser();

  return (
    <AppShell
      user={{
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        workspaceName: user.workspace.name,
      }}
    >
      {children}
    </AppShell>
  );
}
