import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText,
  Typography, Divider, Tooltip, Avatar, Stack, alpha,
} from "@mui/material";
import {
  Dashboard as DashboardIcon,
  TuneRounded,
  DescriptionRounded,
  AccountTreeRounded,
  HistoryRounded,
  MapRounded,
  SettingsRounded,
  ShieldRounded,
  SearchRounded,
  BalanceRounded,
  TerminalRounded,
  ArchiveRounded,
  LogoutRounded,
  BusinessRounded,
  ExpandMoreRounded,
} from "@mui/icons-material";
import {
  Select, MenuItem, FormControl,
} from "@mui/material";
import { useOrg } from "@/tenancy/OrgContext";
import { supabase } from "@/lib/supabase";
import { useTheme as useAppTheme } from "@/theme/ThemeContext";
import { LightModeRounded, DarkModeRounded } from "@mui/icons-material";

const DRAWER_WIDTH = 248;

const NAV = [
  {
    section: "Prospecção",
    items: [
      { icon: TuneRounded,      label: "Configurar Busca",   path: "/app" },
      { icon: DashboardIcon,    label: "Dashboard",          path: "/dashboard" },
      { icon: DescriptionRounded, label: "Resultados",       path: "/results" },
      { icon: ArchiveRounded,   label: "Listas & Signals",   path: "/lead-lists", masterOnly: true },
    ],
  },
  {
    section: "Pipeline",
    items: [
      { icon: AccountTreeRounded, label: "Pipeline",         path: "/pipeline" },
      { icon: HistoryRounded,     label: "Histórico",        path: "/history" },
    ],
  },
  {
    section: "Análise",
    items: [
      { icon: MapRounded,         label: "Mapa de Calor",    path: "/heatmap",   adminOnly: true },
    ],
  },
  {
    section: "Conta",
    items: [
      { icon: SettingsRounded,    label: "Configurações",    path: "/settings",  adminOnly: true },
    ],
  },
];

