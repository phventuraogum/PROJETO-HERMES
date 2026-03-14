// src/pages/Heatmap.tsx
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";

import { MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import {
  getResultadosUltimaExecucao,
  type Empresa,
  type ExecucaoResumo,
} from "@/lib/api";

// ----------------------
// Helpers
// ----------------------

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value);
}

type MunicipioAgg = {
  municipio: string;
  uf: string;
  empresas: number;
  capital: number;
  intensidade: number; // 0–100
};

const DEFAULT_CENTER: [number, number] = [-14.235, -51.9253]; // Brasil

// ----------------------
// Componente Principal
// ----------------------

export default function HeatmapPage() {
  const [loading, setLoading] = useState(true);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [execucao, setExecucao] = useState<ExecucaoResumo | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_CENTER);

  useEffect(() => {
    async function carregar() {
      try {
        setLoading(true);
        const payload = await getResultadosUltimaExecucao();

        if (!payload.execucao || payload.resultados.length === 0) {
          toast.info("Nenhuma prospecção encontrada. Execute uma busca primeiro.");
          setEmpresas([]);
          setExecucao(null);
          setMapCenter(DEFAULT_CENTER);
          return;
        }

        setEmpresas(payload.resultados);
        setExecucao(payload.execucao);

        // define centro do mapa pela média das coordenadas das empresas com geo
        const empresasComGeo = payload.resultados.filter(
          (e) => e.latitude != null && e.longitude != null
        );
        if (empresasComGeo.length > 0) {
          const mediaLat =
            empresasComGeo.reduce((acc, e) => acc + (e.latitude ?? 0), 0) /
            empresasComGeo.length;
          const mediaLng =
            empresasComGeo.reduce((acc, e) => acc + (e.longitude ?? 0), 0) /
            empresasComGeo.length;

          setMapCenter([mediaLat, mediaLng]);
        } else {
          setMapCenter(DEFAULT_CENTER);
        }
      } catch (err) {
        console.error("[Heatmap] erro ao carregar resultados:", err);
        toast.error("Erro ao carregar dados para o mapa de calor.");
      } finally {
        setLoading(false);
      }
    }

    void carregar();
  }, []);

  const empresasComGeo = useMemo(
    () => empresas.filter((e) => e.latitude != null && e.longitude != null),
    [empresas]
  );

  const totalEmpresas = empresas.length;
  const totalCapital = empresas.reduce(
    (acc, e) => acc + (e.capital_social ?? 0),
    0
  );

  // agregação por município x UF
  const municipiosAgg: MunicipioAgg[] = useMemo(() => {
    const mapa: Record<
      string,
      { municipio: string; uf: string; empresas: number; capital: number }
    > = {};

    for (const emp of empresas) {
      const municipio = (emp.cidade || "N/I").toUpperCase();
      const uf = (emp.uf || "N/I").toUpperCase();
      const chave = `${municipio}|${uf}`;

      if (!mapa[chave]) {
        mapa[chave] = { municipio, uf, empresas: 0, capital: 0 };
      }

      mapa[chave].empresas += 1;
      mapa[chave].capital += emp.capital_social ?? 0;
    }

    const lista = Object.values(mapa);
    const maxEmpresas = lista.reduce(
      (max, item) => (item.empresas > max ? item.empresas : max),
      0
    );

    return lista
      .map((item) => ({
        municipio: item.municipio,
        uf: item.uf,
        empresas: item.empresas,
        capital: item.capital,
        intensidade: maxEmpresas > 0 ? Math.round((item.empresas / maxEmpresas) * 100) : 0,
      }))
      .sort((a, b) => b.empresas - a.empresas);
  }, [empresas]);

  // ----------------------
  // Render
  // ----------------------

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Carregando mapa de calor...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">
          Mapa de Calor – Concentração por Município
        </h2>
        <p className="text-sm text-muted-foreground">
          Distribuição das empresas filtradas por município, com base na última prospecção.
          {execucao && (
            <>
              {" "}
              <span className="font-medium">
                ({execucao.termo.toUpperCase()} • {execucao.cidade} / {execucao.uf})
              </span>
            </>
          )}
        </p>
      </div>

      {/* Resumo do mapa */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 text-xs md:text-sm">
            <Badge variant="outline" className="bg-muted/40">
              Pontos de mapa:{" "}
              <span className="ml-1 font-semibold">
                {empresasComGeo.length}
              </span>
            </Badge>
            <Badge variant="outline" className="bg-muted/40">
              Empresas somadas:{" "}
              <span className="ml-1 font-semibold">{totalEmpresas}</span>
            </Badge>
            <Badge variant="outline" className="bg-muted/40">
              Capital social total:{" "}
              <span className="ml-1 font-semibold">
                {formatCurrency(totalCapital)}
              </span>
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Mapa */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="h-[420px] w-full">
            <MapContainer
              center={mapCenter}
              zoom={6}
              minZoom={3}
              maxZoom={18}
              style={{ height: "100%", width: "100%" }}
              scrollWheelZoom
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {empresasComGeo.map((emp, idx) => {
                const score = emp.score_icp ?? 50;
                const normalized = Math.max(0, Math.min(score, 100));

                const radius = 6 + (normalized / 100) * 12; // 6–18
                const fillOpacity = 0.25 + (normalized / 100) * 0.6; // 0.25–0.85

                return (
                  <CircleMarker
                    key={`${emp.cnpj}-${idx}`}
                    center={[emp.latitude as number, emp.longitude as number]}
                    radius={radius}
                    pathOptions={{
                      color: "rgba(56,189,248,0.9)", // azul "ICP"
                      fillColor: "rgba(56,189,248,0.85)",
                      fillOpacity,
                      weight: 0,
                    }}
                  >
                    <LeafletTooltip direction="top" offset={[0, -4]} opacity={0.95}>
                      <div style={{ fontSize: 11 }}>
                        <div className="font-semibold">
                          {emp.nome_fantasia || emp.razao_social}
                        </div>
                        <div>
                          {emp.cidade} / {emp.uf}
                        </div>
                        {emp.capital_social != null && (
                          <div>Capital: {formatCurrency(emp.capital_social)}</div>
                        )}
                        {emp.segmento && <div>Segmento: {emp.segmento}</div>}
                        {emp.score_icp != null && (
                          <div>Score ICP: {emp.score_icp.toFixed(1)}</div>
                        )}
                      </div>
                    </LeafletTooltip>
                  </CircleMarker>
                );
              })}
            </MapContainer>
          </div>
        </CardContent>
      </Card>

      {/* Concentração Regional */}
      <Card>
        <CardHeader>
          <CardTitle>Concentração Regional</CardTitle>
          <p className="text-xs text-muted-foreground">
            Municípios com maior densidade de empresas após os filtros ICP.
          </p>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-[40%]">Município</TableHead>
                  <TableHead className="w-[10%]">UF</TableHead>
                  <TableHead className="w-[15%]">Empresas</TableHead>
                  <TableHead className="w-[25%]">Capital Social Total</TableHead>
                  <TableHead className="w-[10%] text-right">Intensidade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {municipiosAgg.map((m) => (
                  <TableRow key={`${m.municipio}-${m.uf}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3 w-3 text-primary" />
                        <span className="font-medium">
                          {m.municipio.charAt(0) + m.municipio.slice(1).toLowerCase()}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{m.uf}</TableCell>
                    <TableCell>{m.empresas}</TableCell>
                    <TableCell>{formatCurrency(m.capital)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-rose-500"
                            style={{ width: `${m.intensidade}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {m.intensidade}%
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {municipiosAgg.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-4">
                      Nenhuma empresa encontrada para montar a concentração regional.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
