import { createTheme, alpha } from "@mui/material/styles";

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
const PINN_BLACK  = "#111111";

export const pinnTheme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main:        PINN_ORANGE,
      light:       "#FB923C",
      dark:        "#C2410C",
      contrastText: "#ffffff",
    },
    secondary: {
      main:        "#2A2A2A",
      light:       "#3A3A3A",
      dark:        "#1A1A1A",
      contrastText: "#F0F0F0",
    },
    background: {
      default: "#0F0F0F",
      paper:   "#181818",
    },
    text: {
      primary:   "#F0F0F0",
      secondary: "#9A9A9A",
      disabled:  "#555555",
    },
    divider: "rgba(255,255,255,0.07)",
    success: { main: "#22C55E", contrastText: "#fff" },
    warning: { main: "#F59E0B", contrastText: "#fff" },
    error:   { main: "#EF4444", contrastText: "#fff" },
    info:    { main: "#3B82F6", contrastText: "#fff" },
    pinn: {
      orange:      PINN_ORANGE,
      orangeLight: "#FEF0E6",
      orangeDark:  "#C2410C",
      black:       PINN_BLACK,
      surface1:    "#181818",
      surface2:    "#202020",
      surface3:    "#282828",
      border:      "rgba(255,255,255,0.07)",
      borderStrong:"rgba(255,255,255,0.14)",
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
    caption: { fontSize: "0.6875rem", letterSpacing: "0.01em", color: "#9A9A9A" },
    overline: { fontSize: "0.625rem", fontWeight: 600, letterSpacing: "0.1em" },
    button: { fontWeight: 600, letterSpacing: "-0.01em", textTransform: "none" },
  },

  shape: { borderRadius: 8 },

  shadows: [
    "none",
    "0 1px 2px rgba(0,0,0,0.4)",
    "0 2px 4px rgba(0,0,0,0.4)",
    "0 4px 8px rgba(0,0,0,0.4)",
    "0 6px 12px rgba(0,0,0,0.4)",
    "0 8px 16px rgba(0,0,0,0.4)",
    "0 12px 24px rgba(0,0,0,0.4)",
    "0 16px 32px rgba(0,0,0,0.4)",
    "0 20px 40px rgba(0,0,0,0.4)",
    "0 24px 48px rgba(0,0,0,0.4)",
    "0 28px 56px rgba(0,0,0,0.4)",
    "0 32px 64px rgba(0,0,0,0.4)",
    "0 36px 72px rgba(0,0,0,0.4)",
    "0 40px 80px rgba(0,0,0,0.4)",
    "0 44px 88px rgba(0,0,0,0.4)",
    "0 48px 96px rgba(0,0,0,0.4)",
    "0 52px 104px rgba(0,0,0,0.4)",
    "0 56px 112px rgba(0,0,0,0.4)",
    "0 60px 120px rgba(0,0,0,0.4)",
    "0 64px 128px rgba(0,0,0,0.4)",
    "0 68px 136px rgba(0,0,0,0.4)",
    "0 72px 144px rgba(0,0,0,0.4)",
    "0 76px 152px rgba(0,0,0,0.4)",
    "0 80px 160px rgba(0,0,0,0.4)",
    "0 84px 168px rgba(0,0,0,0.4)",
  ],

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        "*": { boxSizing: "border-box" },
        "html, body, #root": { height: "100%", margin: 0, padding: 0 },
        body: {
          backgroundColor: "#0F0F0F",
          color: "#F0F0F0",
          fontFamily: '"Inter", system-ui, sans-serif',
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
        },
        "::-webkit-scrollbar": { width: "5px", height: "5px" },
        "::-webkit-scrollbar-track": { background: "transparent" },
        "::-webkit-scrollbar-thumb": { background: "rgba(255,255,255,0.12)", borderRadius: "4px" },
        "::-webkit-scrollbar-thumb:hover": { background: "rgba(255,255,255,0.2)" },
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
            borderColor: "rgba(255,255,255,0.12)",
            color: "#D0D0D0",
            "&:hover": { borderColor: "rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.04)" },
          }),
          ...(ownerState.variant === "text" && {
            color: "#B0B0B0",
            "&:hover": { background: "rgba(255,255,255,0.05)", color: "#F0F0F0" },
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
          "&:hover": { background: "rgba(255,255,255,0.06)" },
        },
      },
    },

    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: "#181818",
          border: "1px solid rgba(255,255,255,0.07)",
        },
        elevation1: { boxShadow: "0 1px 3px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)" },
        elevation2: { boxShadow: "0 2px 6px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)" },
        elevation3: { boxShadow: "0 4px 12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.07)" },
      },
    },

    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: "#181818",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 12,
          transition: "border-color 0.2s ease, box-shadow 0.2s ease",
          "&:hover": {
            borderColor: "rgba(255,255,255,0.12)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
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
          backgroundColor: "#111111",
          borderRight: "1px solid rgba(255,255,255,0.07)",
          backgroundImage: "none",
        },
      },
    },

    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: "#111111",
          backgroundImage: "none",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          boxShadow: "none",
        },
      },
    },

    MuiTextField: {
      defaultProps: { variant: "outlined", size: "small" },
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            backgroundColor: "#1E1E1E",
            borderRadius: 8,
            fontSize: "0.875rem",
            "& fieldset": { borderColor: "rgba(255,255,255,0.1)" },
            "&:hover fieldset": { borderColor: "rgba(255,255,255,0.2)" },
            "&.Mui-focused fieldset": { borderColor: PINN_ORANGE, borderWidth: 1.5 },
          },
          "& .MuiInputLabel-root": { fontSize: "0.875rem", color: "#888" },
          "& .MuiInputLabel-root.Mui-focused": { color: PINN_ORANGE },
        },
      },
    },

    MuiSelect: {
      defaultProps: { size: "small" },
      styleOverrides: {
        root: {
          backgroundColor: "#1E1E1E",
          borderRadius: 8,
          fontSize: "0.875rem",
          "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.1)" },
          "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.2)" },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: PINN_ORANGE, borderWidth: 1.5 },
        },
      },
    },

    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontWeight: 500,
          fontSize: "0.75rem",
        },
        filled: {
          backgroundColor: "rgba(249,115,22,0.15)",
          color: "#FB923C",
          "&:hover": { backgroundColor: "rgba(249,115,22,0.22)" },
        },
        outlined: {
          borderColor: "rgba(255,255,255,0.12)",
          color: "#C0C0C0",
        },
      },
    },

    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: "#282828",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 6,
          fontSize: "0.75rem",
          padding: "6px 10px",
        },
        arrow: { color: "#282828" },
      },
    },

    MuiDivider: {
      styleOverrides: { root: { borderColor: "rgba(255,255,255,0.07)" } },
    },

    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          margin: "1px 8px",
          padding: "8px 12px",
          transition: "all 0.15s ease",
          "&:hover": { backgroundColor: "rgba(255,255,255,0.05)" },
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
      styleOverrides: { root: { minWidth: 36, color: "#707070" } },
    },

    MuiListItemText: {
      styleOverrides: {
        primary: { fontSize: "0.875rem", fontWeight: 500 },
        secondary: { fontSize: "0.75rem" },
      },
    },

    MuiTabs: {
      styleOverrides: {
        root: { minHeight: 40, borderBottom: "1px solid rgba(255,255,255,0.07)" },
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
          color: "#888",
          padding: "8px 16px",
          "&.Mui-selected": { color: "#F0F0F0", fontWeight: 600 },
        },
      },
    },

    MuiTableHead: {
      styleOverrides: {
        root: {
          "& .MuiTableCell-root": {
            backgroundColor: "#141414",
            color: "#888",
            fontSize: "0.6875rem",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
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
            "&:hover": { backgroundColor: "rgba(255,255,255,0.025)" },
          },
          "& .MuiTableCell-root": {
            borderBottom: "1px solid rgba(255,255,255,0.05)",
            padding: "12px 16px",
            fontSize: "0.8125rem",
          },
        },
      },
    },

    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 8, fontSize: "0.875rem" },
        standardInfo: { backgroundColor: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", color: "#93C5FD" },
        standardSuccess: { backgroundColor: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", color: "#86EFAC" },
        standardWarning: { backgroundColor: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", color: "#FCD34D" },
        standardError: { backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#FCA5A5" },
      },
    },

    MuiLinearProgress: {
      styleOverrides: {
        root: { borderRadius: 4, height: 4, backgroundColor: "rgba(255,255,255,0.07)" },
        bar: { borderRadius: 4, background: `linear-gradient(90deg, ${PINN_ORANGE}, #FB923C)` },
      },
    },

    MuiCircularProgress: {
      defaultProps: { color: "primary" },
    },

    MuiSkeleton: {
      styleOverrides: {
        root: { backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 6 },
      },
    },

    MuiBadge: {
      styleOverrides: {
        badge: {
          fontSize: "0.625rem",
          fontWeight: 700,
          minWidth: 18,
          height: 18,
          padding: "0 4px",
        },
      },
    },

    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundColor: "#202020",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 10,
          boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
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
          "&:hover": { backgroundColor: "rgba(255,255,255,0.06)" },
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
        track: { borderRadius: 10, backgroundColor: "#404040", opacity: 1 },
      },
    },
  },
});
