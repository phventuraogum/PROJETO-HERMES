import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider as MuiThemeProvider, CssBaseline } from "@mui/material";
import { AuthProvider } from "@/auth/AuthContext";
import { OrgProvider } from "@/tenancy/OrgContext";
import { ThemeProvider } from "@/theme/ThemeContext";
import { pinnTheme } from "@/theme/pinnTheme";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <MuiThemeProvider theme={pinnTheme}>
      <CssBaseline />
      <ThemeProvider>
        <AuthProvider>
          <OrgProvider>
            <App />
          </OrgProvider>
        </AuthProvider>
      </ThemeProvider>
    </MuiThemeProvider>
  </BrowserRouter>
);
