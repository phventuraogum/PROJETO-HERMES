import { Header } from "@/components/dashboard/Header";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { HealthIndicator } from "@/components/dashboard/HealthIndicator";
import { ConversionFunnel } from "@/components/dashboard/ConversionFunnel";
import { SpeedToLeadChart } from "@/components/dashboard/SpeedToLeadChart";
import { ChannelPerformance } from "@/components/dashboard/ChannelPerformance";
import {
  Users,
  Phone,
  MessageSquare,
  Calendar,
  Target,
  TrendingUp,
  DollarSign,
  BarChart3,
  Zap,
  ShieldCheck,
} from "lucide-react";

import { useState, useEffect } from "react";

const Index = () => {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Trigger entrance animation
    setIsLoaded(true);
  }, []);

  // Mock data for demonstration
  const channelData = [
    { channel: "email" as const, sent: 12500, delivered: 11800, responses: 1534, meetings: 187 },
    { channel: "whatsapp" as const, sent: 8200, delivered: 8100, responses: 2430, meetings: 324 },
    { channel: "linkedin" as const, sent: 4500, delivered: 4200, responses: 714, meetings: 89 },
    { channel: "phone" as const, sent: 2800, delivered: 2200, responses: 660, meetings: 145 },
  ];

  const funnelStages = [
    { label: "Leads Novos", value: 1847, conversionRate: 100 },
    { label: "Leads Contactados", value: 1423, conversionRate: 77 },
    { label: "Reuniões Agendadas", value: 312, conversionRate: 22 },
    { label: "Reuniões Realizadas", value: 267, conversionRate: 86 },
    { label: "Oportunidades", value: 134, conversionRate: 50 },
  ];

  const crmHealthItems = [
    { label: "Campos obrigatórios", value: 94, target: 95 },
    { label: "Leads sem duplicatas", value: 98, target: 98 },
    { label: "Usuários ativos (7d)", value: 87, target: 80 },
    { label: "Registros atualizados", value: 76, target: 85 },
  ];

  return (
    <div className={`min-h-screen bg-background transition-all duration-500 ${isLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
      <Header />

      <main className="mx-auto max-w-[1600px] px-6 py-6">
        {/* Filter Bar */}
        <FilterBar />

        {/* Main Metrics Grid */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Leads Novos"
            value="1.847"
            trend={{ value: 12.5, label: "vs última semana" }}
            variant="primary"
            icon={<Users className="h-5 w-5" />}
            delay={0}
          />
          <MetricCard
            title="Leads Contactados"
            value="1.423"
            subtitle="77% dos leads"
            trend={{ value: 8.3, label: "vs última semana" }}
            variant="success"
            icon={<Phone className="h-5 w-5" />}
            delay={50}
          />
          <MetricCard
            title="Taxa de Resposta"
            value="18.7%"
            subtitle="média geral"
            trend={{ value: -2.1, label: "vs última semana" }}
            variant="warning"
            icon={<MessageSquare className="h-5 w-5" />}
            delay={100}
          />
          <MetricCard
            title="Reuniões Agendadas"
            value="312"
            subtitle="21.9% meeting rate"
            trend={{ value: 15.2, label: "vs última semana" }}
            variant="success"
            icon={<Calendar className="h-5 w-5" />}
            delay={150}
          />
        </div>

        {/* Second Row */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Show Rate"
            value="85.6%"
            subtitle="267 de 312"
            trend={{ value: 3.2, label: "vs última semana" }}
            variant="success"
            icon={<Target className="h-5 w-5" />}
            delay={200}
          />
          <MetricCard
            title="Oportunidades Criadas"
            value="134"
            subtitle="50.2% de conversão"
            trend={{ value: 18.4, label: "vs última semana" }}
            variant="primary"
            icon={<TrendingUp className="h-5 w-5" />}
            delay={250}
          />
          <MetricCard
            title="Pipeline Criado"
            value="R$ 2.4M"
            subtitle="ticket médio R$ 18k"
            trend={{ value: 22.1, label: "vs última semana" }}
            variant="success"
            icon={<DollarSign className="h-5 w-5" />}
            delay={300}
          />
          <MetricCard
            title="ICP Fit Score"
            value="B+"
            subtitle="73% leads A/B"
            trend={{ value: 5.0, label: "melhoria de qualidade" }}
            variant="primary"
            icon={<BarChart3 className="h-5 w-5" />}
            delay={350}
          />
        </div>

        {/* Charts Row */}
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <ConversionFunnel stages={funnelStages} delay={400} />
          
          <div className="space-y-6">
            <SpeedToLeadChart p50={4} p90={12} target={5} delay={450} />
            <HealthIndicator
              title="Saúde do CRM"
              items={crmHealthItems}
              delay={500}
            />
          </div>
          
          <ChannelPerformance data={channelData} delay={550} />
        </div>

        {/* AI SDR Stats */}
        <div className="mt-6 rounded-lg border border-primary/20 bg-gradient-to-r from-primary/5 to-accent/5 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">AI SDR Performance</h3>
              <p className="text-sm text-muted-foreground">
                Automação ativa em 67% das conversas
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-lg border border-border bg-card p-4 text-center">
              <div className="text-2xl font-bold text-primary">67%</div>
              <div className="text-xs text-muted-foreground">Automação Rate</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4 text-center">
              <div className="text-2xl font-bold text-foreground">23%</div>
              <div className="text-xs text-muted-foreground">Handoff Rate</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4 text-center">
              <div className="text-2xl font-bold text-success">89%</div>
              <div className="text-xs text-muted-foreground">Aceitação de Sugestões</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4 text-center">
              <div className="text-2xl font-bold text-foreground">142h</div>
              <div className="text-xs text-muted-foreground">Tempo Economizado</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4 text-center">
              <div className="text-2xl font-bold text-success">R$ 4.80</div>
              <div className="text-xs text-muted-foreground">Custo IA / Reunião</div>
            </div>
          </div>
        </div>

        {/* Footer Stats */}
        <div className="mt-6 flex items-center justify-between rounded-lg border border-border bg-card/50 px-5 py-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-success" />
            <span>Última atualização: há 2 minutos</span>
          </div>
          <div className="flex items-center gap-6 text-muted-foreground">
            <span>
              Período: <span className="text-foreground">Últimos 7 dias</span>
            </span>
            <span>
              Leads ativos: <span className="text-foreground">4.521</span>
            </span>
            <span>
              SDRs online: <span className="text-success">8/10</span>
            </span>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
