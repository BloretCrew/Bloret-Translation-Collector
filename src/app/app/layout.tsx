import { AppNavbar } from "@/components/layout/AppNavbar";
import { getSession } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <>
      <AppNavbar session={session} />
      <main className="app-main">
        <div className="blora-container blora-container--wide">{children}</div>
      </main>
    </>
  );
}
