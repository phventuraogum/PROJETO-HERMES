import { Calendar, Filter, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function FilterBar() {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card/50 p-4 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Filter className="h-4 w-4" />
        <span className="font-medium">Filtros</span>
      </div>

      <div className="h-6 w-px bg-border" />

      {/* Period Filter */}
      <Select defaultValue="7d">
        <SelectTrigger className="h-9 w-[140px] border-border bg-secondary text-sm">
          <Calendar className="mr-2 h-4 w-4 text-muted-foreground" />
          <SelectValue placeholder="Período" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="today">Hoje</SelectItem>
          <SelectItem value="7d">Últimos 7 dias</SelectItem>
          <SelectItem value="30d">Últimos 30 dias</SelectItem>
          <SelectItem value="90d">Últimos 90 dias</SelectItem>
          <SelectItem value="custom">Personalizado</SelectItem>
        </SelectContent>
      </Select>

      {/* Channel Filter */}
      <Select defaultValue="all">
        <SelectTrigger className="h-9 w-[120px] border-border bg-secondary text-sm">
          <SelectValue placeholder="Canal" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos canais</SelectItem>
          <SelectItem value="email">E-mail</SelectItem>
          <SelectItem value="whatsapp">WhatsApp</SelectItem>
          <SelectItem value="linkedin">LinkedIn</SelectItem>
          <SelectItem value="phone">Telefone</SelectItem>
        </SelectContent>
      </Select>

      {/* ICP Filter */}
      <Select defaultValue="all">
        <SelectTrigger className="h-9 w-[100px] border-border bg-secondary text-sm">
          <SelectValue placeholder="ICP" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos ICP</SelectItem>
          <SelectItem value="a">ICP A</SelectItem>
          <SelectItem value="b">ICP B</SelectItem>
          <SelectItem value="c">ICP C</SelectItem>
        </SelectContent>
      </Select>

      {/* SDR Filter */}
      <Select defaultValue="all">
        <SelectTrigger className="h-9 w-[120px] border-border bg-secondary text-sm">
          <SelectValue placeholder="SDR" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos SDRs</SelectItem>
          <SelectItem value="ana">Ana Silva</SelectItem>
          <SelectItem value="carlos">Carlos Santos</SelectItem>
          <SelectItem value="maria">Maria Oliveira</SelectItem>
          <SelectItem value="ai">IA SDR</SelectItem>
        </SelectContent>
      </Select>

      {/* Campaign Filter */}
      <Select defaultValue="all">
        <SelectTrigger className="h-9 w-[130px] border-border bg-secondary text-sm">
          <SelectValue placeholder="Campanha" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas campanhas</SelectItem>
          <SelectItem value="outbound-q4">Outbound Q4</SelectItem>
          <SelectItem value="inbound">Inbound 2024</SelectItem>
          <SelectItem value="reativacao">Reativação</SelectItem>
        </SelectContent>
      </Select>

      {/* Origin Filter */}
      <Select defaultValue="all">
        <SelectTrigger className="h-9 w-[110px] border-border bg-secondary text-sm">
          <SelectValue placeholder="Origem" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas origens</SelectItem>
          <SelectItem value="organic">Orgânico</SelectItem>
          <SelectItem value="paid">Pago</SelectItem>
          <SelectItem value="referral">Indicação</SelectItem>
          <SelectItem value="outbound">Outbound</SelectItem>
        </SelectContent>
      </Select>

      <div className="ml-auto">
        <Button variant="outline" size="sm" className="border-border text-muted-foreground hover:bg-secondary hover:text-foreground">
          <ChevronDown className="mr-2 h-4 w-4" />
          Mais filtros
        </Button>
      </div>
    </div>
  );
}