const MASTER_NAV = [
  { icon: SearchRounded,    label: "Enriquecer CNPJ",    path: "/cnpj" },
  { icon: BalanceRounded,   label: "Consulta Fiscal",    path: "/consulta-fiscal" },
  { icon: TerminalRounded,  label: "Query Workbench",    path: "/query-workbench" },
  { icon: ShieldRounded,    label: "Painel Admin",       path: "/admin" },
];

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { orgs, orgId, setOrgId, currentOrg, isMaster } = useOrg();
  const [userEmail, setUserEmail] = useState<string>("");

  const { toggleTheme, theme: appTheme } = useAppTheme();
  const isDark = appTheme === "dark";
  const role = currentOrg?.role ?? "member";
  const isAdmin = role === "admin" || role === "owner";

  useEffect(() => {
    supabase?.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? ""));
  }, []);

  const isActive = (path: string) => location.pathname === path;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        "& .MuiDrawer-paper": {
          width: DRAWER_WIDTH,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "background.default",
          borderRight: "1px solid",
          borderRightColor: "divider",
        },
      }}
    >
      {/* ── Logo ── */}
      <Box sx={{ px: 2.5, py: 2, borderBottom: "1px solid", borderBottomColor: "divider" }}>
        <Stack direction="row" alignItems="center" gap={1.5}>
          <Box
            sx={{
              width: 32, height: 32, borderRadius: "9px",
              background: "linear-gradient(135deg, #F97316, #EA580C)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
              boxShadow: "0 2px 8px rgba(249,115,22,0.35)",
            }}
          >
            <Typography sx={{ color: "#fff", fontWeight: 800, fontSize: "0.875rem", letterSpacing: "-0.02em" }}>H</Typography>
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: "0.9375rem", letterSpacing: "-0.02em", color: "text.primary", lineHeight: 1.2 }}>
              Hermes
            </Typography>
            <Typography sx={{ fontSize: "0.625rem", color: "text.secondary", fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Pinn Product Builder
            </Typography>
          </Box>
        </Stack>
      </Box>

      {/* ── Org selector ── */}
      {orgs.length > 1 ? (
        <Box sx={{ px: 1.5, py: 1.5, borderBottom: "1px solid", borderBottomColor: "divider" }}>
          <Typography sx={{ fontSize: "0.625rem", fontWeight: 600, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.08em", mb: 0.75, px: 0.5 }}>
            Organização
          </Typography>
          <FormControl size="small" fullWidth>
            <Select
              value={orgId ?? ""}
              onChange={e => setOrgId(e.target.value)}
              displayEmpty
              sx={{ fontSize: "0.8125rem" }}
              startAdornment={<BusinessRounded sx={{ fontSize: 14, color: "text.secondary", mr: 0.75 }} />}
            >
              {orgs.map(o => (
                <MenuItem key={o.id} value={o.id} sx={{ fontSize: "0.8125rem" }}>{o.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      ) : currentOrg && (
        <Box sx={{ px: 2, py: 1.25, borderBottom: "1px solid", borderBottomColor: "divider", display: "flex", alignItems: "center", gap: 1 }}>
          <BusinessRounded sx={{ fontSize: 13, color: "text.secondary" }} />
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", fontWeight: 500 }} noWrap>{currentOrg.name}</Typography>
        </Box>
      )}


      {/* ── Nav ── */}
      <Box sx={{ flex: 1, overflowY: "auto", py: 1 }}>
        {NAV.map(group => {
          const visibleItems = group.items.filter(item => {
            if (item.masterOnly && !isMaster) return false;
            if (item.adminOnly && !isAdmin && !isMaster) return false;
            return true;
          });
          if (visibleItems.length === 0) return null;
          return (
            <Box key={group.section} sx={{ mb: 0.5 }}>
              <Typography sx={{
                fontSize: "0.625rem", fontWeight: 600, color: isDark ? "#3A3A3A" : "#888",
                textTransform: "uppercase", letterSpacing: "0.08em",
                px: 2.5, py: 0.75, mt: 0.5,
              }}>
                {group.section}
              </Typography>
              <List dense disablePadding>
                {visibleItems.map(item => (
                  <ListItemButton
                    key={item.path}
                    selected={isActive(item.path)}
                    onClick={() => navigate(item.path)}
                    sx={{
                      mx: 1, mb: 0.25, borderRadius: "8px",
                      px: 1.5, py: 0.875,
                      "&.Mui-selected": {
                        backgroundColor: "rgba(249,115,22,0.1)",
                        "& .MuiListItemText-primary": { color: "primary.main", fontWeight: 600 },
                        "& .MuiListItemIcon-root": { color: "primary.main" },
                        "&:hover": { backgroundColor: "rgba(249,115,22,0.15)" },
                      },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 32, color: isActive(item.path) ? "primary.main" : "text.secondary" }}>
                      <item.icon sx={{ fontSize: 17 }} />
                    </ListItemIcon>
                    <ListItemText
                      primary={item.label}
                      primaryTypographyProps={{ fontSize: "0.8125rem", fontWeight: 500, color: isActive(item.path) ? "primary.main" : "text.secondary" }}
                    />
                  </ListItemButton>
                ))}
              </List>
            </Box>
          );
        })}

        {/* ── Master section ── */}
        {isMaster && (
          <Box sx={{ mt: 1 }}>
            <Divider sx={{ mx: 2, mb: 1, borderColor: "rgba(249,115,22,0.15)" }} />
            <Typography sx={{
              fontSize: "0.625rem", fontWeight: 600,
              color: "rgba(249,115,22,0.5)",
              textTransform: "uppercase", letterSpacing: "0.08em",
              px: 2.5, py: 0.75,
            }}>
              Master
            </Typography>
            <List dense disablePadding>
              {MASTER_NAV.map(item => (
                <ListItemButton
                  key={item.path}
                  selected={isActive(item.path)}
                  onClick={() => navigate(item.path)}
                  sx={{
                    mx: 1, mb: 0.25, borderRadius: "8px",
                    px: 1.5, py: 0.875,
                    "&.Mui-selected": {
                      backgroundColor: "rgba(249,115,22,0.1)",
                      "& .MuiListItemText-primary": { color: "primary.main", fontWeight: 600 },
                      "& .MuiListItemIcon-root": { color: "primary.main" },
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32, color: isActive(item.path) ? "primary.main" : "text.secondary" }}>
                    <item.icon sx={{ fontSize: 17 }} />
                  </ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{ fontSize: "0.8125rem", fontWeight: 500, color: isActive(item.path) ? "primary.main" : "text.secondary" }}
                  />
                </ListItemButton>
              ))}
            </List>
          </Box>
        )}
      </Box>

      {/* ── Footer ── */}
      <Box sx={{ borderTop: "1px solid", borderTopColor: "divider", p: 1.5 }}>
        <Stack direction="row" alignItems="center" gap={1.5} sx={{
          px: 1, py: 1, borderRadius: "10px",
          "&:hover": { backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)" },
        }}>
          <Avatar sx={{ width: 30, height: 30, backgroundColor: "rgba(249,115,22,0.15)", color: "primary.main", fontSize: "0.75rem", fontWeight: 700 }}>
            {(userEmail?.[0] ?? "U").toUpperCase()}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, color: "text.primary" }} noWrap>
              {currentOrg?.name ?? "Hermes"}
            </Typography>
            <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary" }} noWrap>
              {userEmail}
            </Typography>
          </Box>
          <Tooltip title={appTheme === "dark" ? "Modo claro" : "Modo escuro"} placement="top">
            <Box component="span" onClick={toggleTheme} sx={{ cursor: "pointer", display: "flex", alignItems: "center" }}>
              {appTheme === "dark"
                ? <LightModeRounded sx={{ fontSize: 15, color: "text.secondary", "&:hover": { color: "primary.main" }, transition: "color 0.15s" }} />
                : <DarkModeRounded  sx={{ fontSize: 15, color: "text.secondary", "&:hover": { color: "primary.main" }, transition: "color 0.15s" }} />
              }
            </Box>
          </Tooltip>
          <Tooltip title="Sair" placement="top">
            <LogoutRounded
              onClick={handleLogout}
              sx={{ fontSize: 15, color: "text.secondary", cursor: "pointer", "&:hover": { color: "error.main" }, transition: "color 0.15s" }}
            />
          </Tooltip>
        </Stack>
      </Box>
    </Drawer>
  );
}
