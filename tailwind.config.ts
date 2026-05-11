import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

/* ============================================================================
   HERMES Tailwind config — Pinn Design System v1.0 (oficial)
   Tokens fonte: src/index.css (HSL via CSS vars + Pinn brand hex diretos)
   ============================================================================ */
export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: { "2xl": "1480px" },
    },
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono Variable", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        display: ["Inter", "system-ui", "sans-serif"],
      },

      /* Type scale px-based do DS — disponíveis como text-{key} */
      fontSize: {
        "pinn-hero":    ["72px", { lineHeight: "1.05", letterSpacing: "-0.02em" }],
        "pinn-display": ["56px", { lineHeight: "1.05", letterSpacing: "-0.02em" }],
        "pinn-h1":      ["36px", { lineHeight: "1.15", letterSpacing: "-0.01em" }],
        "pinn-h2":      ["28px", { lineHeight: "1.15", letterSpacing: "-0.01em" }],
        "pinn-h3":      ["22px", { lineHeight: "1.15" }],
        "pinn-h4":      ["18px", { lineHeight: "1.45" }],
        "pinn-body":    ["16px", { lineHeight: "1.45" }],
        "pinn-sm":      ["14px", { lineHeight: "1.45" }],
        "pinn-caption": ["12px", { lineHeight: "1.45" }],
        "pinn-eyebrow": ["12px", { lineHeight: "1.45", letterSpacing: "0.08em" }],
      },

      letterSpacing: {
        tight: "-0.01em",
        tighter: "-0.02em",
        wide: "0.08em",
      },

      /* Spacing 8pt baseline — semântico Pinn (Tailwind default já cobre numéricos) */
      spacing: {
        "pinn-section":   "96px",
        "pinn-paragraph": "24px",
      },

      /* Radii do DS (2/4/8/12/20) */
      borderRadius: {
        "pinn-1": "2px",
        "pinn-2": "4px",
        "pinn-3": "8px",
        "pinn-4": "12px",
        "pinn-5": "20px",
        "pinn-pill": "999px",
        /* shadcn compat — mantém escala mas atrelada ao novo --radius (8px) */
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },

      /* Sombras DS */
      boxShadow: {
        "pinn-0": "0 0 0 1px rgba(26,26,26,0.04)",
        "pinn-1": "0 1px 2px rgba(26,26,26,0.06), 0 0 0 1px rgba(26,26,26,0.04)",
        "pinn-2": "0 4px 16px rgba(26,26,26,0.06), 0 0 0 1px rgba(26,26,26,0.04)",
        "pinn-3": "0 12px 32px rgba(26,26,26,0.08), 0 0 0 1px rgba(26,26,26,0.04)",
        "pinn-orange": "0 8px 24px rgba(255,107,53,0.22)",
      },

      /* Motion */
      transitionTimingFunction: {
        "pinn":     "cubic-bezier(.2,.7,.2,1)",
        "pinn-out": "cubic-bezier(.16,1,.3,1)",
      },
      transitionDuration: {
        "pinn-fast": "120ms",
        "pinn-base": "200ms",
        "pinn-slow": "360ms",
      },

      /* Cores — shadcn (HSL via CSS vars) + Pinn brand (hex direto) */
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        chart: {
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
          3: "hsl(var(--chart-3))",
          4: "hsl(var(--chart-4))",
          5: "hsl(var(--chart-5))",
        },

        /* ──── Pinn brand (hex direto — fonte: Pinn DS oficial) ──── */
        pinn: {
          /* Orange */
          orange:      "#FF6B35",
          "orange-dark":  "#E55A2B",
          "orange-light": "#FFF3ED",
          "orange-700":   "#B8431F",
          "orange-50":    "#FFF8F4",

          /* Neutrals (light surfaces) */
          ink:      "#1A1A1A",
          "ink-2":  "#2C2C2C",
          graphite: "#555555",
          mute:     "#999999",
          rule:     "#E6E4E0",
          surface:  "#F6F4EF",
          paper:    "#FAF8F4",
          white:    "#FFFFFF",

          /* Night family (dark / BAI) */
          night:        "#0E0E0E",
          "night-2":    "#161616",
          "night-3":    "#1F1F1F",
          "night-rule": "#2A2A2A",
          "night-mute": "#6B6B6B",
          "night-fg":   "#F2F2F2",

          /* Functional */
          success: "#2E7D32",
          error:   "#C62828",
          warning: "#F57C00",
        },
      },

      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up":   { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        "pinn-fade-in":      { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "pinn-shimmer":      { from: { backgroundPosition: "200% 0" }, to: { backgroundPosition: "-200% 0" } },
        "pinn-pulse-orange": { "0%, 100%": { opacity: "0.55" }, "50%": { opacity: "1" } },
      },
      animation: {
        "accordion-down":    "accordion-down 0.2s ease-out",
        "accordion-up":      "accordion-up 0.2s ease-out",
        "pinn-fade-in":      "pinn-fade-in 360ms cubic-bezier(.16,1,.3,1) forwards",
        "pinn-shimmer":      "pinn-shimmer 1.8s ease-in-out infinite",
        "pinn-pulse-orange": "pinn-pulse-orange 2.5s ease-in-out infinite",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
