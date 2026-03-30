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
