import { useLocation } from "react-router-dom";
import {
  AppBar, Toolbar, Box, Typography, IconButton, Tooltip,
  Stack, Avatar,
} from "@mui/material";
import {
  NotificationsNoneRounded,
  HelpOutlineRounded,
  DarkModeRounded,
  LightModeRounded,
} from "@mui/icons-material";
import { useTheme } from "@/theme/ThemeContext";
import { useOrg } from "@/tenancy/OrgContext";

const PAGE_META: { match: string; section: string; title: string }[] = [
  { match: "/cnpj",             section: "Prospecção",  title: "Enriquecer CNPJ"    },
  { match: "/consulta-fiscal",  section: "Prospecção",  title: "Consulta Fiscal"    },
  { match: "/query-workbench",  section: "Prospecção",  title: "Query Workbench"    },
  { match: "/app",              section: "Prospecção",  title: "Configurar Busca"   },
  { match: "/dashboard",        section: "Análise",     title: "Dashboard"          },
  { match: "/results",          section: "Análise",     title: "Resultados"         },
  { match: "/lead-lists",       section: "Análise",     title: "Listas & Signals"   },
  { match: "/heatmap",          section: "Análise",     title: "Mapa de Calor"      },
  { match: "/pipeline",         section: "Pipeline",    title: "Pipeline"           },
  { match: "/history",          section: "Pipeline",    title: "Histórico"          },
  { match: "/comprar-creditos", section: "Conta",       title: "Créditos"           },
  { match: "/settings",         section: "Conta",       title: "Configurações"      },
  { match: "/admin",            section: "Master",      title: "Painel Admin"       },
];

function resolvePageMeta(pathname: string) {
  return (
    PAGE_META.find(({ match }) => pathname === match || pathname.startsWith(`${match}/`)) ??
    { section: "Workspace", title: "Painel" }
  );
}

const Header = () => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const { pathname } = useLocation();
  const { currentOrg } = useOrg();
  const page = resolvePageMeta(pathname);
  const initials = (currentOrg?.name?.[0] ?? "H").toUpperCase();

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        backgroundColor: isDark ? "rgba(15,15,15,0.92)" : "rgba(247,247,247,0.94)",
        backdropFilter: "blur(16px)",
        borderBottom: "1px solid",
        borderBottomColor: "divider",
        zIndex: 100,
      }}
    >
      <Toolbar sx={{ minHeight: "56px !important", px: { xs: 2, sm: 3 }, gap: 2 }}>

        {/* Breadcrumb */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: "0.625rem", fontWeight: 600, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.1em", lineHeight: 1 }}>
            {page.section}
          </Typography>
          <Stack direction="row" alignItems="center" gap={0.75} mt={0.4}>
            <Typography sx={{ fontWeight: 800, fontSize: "0.875rem", letterSpacing: "-0.025em", color: "text.primary", lineHeight: 1 }}>
              Hermes
            </Typography>
            <Typography sx={{ color: "text.disabled", fontSize: "0.875rem", lineHeight: 1 }}>/</Typography>
            <Typography sx={{ fontWeight: 500, fontSize: "0.875rem", color: "text.secondary", lineHeight: 1 }} noWrap>
              {page.title}
            </Typography>
          </Stack>
        </Box>

        {/* Actions */}
        <Stack direction="row" alignItems="center" gap={0.5}>
          <Tooltip title={isDark ? "Modo claro" : "Modo escuro"} placement="bottom">
            <IconButton size="small" onClick={toggleTheme} sx={{ color: "text.secondary" }}>
              {isDark
                ? <LightModeRounded sx={{ fontSize: 17 }} />
                : <DarkModeRounded sx={{ fontSize: 17 }} />}
            </IconButton>
          </Tooltip>

          <Tooltip title="Ajuda" placement="bottom">
            <IconButton size="small" sx={{ color: "text.secondary" }}>
              <HelpOutlineRounded sx={{ fontSize: 17 }} />
            </IconButton>
          </Tooltip>

          <Tooltip title="Notificações" placement="bottom">
            <IconButton size="small" sx={{ color: "text.secondary" }}>
              <NotificationsNoneRounded sx={{ fontSize: 17 }} />
            </IconButton>
          </Tooltip>

          {/* Divider */}
          <Box sx={{ width: 1, height: 20, backgroundColor: "divider", mx: 0.5 }} />

          {/* User pill */}
          <Stack
            direction="row"
            alignItems="center"
            gap={1}
            sx={{
              pl: 0.75, pr: 1.5, py: 0.5,
              borderRadius: "20px",
              border: "1px solid",
              borderColor: "divider",
              backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
              cursor: "default",
            }}
          >
            <Avatar sx={{ width: 26, height: 26, backgroundColor: "rgba(249,115,22,0.2)", color: "#F97316", fontSize: "0.6875rem", fontWeight: 700 }}>
              {initials}
            </Avatar>
            <Box sx={{ display: { xs: "none", sm: "block" }, minWidth: 0 }}>
              <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, color: "text.primary", lineHeight: 1 }} noWrap>
                {currentOrg?.name ?? "Hermes"}
              </Typography>
              <Typography sx={{ fontSize: "0.625rem", color: "text.secondary", lineHeight: 1.3 }} noWrap>
                {currentOrg?.role ?? "member"}
              </Typography>
            </Box>
          </Stack>
        </Stack>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
