import { Mail, MessageCircle, Linkedin, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChannelData {
  channel: "email" | "whatsapp" | "linkedin" | "phone";
  sent: number;
  delivered: number;
  responses: number;
  meetings: number;
}

interface ChannelPerformanceProps {
  data: ChannelData[];
  delay?: number;
}

const channelIcons = {
  email: Mail,
  whatsapp: MessageCircle,
  linkedin: Linkedin,
  phone: Phone,
};

const channelNames = {
  email: "E-mail",
  whatsapp: "WhatsApp",
  linkedin: "LinkedIn",
  phone: "Telefone",
};

const channelColors = {
  email: "text-blue-400",
  whatsapp: "text-green-400",
  linkedin: "text-sky-400",
  phone: "text-amber-400",
};

export function ChannelPerformance({ data, delay = 0 }: ChannelPerformanceProps) {
  return (
    <div
      className="animate-fade-in-up rounded-lg border border-border bg-card p-5"
      style={{ animationDelay: `${delay}ms` }}
    >
      <h3 className="mb-4 text-sm font-medium text-muted-foreground">
        Taxa de Resposta por Canal
      </h3>

      <div className="space-y-4">
        {data.map((item) => {
          const Icon = channelIcons[item.channel];
          const responseRate = ((item.responses / item.delivered) * 100).toFixed(1);
          const meetingRate = ((item.meetings / item.responses) * 100).toFixed(1);

          return (
            <div
              key={item.channel}
              className="group rounded-lg border border-border bg-secondary/30 p-3 transition-all hover:border-primary/30"
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={cn("h-5 w-5", channelColors[item.channel])} />
                  <span className="font-medium text-foreground">
                    {channelNames[item.channel]}
                  </span>
                </div>
                <span className="text-lg font-bold text-primary">{responseRate}%</span>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="rounded bg-secondary px-2 py-1.5">
                  <div className="font-medium text-foreground">{item.sent.toLocaleString("pt-BR")}</div>
                  <div className="text-muted-foreground">Enviados</div>
                </div>
                <div className="rounded bg-secondary px-2 py-1.5">
                  <div className="font-medium text-foreground">{item.delivered.toLocaleString("pt-BR")}</div>
                  <div className="text-muted-foreground">Entregues</div>
                </div>
                <div className="rounded bg-secondary px-2 py-1.5">
                  <div className="font-medium text-foreground">{item.responses.toLocaleString("pt-BR")}</div>
                  <div className="text-muted-foreground">Respostas</div>
                </div>
                <div className="rounded bg-secondary px-2 py-1.5">
                  <div className="font-medium text-foreground">{item.meetings.toLocaleString("pt-BR")}</div>
                  <div className="text-muted-foreground">Reuniões</div>
                </div>
              </div>

              <div className="mt-2 text-xs text-muted-foreground">
                Meeting rate: <span className="text-foreground">{meetingRate}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
