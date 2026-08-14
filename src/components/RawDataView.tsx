import { useEffect, useMemo, useState } from "react";
import {
  Braces,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Search,
  UnfoldHorizontal,
  FoldHorizontal,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  data: unknown;
  title?: string;
  /** Caminhos a destacar (matching parcial, case-insensitive). */
  highlight?: string[];
  /** Botão de copiar JSON aparece. */
  showCopy?: boolean;
}

function valueKind(v: unknown): { kind: string; className: string } {
  if (v === null) return { kind: "null", className: "text-muted-foreground border-muted-foreground/40" };
  if (v === undefined) return { kind: "undef", className: "text-muted-foreground border-muted-foreground/40" };
  if (Array.isArray(v)) return { kind: `array(${v.length})`, className: "text-purple-500 border-purple-500/40" };
  if (typeof v === "object") {
    const len = Object.keys(v as object).length;
    return { kind: `obj(${len})`, className: "text-sky-500 border-sky-500/40" };
  }
  if (typeof v === "boolean") return { kind: "bool", className: "text-emerald-500 border-emerald-500/40" };
  if (typeof v === "number") return { kind: "num", className: "text-amber-500 border-amber-500/40" };
  if (typeof v === "string") return { kind: "str", className: "text-rose-400 border-rose-400/40" };
  return { kind: typeof v, className: "text-muted-foreground border-muted-foreground/40" };
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

  const goodRatio = stats.filled / Math.max(stats.total, 1) > 0.5;
  return (
    <div className="flex items-center gap-1">
      <span
        className={cn(
          "rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
          goodRatio
            ? "border-emerald-500/40 text-emerald-600"
            : "border-border text-muted-foreground",
        )}
      >
        {stats.filled}/{stats.total} preenchidos
      </span>
      <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground/70">
        {stats.leafs} folhas
      </span>
    </div>
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
  const { kind, className } = valueKind(v);
  const isObject = Boolean(v) && typeof v === "object";
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
    <div
      className={cn(
        "py-0.5",
        depth > 0 && "ml-3 border-l border-dashed border-border pl-2",
        highlighted && "rounded-md bg-primary/10",
      )}
    >
      <div className="flex items-start gap-1">
        {isObject && childKeys.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="mt-px flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
          >
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[11px] font-semibold text-foreground">{k}</span>
            <span className={cn("rounded border px-1 text-[9px] font-medium", className)}>{kind}</span>
            {!isObject && (
              <span
                className={cn(
                  "max-w-full break-all font-mono text-[11px]",
                  v === null || v === undefined ? "text-muted-foreground/50" : "text-muted-foreground",
                )}
              >
                {formatPrimitive(v)}
              </span>
            )}
            {isObject && childKeys.length === 0 && (
              <span className="font-mono text-[11px] text-muted-foreground/50">{isArray ? "[]" : "{}"}</span>
            )}
          </div>

          {isObject && childKeys.length > 0 && open && (
            <div className="mt-0.5">
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RawDataView({
  data,
  title = "Dados brutos do banco",
  highlight,
  showCopy = true,
}: Props) {
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

  const handleDownload = () => {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/\s+/g, "_").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const dataObj = (typeof data === "object" && data !== null
    ? (data as Record<string, unknown>)
    : { value: data }) as Record<string, unknown>;
  const keys = Object.keys(dataObj);

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Braces className="h-4 w-4 text-primary" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{title}</span>
        </div>
        <div className="flex items-center gap-1">
          <CountSummary data={data} />
          <Button variant="ghost" size="icon" className="h-6 w-6" title="Expandir todos"
            onClick={() => setExpandedAll((n) => n + 1)}>
            <UnfoldHorizontal className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" title="Colapsar todos"
            onClick={() => setCollapsedAll((n) => n + 1)}>
            <FoldHorizontal className="h-3.5 w-3.5" />
          </Button>
          {showCopy && (
            <Button variant="ghost" size="icon" className="h-6 w-6" title={copied ? "Copiado!" : "Copiar JSON"}
              onClick={handleCopy}>
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-6 w-6" title="Baixar JSON" onClick={handleDownload}>
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="relative mb-2.5">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filtrar por chave ou valor (ex: cnae, telefone, 5511…)"
          className="h-8 pl-8 font-mono text-xs"
        />
      </div>

      <div className="max-h-[480px] overflow-y-auto rounded-lg border border-border bg-background/60 p-2 font-mono">
        {keys.length === 0 ? (
          <span className="text-[11px] text-muted-foreground/60">(sem dados)</span>
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
      </div>
    </div>
  );
}
