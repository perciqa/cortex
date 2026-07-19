import { Sidebar } from "@/components/Sidebar";
import { TopNav } from "@/components/TopNav";

export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <section id="content" className="main-content">
        <TopNav />
        <main className="page-main">{children}</main>
      </section>
    </div>
  );
}
