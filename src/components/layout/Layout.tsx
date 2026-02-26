import { ReactNode } from "react";
import Header from "./Header";
import Sidebar from "./Sidebar";
import LogoutButton from "@/auth/LogoutButton";

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  return (
    <div className="min-h-screen flex flex-col w-full">
      {/* Header + botão sair */}
      <div className="relative">
        <Header />
        <div className="absolute right-4 top-1/2 -translate-y-1/2">
          <LogoutButton />
        </div>
      </div>

      <div className="flex flex-1 w-full">
        <Sidebar />
        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
};

export default Layout;
