import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { useMemo } from "react";
import { ThemeProvider as MuiThemeProvider, CssBaseline } from "@mui/material";
import { AuthProvider } from "@/auth/AuthContext";
import { OrgProvider } from "@/tenancy/OrgContext";
import { ThemeProvider, useTheme } from "@/theme/ThemeContext";
import { createPinnTheme } from "@/theme/pinnTheme";
import App from "./App";
import "./index.css";

/** Lê o modo do ThemeContext e passa para o MUI dinamicamente */
function DynamicMuiTheme({ children }: { children: React.ReactNode }) {
  const { theme: mode } = useTheme();
  const muiTheme = useMemo(() => createPinnTheme(mode), [mode]);
  return (
    <MuiThemeProvider theme={muiTheme}>
      <CssBaseline />
      {children}
    </MuiThemeProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <ThemeProvider>
      <DynamicMuiTheme>
        <AuthProvider>
          <OrgProvider>
            <App />
          </OrgProvider>
        </AuthProvider>
      </DynamicMuiTheme>
    </ThemeProvider>
  </BrowserRouter>
);
