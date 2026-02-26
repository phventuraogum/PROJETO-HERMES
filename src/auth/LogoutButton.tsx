import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

function clearHermesAuth() {
  // limpa tudo que o RequireAuth considera token
  const keys = ["hermes_token", "token", "access_token", "auth_token"];
  keys.forEach((k) => localStorage.removeItem(k));
}

const LogoutButton = () => {
  const navigate = useNavigate();

  const onLogout = () => {
    clearHermesAuth();
    // demo mode: sem login; volta pro início
    navigate("/", { replace: true });
  };

  return (
    <Button
      type="button"
      variant="outline"
      onClick={onLogout}
      className="gap-2"
      title="Sair"
    >
      <LogOut className="h-4 w-4" />
      sair
    </Button>
  );
};

export default LogoutButton;
