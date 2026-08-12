import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Collapse,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CheckIcon from "@mui/icons-material/Check";
import SearchIcon from "@mui/icons-material/Search";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import UnfoldLessIcon from "@mui/icons-material/UnfoldLess";
import DataObjectIcon from "@mui/icons-material/DataObject";

import type { Theme } from "@mui/material/styles";
import { alpha, useTheme } from "@mui/material/styles";

type Json =
  | string
  | number
  | boolean
  | null
  | undefined
  | Json[]
  | { [key: string]: Json };

interface Props {
  data: unknown;
  title?: string;
  /** Caminhos a destacar (matching parcial, case-insensitive). */
  highlight?: string[];
  /** Inicia tudo expandido (default `true` até nível 2). */
  defaultExpanded?: boolean;
  /** Botão de copiar JSON aparece. */
  showCopy?: boolean;
}

function valueKind(v: unknown, theme: Theme): { kind: string; color: string } {
  if (v === null) return { kind: "null", color: theme.palette.text.secondary };
  if (v === undefined) return { kind: "undef", color: theme.palette.text.secondary };
  if (Array.isArray(v))
    return { kind: `array(${v.length})`, color: theme.palette.secondary.main };
  if (typeof v === "object") {
    const len = Object.keys(v as object).length;
    return { kind: `obj(${len})`, color: theme.palette.info.main };
  }
  if (typeof v === "boolean") return { kind: "bool", color: theme.palette.success.main };
  if (typeof v === "number") return { kind: "num", color: theme.palette.warning.main };
  if (typeof v === "string") return { kind: "str", color: theme.palette.error.light };
  return { kind: typeof v, color: theme.palette.text.secondary };
}

function formatPrimitive(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (typeof v === "string") return v.length > 200 ? v.slice(0, 200) + "…" : v;
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  return JSON.stringify(v);
}

function shouldHighlight(path: string, highlight?: string[]): boolean {
  if (!highlight?.length) return false;
  const p = path.toLowerCase();
  return highlight.some((h) => p.includes(h.toLowerCase()));
}

function matchSearch(path: string, value: unknown, q: string): boolean {
  if (!q) return true;
  const Q = q.toLowerCase();
  if (path.toLowerCase().includes(Q)) return true;
  if (value !== null && typeof value !== "object") {
    return String(value).toLowerCase().includes(Q);
  }
  return false;
}

function CountSummary({ data }: { data: unknown }) {
  const stats = useMemo(() => {
    let total = 0;
    let filled = 0;
    let leafs = 0;

    const walk = (v: unknown) => {
      if (v === null || v === undefined) {
        total += 1;
        leafs += 1;
        return;
      }
      if (Array.isArray(v)) {
        total += 1;
        if (v.length > 0) filled += 1;
        v.forEach((it) => walk(it));
        return;
      }
      if (typeof v === "object") {
        total += 1;
        const keys = Object.keys(v as object);
        if (keys.length > 0) filled += 1;
        keys.forEach((k) => walk((v as Record<string, unknown>)[k]));
        return;
      }
      total += 1;
      leafs += 1;
      const s = String(v).trim();
      if (s !== "" && s !== "null" && s !== "undefined") filled += 1;
    };
    walk(data);
    return { total, filled, leafs };
  }, [data]);

  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      <Chip
        size="small"
        variant="outlined"
        label={`${stats.filled}/${stats.total} preenchidos`}
        sx={{ fontSize: 10, height: 20 }}
        color={stats.filled / Math.max(stats.total, 1) > 0.5 ? "success" : "default"}
      />
      <Chip
        size="small"
        variant="outlined"
        label={`${stats.leafs} folhas`}
        sx={{ fontSize: 10, height: 20, color: "text.disabled" }}
      />
    </Stack>
  );
}

