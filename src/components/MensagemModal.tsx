// src/components/MensagemModal.tsx
import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge }  from "@/components/ui/badge";
import { Input }  from "@/components/ui/input";
import {
  Mail, MessageCircle, Linkedin, Copy, Check,
  Wand2, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  gerarMensagemAbordagem, type Empresa, type CanalMensagem,
} from "@/lib/api";

type Canal = {
  id: CanalMensagem;
  label: string;
  icon: React.FC<{ className?: string }>;
  color: string;
  border: string;
  bg: string;
};

const CANAIS: Canal[] = [
  { id: "whatsapp", label: "WhatsApp",  icon: MessageCircle, color: "text-emerald-400", border: "border-emerald-700", bg: "bg-emerald-900/20" },
  { id: "email",    label: "E-mail",    icon: Mail,          color: "text-sky-400",     border: "border-sky-700",     bg: "bg-sky-900/20"     },
  { id: "linkedin", label: "LinkedIn",  icon: Linkedin,      color: "text-blue-400",    border: "border-blue-700",    bg: "bg-blue-900/20"    },
];

export function MensagemModal({
  empresa,
  open,
  onClose,
}: {
  empresa: Empresa;
  open: boolean;
  onClose: () => void;
}) {
  const [canal, setCanal]     = useState<CanalMensagem>("whatsapp");
  const [produto, setProduto] = useState("");
  const [corpo, setCorpo]     = useState("");
  const [assunto, setAssunto] = useState("");
  const [iaUsada, setIaUsada] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const gerar = async () => {
    setLoading(true);
    try {
      const resp = await gerarMensagemAbordagem(empresa, canal, produto);
      setCorpo(resp.corpo);
      setAssunto(resp.assunto ?? "");
      setIaUsada(resp.ia);
    } finally {
      setLoading(false);
    }
  };

  const copiar = async () => {
    const texto = canal === "email" && assunto
      ? `Assunto: ${assunto}\n\n${corpo}`
      : corpo;
    await navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const canalAtual = CANAIS.find(c => c.id === canal)!;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-xl bg-zinc-950 border-zinc-800">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-amber-400" />
            Gerar mensagem de abordagem
          </DialogTitle>
          <p className="text-xs text-zinc-500">
            {empresa.nome_fantasia || empresa.razao_social} · {empresa.cidade} / {empresa.uf}
          </p>
        </DialogHeader>

        {/* Seleção de canal */}
        <div className="flex gap-2">
          {CANAIS.map(c => (
            <button
              key={c.id}
              onClick={() => { setCanal(c.id); setCorpo(""); setAssunto(""); }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all",
                canal === c.id
                  ? `${c.border} ${c.bg} ${c.color}`
                  : "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
              )}>
              <c.icon className="h-3.5 w-3.5" />
              {c.label}
            </button>
          ))}
        </div>

        {/* Produto / serviço */}
        <div className="space-y-1">
          <label className="text-xs text-zinc-400">Produto/serviço (opcional)</label>
          <Input
            value={produto}
            onChange={e => setProduto(e.target.value)}
            placeholder="ex: consultoria fiscal, software ERP, logística..."
            className="text-sm border-zinc-800 bg-zinc-900/60 placeholder-zinc-600"
          />
        </div>

        {/* Gerar */}
        <Button
          onClick={gerar}
          disabled={loading}
          className="w-full gap-2"
        >
          {loading
            ? <><RefreshCw className="h-4 w-4 animate-spin" /> Gerando...</>
            : <><Wand2 className="h-4 w-4" /> Gerar mensagem</>
          }
        </Button>

        {/* Resultado */}
        {corpo && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <canalAtual.icon className={cn("h-3.5 w-3.5", canalAtual.color)} />
                <span className="text-xs font-medium text-zinc-300">{canalAtual.label}</span>
                <Badge variant="outline"
                  className={cn("text-[9px] border py-0 px-1.5",
                    iaUsada ? "border-amber-700/60 text-amber-400" : "border-zinc-700 text-zinc-500")}>
                  {iaUsada ? "✦ IA" : "template"}
                </Badge>
              </div>
              <Button
                size="sm" variant="ghost"
                className={cn("h-6 gap-1 text-[11px]", copiado ? "text-emerald-400" : "text-zinc-400")}
                onClick={copiar}>
                {copiado ? <><Check className="h-3 w-3" /> Copiado!</> : <><Copy className="h-3 w-3" /> Copiar</>}
              </Button>
            </div>

            {assunto && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
                <span className="text-[10px] text-zinc-500 block mb-0.5">Assunto</span>
                <p className="text-sm text-zinc-200">{assunto}</p>
              </div>
            )}

            <textarea
              value={corpo}
              onChange={e => setCorpo(e.target.value)}
              rows={8}
              className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-600"
            />

            <p className="text-[10px] text-zinc-600">
              Personalize antes de enviar. Substitua os [colchetes] pelos dados reais.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
