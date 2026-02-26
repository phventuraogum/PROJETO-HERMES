import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "@/auth/AuthContext";
import { OrgProvider } from "@/tenancy/OrgContext";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <AuthProvider>
      <OrgProvider>
        <App />
      </OrgProvider>
    </AuthProvider>
  </BrowserRouter>
);
