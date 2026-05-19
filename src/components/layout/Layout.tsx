import { ReactNode } from "react";
import Header from "./Header";
import Sidebar from "./Sidebar";
import { WelcomeWizard, useWizardState } from "@/components/onboarding/WelcomeWizard";

interface LayoutProps {
  children: ReactNode;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Layout — Pinn DS oficial v1.0
 * Background sólido (sem radial gradient — DS proíbe). Container 1480px.
 * Skip-link (MAI-17) — primeiro elemento focável; teclado pula sidebar + header.
 * WelcomeWizard (JUN 6.2) — mostra no 1º login (localStorage flag).
 * ────────────────────────────────────────────────────────────────────────── */
const Layout = ({ children }: LayoutProps) => {
  const wizard = useWizardState();

  return (
    <div className="min-h-screen flex w-full bg-background text-foreground">
      <a href="#main-content" className="skip-link">
        Pular para o conteúdo principal
      </a>
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <Header />
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
      <WelcomeWizard open={wizard.open} onDone={wizard.dismiss} orgName={wizard.orgName} />
    </div>
  );
};

export default Layout;
