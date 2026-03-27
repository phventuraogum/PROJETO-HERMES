import { createTheme } from "@mui/material/styles";

declare module "@mui/material/styles" {
  interface Palette {
    pinn: {
      orange: string;
      orangeLight: string;
      orangeDark: string;
      black: string;
      surface1: string;
      surface2: string;
      surface3: string;
      border: string;
      borderStrong: string;
    };
  }
  interface PaletteOptions {
    pinn?: {
      orange?: string;
      orangeLight?: string;
      orangeDark?: string;
      black?: string;
      surface1?: string;
      surface2?: string;
      surface3?: string;
      border?: string;
      borderStrong?: string;
    };
  }
}

const PINN_ORANGE = "#F97316";

export function createPinnTheme(mode: "light" | "dark") {
  const isDark = mode === "dark";

  return createTheme({
    palette: {
      mode,
      primary: {
        main:         PINN_ORANGE,
        light:        "#FB923C",
        dark:         "#C2410C",
        contrastText: "#ffffff",
      },
      secondary: {
        main:         isDark ? "#2A2A2A" : "#E8E8E8",
        light:        isDark ? "#3A3A3A" : "#F0F0F0",
        dark:         isDark ? "#1A1A1A" : "#D0D0D0",
        contrastText: isDark ? "#F0F0F0" : "#0A0A0A",
      },
      background: {
        default: isDark ? "#0F0F0F" : "#F7F7F7",
        paper:   isDark ? "#181818" : "#FFFFFF",
      },
      text: {
        primary:   isDark ? "#F0F0F0" : "#0A0A0A",
        secondary: isDark ? "#9A9A9A" : "#555555",
        disabled:  isDark ? "#555555" : "#AAAAAA",
      },
      divider: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)",
      success: { main: "#22C55E", contrastText: "#fff" },
      warning: { main: "#F59E0B", contrastText: "#fff" },
      error:   { main: "#EF4444", contrastText: "#fff" },
      info:    { main: "#3B82F6", contrastText: "#fff" },
      pinn: {
        orange:       PINN_ORANGE,
        orangeLight:  "#FEF0E6",
        orangeDark:   "#C2410C",
        black:        isDark ? "#111111" : "#0A0A0A",
        surface1:     isDark ? "#181818" : "#FFFFFF",
        surface2:     isDark ? "#202020" : "#F5F5F5",
        surface3:     isDark ? "#282828" : "#EEEEEE",
        border:       isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)",
        borderStrong: isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.14)",
      },
    },

    typography: {
      fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
      h1: { fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1 },
      h2: { fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.15 },
      h3: { fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.2 },
      h4: { fontWeight: 600, letterSpacing: "-0.015em", lineHeight: 1.25 },
      h5: { fontWeight: 600, letterSpacing: "-0.01em" },
      h6: { fontWeight: 600, letterSpacing: "-0.005em" },
      subtitle1: { fontWeight: 500, letterSpacing: "-0.005em" },
      subtitle2: { fontWeight: 500, fontSize: "0.8125rem" },
      body1: { letterSpacing: "-0.005em", lineHeight: 1.6 },
      body2: { fontSize: "0.8125rem", letterSpacing: "-0.003em", lineHeight: 1.55 },
      caption: { fontSize: "0.6875rem", letterSpacing: "0.01em" },
      overline: { fontSize: "0.625rem", fontWeight: 600, letterSpacing: "0.1em" },
      button: { fontWeight: 600, letterSpacing: "-0.01em", textTransform: "none" },
    },

    shape: { borderRadius: 8 },

    shadows: [
      "none",
      isDark ? "0 1px 2px rgba(0,0,0,0.4)"   : "0 1px 3px rgba(0,0,0,0.08)",
      isDark ? "0 2px 4px rgba(0,0,0,0.4)"   : "0 2px 6px rgba(0,0,0,0.08)",
      isDark ? "0 4px 8px rgba(0,0,0,0.4)"   : "0 4px 12px rgba(0,0,0,0.08)",
      isDark ? "0 6px 12px rgba(0,0,0,0.4)"  : "0 6px 16px rgba(0,0,0,0.08)",
      isDark ? "0 8px 16px rgba(0,0,0,0.4)"  : "0 8px 20px rgba(0,0,0,0.09)",
      isDark ? "0 12px 24px rgba(0,0,0,0.4)" : "0 12px 28px rgba(0,0,0,0.1)",
      isDark ? "0 16px 32px rgba(0,0,0,0.4)" : "0 16px 36px rgba(0,0,0,0.1)",
      isDark ? "0 20px 40px rgba(0,0,0,0.4)" : "0 20px 44px rgba(0,0,0,0.1)",
      isDark ? "0 24px 48px rgba(0,0,0,0.4)" : "0 24px 52px rgba(0,0,0,0.11)",
      isDark ? "0 28px 56px rgba(0,0,0,0.4)" : "0 28px 60px rgba(0,0,0,0.11)",
      isDark ? "0 32px 64px rgba(0,0,0,0.4)" : "0 32px 68px rgba(0,0,0,0.11)",
      isDark ? "0 36px 72px rgba(0,0,0,0.4)" : "0 36px 76px rgba(0,0,0,0.12)",
      isDark ? "0 40px 80px rgba(0,0,0,0.4)" : "0 40px 84px rgba(0,0,0,0.12)",
      isDark ? "0 44px 88px rgba(0,0,0,0.4)" : "0 44px 92px rgba(0,0,0,0.12)",
      isDark ? "0 48px 96px rgba(0,0,0,0.4)" : "0 48px 100px rgba(0,0,0,0.13)",
      isDark ? "0 52px 104px rgba(0,0,0,0.4)": "0 52px 108px rgba(0,0,0,0.13)",
      isDark ? "0 56px 112px rgba(0,0,0,0.4)": "0 56px 116px rgba(0,0,0,0.13)",
      isDark ? "0 60px 120px rgba(0,0,0,0.4)": "0 60px 124px rgba(0,0,0,0.14)",
      isDark ? "0 64px 128px rgba(0,0,0,0.4)": "0 64px 132px rgba(0,0,0,0.14)",
      isDark ? "0 68px 136px rgba(0,0,0,0.4)": "0 68px 140px rgba(0,0,0,0.14)",
      isDark ? "0 72px 144px rgba(0,0,0,0.4)": "0 72px 148px rgba(0,0,0,0.15)",
      isDark ? "0 76px 152px rgba(0,0,0,0.4)": "0 76px 156px rgba(0,0,0,0.15)",
      isDark ? "0 80px 160px rgba(0,0,0,0.4)": "0 80px 164px rgba(0,0,0,0.15)",
      isDark ? "0 84px 168px rgba(0,0,0,0.4)": "0 84px 172px rgba(0,0,0,0.16)",
    ],

    components: {
      MuiCssBaseline: {
        styleOverrides: {
          "*": { boxSizing: "border-box" },
          "html, body, #root": { height: "100%", margin: 0, padding: 0 },
          body: {
            backgroundColor: isDark ? "#0F0F0F" : "#F7F7F7",
            color: isDark ? "#F0F0F0" : "#0A0A0A",
            fontFamily: '"Inter", system-ui, sans-serif',
            WebkitFontSmoothing: "antialiased",
            MozOsxFontSmoothing: "grayscale",
          },
          "::-webkit-scrollbar": { width: "5px", height: "5px" },
          "::-webkit-scrollbar-track": { background: "transparent" },
          "::-webkit-scrollbar-thumb": {
            background: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.15)",
            borderRadius: "4px",
          },
          "::-webkit-scrollbar-thumb:hover": {
            background: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.25)",
          },
        },
      },

      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: ({ ownerState }) => ({
            borderRadius: 8,
            fontWeight: 600,
            fontSize: "0.8125rem",
            padding: "7px 16px",
            transition: "all 0.15s ease",
            ...(ownerState.variant === "contained" && ownerState.color === "primary" && {
              background: `linear-gradient(135deg, ${PINN_ORANGE}, #EA580C)`,
              "&:hover": { background: `linear-gradient(135deg, #FB923C, ${PINN_ORANGE})`, transform: "translateY(-1px)" },
            }),
            ...(ownerState.variant === "outlined" && {
              borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.15)",
              color: isDark ? "#D0D0D0" : "#333333",
              "&:hover": {
                borderColor: isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.3)",
                background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
              },
            }),
            ...(ownerState.variant === "text" && {
              color: isDark ? "#B0B0B0" : "#555555",
              "&:hover": {
                background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
                color: isDark ? "#F0F0F0" : "#0A0A0A",
              },
            }),
          }),
          sizeSmall: { fontSize: "0.75rem", padding: "5px 12px" },
          sizeLarge: { fontSize: "0.9375rem", padding: "10px 24px" },
        },
      },

      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            transition: "all 0.15s ease",
            "&:hover": { background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)" },
          },
        },
      },

      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
            backgroundColor: isDark ? "#181818" : "#FFFFFF",
            border: `1px solid ${isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)"}`,
          },
          elevation1: { boxShadow: isDark ? "0 1px 3px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)" : "0 1px 4px rgba(0,0,0,0.07)" },
          elevation2: { boxShadow: isDark ? "0 2px 6px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)" : "0 2px 8px rgba(0,0,0,0.08)" },
          elevation3: { boxShadow: isDark ? "0 4px 12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.07)" : "0 4px 16px rgba(0,0,0,0.09)" },
        },
      },

      MuiCard: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
            backgroundColor: isDark ? "#181818" : "#FFFFFF",
            border: `1px solid ${isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)"}`,
            borderRadius: 12,
            transition: "border-color 0.2s ease, box-shadow 0.2s ease",
            "&:hover": {
              borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)",
              boxShadow: isDark ? "0 4px 16px rgba(0,0,0,0.4)" : "0 4px 16px rgba(0,0,0,0.07)",
            },
          },
        },
      },

      MuiCardContent: {
        styleOverrides: { root: { padding: 20, "&:last-child": { paddingBottom: 20 } } },
      },

      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: isDark ? "#111111" : "#FAFAFA",
            borderRight: `1px solid ${isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)"}`,
            backgroundImage: "none",
          },
        },
      },

      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: isDark ? "#111111" : "#FAFAFA",
            backgroundImage: "none",
            borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)"}`,
            boxShadow: "none",
          },
        },
      },

      MuiTextField: {
        defaultProps: { variant: "outlined", size: "small" },
        styleOverrides: {
          root: {
            "& .MuiOutlinedInput-root": {
              backgroundColor: isDark ? "#1E1E1E" : "#F5F5F5",
              borderRadius: 8,
              fontSize: "0.875rem",
              "& fieldset": { borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.12)" },
              "&:hover fieldset": { borderColor: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.22)" },
              "&.Mui-focused fieldset": { borderColor: PINN_ORANGE, borderWidth: 1.5 },
            },
            "& .MuiInputLabel-root": { fontSize: "0.875rem", color: isDark ? "#888" : "#777" },
            "& .MuiInputLabel-root.Mui-focused": { color: PINN_ORANGE },
          },
        },
      },

      MuiSelect: {
        defaultProps: { size: "small" },
        styleOverrides: {
          root: {
            backgroundColor: isDark ? "#1E1E1E" : "#F5F5F5",
            borderRadius: 8,
            fontSize: "0.875rem",
            "& .MuiOutlinedInput-notchedOutline": { borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.12)" },
            "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.22)" },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: PINN_ORANGE, borderWidth: 1.5 },
          },
        },
      },

      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 6, fontWeight: 500, fontSize: "0.75rem" },
          filled: {
            backgroundColor: "rgba(249,115,22,0.15)",
            color: "#FB923C",
            "&:hover": { backgroundColor: "rgba(249,115,22,0.22)" },
          },
          outlined: {
            borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)",
            color: isDark ? "#C0C0C0" : "#444444",
          },
        },
      },

      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: isDark ? "#282828" : "#1A1A1A",
            border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)"}`,
            borderRadius: 6,
            fontSize: "0.75rem",
            padding: "6px 10px",
          },
          arrow: { color: isDark ? "#282828" : "#1A1A1A" },
        },
      },

      MuiDivider: {
        styleOverrides: { root: { borderColor: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)" } },
      },

      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            margin: "1px 8px",
            padding: "8px 12px",
            transition: "all 0.15s ease",
            "&:hover": { backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)" },
            "&.Mui-selected": {
              backgroundColor: "rgba(249,115,22,0.12)",
              color: PINN_ORANGE,
              "&:hover": { backgroundColor: "rgba(249,115,22,0.18)" },
              "& .MuiListItemIcon-root": { color: PINN_ORANGE },
            },
          },
        },
      },

      MuiListItemIcon: {
        styleOverrides: { root: { minWidth: 36, color: isDark ? "#707070" : "#999999" } },
      },

      MuiListItemText: {
        styleOverrides: {
          primary: { fontSize: "0.875rem", fontWeight: 500 },
          secondary: { fontSize: "0.75rem" },
        },
      },

      MuiTabs: {
        styleOverrides: {
          root: { minHeight: 40, borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)"}` },
          indicator: { backgroundColor: PINN_ORANGE, height: 2, borderRadius: "2px 2px 0 0" },
        },
      },

      MuiTab: {
        styleOverrides: {
          root: {
            minHeight: 40,
            textTransform: "none",
            fontWeight: 500,
            fontSize: "0.875rem",
            color: isDark ? "#888" : "#777",
            padding: "8px 16px",
            "&.Mui-selected": { color: isDark ? "#F0F0F0" : "#0A0A0A", fontWeight: 600 },
          },
        },
      },

      MuiTableHead: {
        styleOverrides: {
          root: {
            "& .MuiTableCell-root": {
              backgroundColor: isDark ? "#141414" : "#F0F0F0",
              color: isDark ? "#888" : "#666",
              fontSize: "0.6875rem",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)"}`,
              padding: "10px 16px",
            },
          },
        },
      },

      MuiTableBody: {
        styleOverrides: {
          root: {
            "& .MuiTableRow-root": {
              transition: "background 0.15s ease",
              "&:hover": { backgroundColor: isDark ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.02)" },
            },
            "& .MuiTableCell-root": {
              borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}`,
              padding: "12px 16px",
              fontSize: "0.8125rem",
            },
          },
        },
      },

      MuiAlert: {
        styleOverrides: {
          root: { borderRadius: 8, fontSize: "0.875rem" },
          standardInfo: {
            backgroundColor: isDark ? "rgba(59,130,246,0.1)" : "rgba(59,130,246,0.08)",
            border: "1px solid rgba(59,130,246,0.2)",
            color: isDark ? "#93C5FD" : "#2563EB",
          },
          standardSuccess: {
            backgroundColor: isDark ? "rgba(34,197,94,0.1)" : "rgba(34,197,94,0.08)",
            border: "1px solid rgba(34,197,94,0.2)",
            color: isDark ? "#86EFAC" : "#16A34A",
          },
          standardWarning: {
            backgroundColor: isDark ? "rgba(245,158,11,0.1)" : "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.2)",
            color: isDark ? "#FCD34D" : "#D97706",
          },
          standardError: {
            backgroundColor: isDark ? "rgba(239,68,68,0.1)" : "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
            color: isDark ? "#FCA5A5" : "#DC2626",
          },
        },
      },

      MuiLinearProgress: {
        styleOverrides: {
          root: {
            borderRadius: 4, height: 4,
            backgroundColor: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)",
          },
          bar: { borderRadius: 4, background: `linear-gradient(90deg, ${PINN_ORANGE}, #FB923C)` },
        },
      },

      MuiCircularProgress: { defaultProps: { color: "primary" } },

      MuiSkeleton: {
        styleOverrides: {
          root: {
            backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
            borderRadius: 6,
          },
        },
      },

      MuiBadge: {
        styleOverrides: {
          badge: { fontSize: "0.625rem", fontWeight: 700, minWidth: 18, height: 18, padding: "0 4px" },
        },
      },

      MuiMenu: {
        styleOverrides: {
          paper: {
            backgroundColor: isDark ? "#202020" : "#FFFFFF",
            border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
            borderRadius: 10,
            boxShadow: isDark ? "0 8px 32px rgba(0,0,0,0.6)" : "0 8px 32px rgba(0,0,0,0.1)",
            backgroundImage: "none",
          },
        },
      },

      MuiMenuItem: {
        styleOverrides: {
          root: {
            fontSize: "0.875rem",
            borderRadius: 6,
            margin: "2px 6px",
            padding: "7px 10px",
            "&:hover": { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)" },
            "&.Mui-selected": { backgroundColor: "rgba(249,115,22,0.12)", color: PINN_ORANGE },
          },
        },
      },

      MuiSwitch: {
        styleOverrides: {
          root: { width: 36, height: 20, padding: 0 },
          switchBase: {
            padding: 2,
            "&.Mui-checked": {
              transform: "translateX(16px)",
              color: "#fff",
              "& + .MuiSwitch-track": { backgroundColor: PINN_ORANGE, opacity: 1 },
            },
          },
          thumb: { width: 16, height: 16, boxShadow: "none" },
          track: { borderRadius: 10, backgroundColor: isDark ? "#404040" : "#CCCCCC", opacity: 1 },
        },
      },
    },
  });
}

// Default export mantido para compatibilidade
export const pinnTheme = createPinnTheme("dark");
