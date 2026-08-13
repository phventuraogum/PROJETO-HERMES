import { alpha, Theme } from "@mui/material/styles";

/** Superfície de card alinhada ao modo claro/escuro */
export function cardSurface(theme: Theme, radius: number | string = 2) {
  return {
    border: "1px solid",
    borderColor: "divider",
    bgcolor: "background.paper",
    borderRadius: radius,
  } as const;
}

/** Faixa / linha com fundo sutil */
export function subtleRowBg(theme: Theme) {
  return theme.palette.mode === "dark"
    ? alpha(theme.palette.common.white, 0.02)
    : alpha(theme.palette.common.black, 0.03);
}

/** Input outlined denso (listas, admin, modais) */
export function denseOutlinedInput(theme: Theme) {
  const isDark = theme.palette.mode === "dark";
  return {
    "& .MuiOutlinedInput-root": {
      backgroundColor: isDark ? alpha(theme.palette.common.white, 0.03) : alpha(theme.palette.common.black, 0.04),
      fontSize: "0.8125rem",
    },
  };
}

/** Borda + fundo para drawers / painéis laterais */
export function drawerPaperSx(theme: Theme) {
  return {
    bgcolor: "background.default",
    borderLeft: "1px solid",
    borderColor: "divider",
  };
}

/** Tons semânticos aceitos pelos accents de chips/cards */
export type SemanticTone = "success" | "info" | "warning" | "error";

/** Accent de chip/badge a partir de um tom semântico da paleta */
export function semanticAccent(theme: Theme, tone: SemanticTone) {
  const main = theme.palette[tone].main;
  const color = theme.palette.mode === "dark" ? theme.palette[tone].light : theme.palette[tone].dark;
  return {
    color,
    bgcolor: alpha(main, theme.palette.mode === "dark" ? 0.16 : 0.1),
    border: `1px solid ${alpha(main, 0.32)}`,
    borderRadius: "8px",
  } as const;
}

/** Accent de chip/badge a partir de uma cor hex arbitrária */
export function semanticAccentHex(hex: string) {
  return {
    color: hex,
    bgcolor: alpha(hex, 0.12),
    border: `1px solid ${alpha(hex, 0.32)}`,
    borderRadius: "8px",
  } as const;
}

/** Caixa com leve fundo interno (linhas de listas, itens de resumo) */
export function softInsetBox(theme: Theme, radius: number | string = 1.5) {
  return {
    p: 1.5,
    borderRadius: radius,
    bgcolor: subtleRowBg(theme),
    border: "1px solid",
    borderColor: "divider",
  } as const;
}

/** Empty state com borda tracejada (listas/painéis sem dados) */
export function dashedEmptyState(theme: Theme) {
  return {
    p: 3,
    textAlign: "center",
    borderRadius: 2,
    border: `1px dashed ${theme.palette.divider}`,
    bgcolor: subtleRowBg(theme),
  } as const;
}

/** Card placeholder com borda tracejada (recurso ainda não resolvido) */
export function dashedPlaceholderCardSx(theme: Theme) {
  return {
    border: `1px dashed ${theme.palette.divider}`,
    bgcolor: subtleRowBg(theme),
    borderRadius: 2,
    boxShadow: "none",
  } as const;
}