function Node({
  k,
  v,
  path,
  depth,
  expandedAll,
  collapsedAll,
  search,
  highlight,
}: {
  k: string;
  v: unknown;
  path: string;
  depth: number;
  expandedAll: number;
  collapsedAll: number;
  search: string;
  highlight?: string[];
}) {
  const theme = useTheme();
  const { kind, color } = valueKind(v, theme);
  const isObject = v && typeof v === "object";
  const childKeys = isObject ? Object.keys(v as object) : [];
  const isArray = Array.isArray(v);

  const [open, setOpen] = useState(depth < 2);
  // Reage a expand/collapse em massa via incremento dos contadores externos.
  useEffect(() => {
    if (expandedAll > 0) setOpen(true);
  }, [expandedAll]);
  useEffect(() => {
    if (collapsedAll > 0) setOpen(false);
  }, [collapsedAll]);

  const highlighted = shouldHighlight(path, highlight);
  const visible = matchSearch(path, v, search);

  if (search && !visible && isObject) {
    const anyChildVisible = childKeys.some((ck) => {
      const cv = (v as Record<string, unknown>)[ck];
      return matchSearch(`${path}.${ck}`, cv, search);
    });
    if (!anyChildVisible) return null;
  } else if (search && !visible) {
    return null;
  }

  return (
    <Box
      sx={{
        ml: depth === 0 ? 0 : 1.5,
        borderLeft: depth === 0 ? "none" : "1px dashed",
        borderColor: depth === 0 ? undefined : "divider",
        pl: depth === 0 ? 0 : 1,
        bgcolor: highlighted ? alpha(theme.palette.primary.main, 0.08) : "transparent",
        borderRadius: highlighted ? "6px" : 0,
        py: 0.25,
      }}
    >
      <Stack direction="row" alignItems="flex-start" spacing={0.5}>
        {isObject && childKeys.length > 0 ? (
          <IconButton
            size="small"
            onClick={() => setOpen((o) => !o)}
            sx={{ p: 0, width: 18, height: 18, mt: "1px" }}
          >
            {open ? (
              <ExpandMoreIcon sx={{ fontSize: 14 }} />
            ) : (
              <ChevronRightIcon sx={{ fontSize: 14 }} />
            )}
          </IconButton>
        ) : (
          <Box sx={{ width: 18, flexShrink: 0 }} />
        )}

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap" useFlexGap>
            <Typography
              variant="caption"
              sx={{
                fontFamily: "monospace",
                fontWeight: 600,
                color: "text.primary",
                fontSize: 11,
              }}
            >
              {k}
            </Typography>
            <Chip
              size="small"
              label={kind}
              sx={{
                fontSize: 9,
                height: 16,
                borderColor: color,
                color,
                "& .MuiChip-label": { px: 0.75 },
              }}
              variant="outlined"
            />
            {!isObject && (
              <Typography
                variant="caption"
                sx={{
                  fontFamily: "monospace",
                  fontSize: 11,
                  color: v === null || v === undefined ? "text.disabled" : "text.secondary",
                  wordBreak: "break-all",
                  maxWidth: "100%",
                }}
              >
                {formatPrimitive(v)}
              </Typography>
            )}
            {isObject && childKeys.length === 0 && (
              <Typography variant="caption" sx={{ fontFamily: "monospace", fontSize: 11, color: "text.disabled" }}>
                {isArray ? "[]" : "{}"}
              </Typography>
            )}
          </Stack>

          {isObject && childKeys.length > 0 && (
            <Collapse in={open} timeout={120} unmountOnExit>
              <Box sx={{ mt: 0.25 }}>
                {childKeys.map((ck) => (
                  <Node
                    key={ck}
                    k={isArray ? `[${ck}]` : ck}
                    v={(v as Record<string, unknown>)[ck]}
                    path={`${path}.${ck}`}
                    depth={depth + 1}
                    expandedAll={expandedAll}
                    collapsedAll={collapsedAll}
                    search={search}
                    highlight={highlight}
                  />
                ))}
              </Box>
            </Collapse>
          )}
        </Box>
      </Stack>
    </Box>
  );
}

export default function RawDataView({
  data,
  title = "Dados brutos do banco",
  highlight,
  defaultExpanded: _defaultExpanded = true,
  showCopy = true,
}: Props) {
  const theme = useTheme();
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const [expandedAll, setExpandedAll] = useState(0);
  const [collapsedAll, setCollapsedAll] = useState(0);

  const json = useMemo(() => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return "[circular ou inválido]";
    }
  }, [data]);

  const handleCopy = () => {
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const dataObj = (typeof data === "object" && data !== null
    ? (data as Record<string, unknown>)
    : { value: data }) as Record<string, unknown>;
  const keys = Object.keys(dataObj);

  return (
    <Box
      sx={{
        borderRadius: "12px",
        border: "1px solid",
        borderColor: "divider",
        bgcolor:
          theme.palette.mode === "light"
            ? alpha(theme.palette.grey[50], 0.95)
            : alpha(theme.palette.common.white, 0.03),
        p: 2,
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: title ? 1.25 : 0 }} flexWrap="wrap" gap={1}>
        {title ? (
          <Stack direction="row" alignItems="center" spacing={1}>
            <DataObjectIcon sx={{ fontSize: 16, color: "primary.main" }} />
            <Typography variant="caption" sx={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "text.secondary" }}>
              {title}
            </Typography>
          </Stack>
        ) : (
          <Box />
        )}
        <Stack direction="row" spacing={0.5} alignItems="center">
          <CountSummary data={data} />
          <Tooltip title="Expandir todos">
            <IconButton size="small" onClick={() => setExpandedAll((n) => n + 1)}>
              <UnfoldMoreIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Colapsar todos">
            <IconButton size="small" onClick={() => setCollapsedAll((n) => n + 1)}>
              <UnfoldLessIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
          {showCopy && (
            <Tooltip title={copied ? "Copiado!" : "Copiar JSON"}>
              <IconButton size="small" onClick={handleCopy}>
                {copied ? (
                  <CheckIcon sx={{ fontSize: 14, color: "success.main" }} />
                ) : (
                  <ContentCopyIcon sx={{ fontSize: 14 }} />
                )}
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </Stack>

      <TextField
        size="small"
        fullWidth
        placeholder="Filtrar por chave ou valor (ex: cnae, telefone, 5511…)"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ fontSize: 14 }} />
            </InputAdornment>
          ),
          sx: { fontSize: 12, fontFamily: "monospace" },
        }}
        sx={{ mb: 1.25 }}
      />

      <Box
        sx={{
          maxHeight: 480,
          overflowY: "auto",
          fontFamily: "monospace",
          bgcolor:
            theme.palette.mode === "light"
              ? alpha(theme.palette.grey[100], 0.65)
              : alpha(theme.palette.common.black, 0.35),
          borderRadius: "8px",
          p: 1.25,
          border: "1px solid",
          borderColor: "divider",
        }}
      >
        {keys.length === 0 ? (
          <Typography variant="caption" color="text.disabled">
            (sem dados)
          </Typography>
        ) : (
          keys.map((k) => (
            <Node
              key={k}
              k={k}
              v={dataObj[k]}
              path={k}
              depth={0}
              expandedAll={expandedAll}
              collapsedAll={collapsedAll}
              search={search}
              highlight={highlight}
            />
          ))
        )}
      </Box>

      <Stack direction="row" justifyContent="flex-end" sx={{ mt: 1 }}>
        <Button
          size="small"
          variant="text"
          onClick={() => {
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${title.replace(/\s+/g, "_").toLowerCase()}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          sx={{ fontSize: 10 }}
        >
          Baixar JSON
        </Button>
      </Stack>
    </Box>
  );
}
