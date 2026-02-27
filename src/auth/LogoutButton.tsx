import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogOut, Loader2 } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";

const LogoutButton = () => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [loading, setLoading] = useState(false);

  const onLogout = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await signOut();
    } catch {
      // ignora erro de rede — limpa sessão local de qualquer forma
    } finally {
      navigate("/login", { replace: true });
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      onClick={onLogout}
      disabled={loading}
      className="gap-2 w-full"
      title="Sair"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <LogOut className="h-4 w-4" />
      )}
      Sair
    </Button>
  );
};

export default LogoutButton;
