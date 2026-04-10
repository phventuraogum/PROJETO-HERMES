// src/pages/Heatmap.tsx (MUI)
import { useEffect, useMemo, useState } from "react";
import {
  Box, Stack, Typography, Card, CardContent, Chip,
  Table, TableHead, TableBody, TableRow, TableCell,
  CircularProgress, Paper, Alert,
} from "@mui/material";
import LocationOnIcon from "@mui/icons-material/LocationOn";
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
      <Box sx={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center" }}>
        <Stack direction="row" alignItems="center" gap={1.5} sx={{ color: "text.secondary" }}>
          <CircularProgress size={16} sx={{ color: "text.secondary" }} />
          <Typography variant="body2" sx={{ color: "text.secondary" }}>Carregando mapa de calor...</Typography>
        </Stack>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {/* Header */}
      <Box>
        <Typography variant="h5" fontWeight={700} sx={{ color: "text.primary" }}>
          Mapa de Calor – Concentração por Município
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
          Distribuição das empresas filtradas por município, com base na última prospecção.
          {execucao && (
            <Box component="span" sx={{ fontWeight: 600, color: "text.primary", ml: 0.5 }}>
              ({execucao.termo.toUpperCase()} • {execucao.cidade} / {execucao.uf})
            </Box>
          )}
        </Typography>
      </Box>

      <Alert severity="info" variant="outlined" sx={{ borderRadius: 2, color: "text.primary", "& .MuiAlert-message": { width: "100%" } }}>
        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
          Visualização em evolução (beta)
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Apenas empresas com latitude e longitude entram no mapa; o restante continua na tabela de concentração.
          Estamos ajustando escala de cores e densidade — use os dados como orientação, não como decisão isolada.
        </Typography>
      </Alert>

      {/* Resumo do mapa */}
      <Card sx={{ borderRadius: 2, border: "1px solid", borderColor: "divider", backgroundColor: "background.paper" }}>
        <CardContent sx={{ py: "14px !important" }}>
          <Stack direction="row" flexWrap="wrap" gap={1.5}>
            <Chip
              label={
                <span>
                  Pontos de mapa: <strong>{empresasComGeo.length}</strong>
                </span>
              }
              variant="outlined"
              size="small"
              sx={{ fontSize: 12, borderColor: "divider", color: "text.secondary", backgroundColor: "action.hover" }}
            />
            <Chip
              label={
                <span>
                  Empresas somadas: <strong>{totalEmpresas}</strong>
                </span>
              }
              variant="outlined"
              size="small"
              sx={{ fontSize: 12, borderColor: "divider", color: "text.secondary", backgroundColor: "action.hover" }}
            />
            <Chip
              label={
                <span>
                  Capital social total: <strong>{formatCurrency(totalCapital)}</strong>
                </span>
              }
              variant="outlined"
              size="small"
              sx={{ fontSize: 12, borderColor: "divider", color: "text.secondary", backgroundColor: "action.hover" }}
            />
          </Stack>
        </CardContent>
      </Card>

      {/* Mapa */}
      <Card sx={{ borderRadius: 2, border: "1px solid", borderColor: "divider", backgroundColor: "background.paper", overflow: "hidden" }}>
        <CardContent sx={{ p: "0 !important" }}>
          <Box sx={{ height: 420, width: "100%" }}>
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
                      color: "rgba(56,189,248,0.9)",
                      fillColor: "rgba(56,189,248,0.85)",
                      fillOpacity,
                      weight: 0,
                    }}
                  >
                    <LeafletTooltip direction="top" offset={[0, -4]} opacity={0.95}>
                      <div style={{ fontSize: 11 }}>
                        <div style={{ fontWeight: 600 }}>
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
          </Box>
        </CardContent>
      </Card>

      {/* Concentração Regional */}
      <Card sx={{ borderRadius: 2, border: "1px solid", borderColor: "divider", backgroundColor: "background.paper" }}>
        <CardContent sx={{ pt: "20px !important", px: "20px !important", pb: "4px !important" }}>
          <Typography variant="h6" fontWeight={700} sx={{ color: "text.primary", mb: 0.5 }}>
            Concentração Regional
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 2 }}>
            Municípios com maior densidade de empresas após os filtros ICP.
          </Typography>
        </CardContent>
        <CardContent sx={{ pt: "0 !important", px: "16px !important", pb: "16px !important" }}>
          <Box sx={{ borderRadius: 1.5, border: "1px solid", borderColor: "divider", overflow: "hidden" }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ backgroundColor: "action.hover" }}>
                  <TableCell sx={{ color: "text.secondary", fontSize: 12, borderBottom: "1px solid", borderColor: "divider", width: "40%" }}>Município</TableCell>
                  <TableCell sx={{ color: "text.secondary", fontSize: 12, borderBottom: "1px solid", borderColor: "divider", width: "10%" }}>UF</TableCell>
                  <TableCell sx={{ color: "text.secondary", fontSize: 12, borderBottom: "1px solid", borderColor: "divider", width: "15%" }}>Empresas</TableCell>
                  <TableCell sx={{ color: "text.secondary", fontSize: 12, borderBottom: "1px solid", borderColor: "divider", width: "25%" }}>Capital Social Total</TableCell>
                  <TableCell sx={{ color: "text.secondary", fontSize: 12, borderBottom: "1px solid", borderColor: "divider", width: "10%", textAlign: "right" }}>Intensidade</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {municipiosAgg.map((m) => (
                  <TableRow
                    key={`${m.municipio}-${m.uf}`}
                    sx={{ "&:hover": { backgroundColor: "action.hover" } }}
                  >
                    <TableCell sx={{ color: "text.primary", fontSize: 13, borderBottom: "1px solid", borderColor: "divider" }}>
                      <Stack direction="row" alignItems="center" gap={1}>
                        <LocationOnIcon sx={{ fontSize: 12, color: "#F97316" }} />
                        <Typography variant="body2" fontWeight={500} sx={{ fontSize: 13, color: "text.primary" }}>
                          {m.municipio.charAt(0) + m.municipio.slice(1).toLowerCase()}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ color: "text.secondary", fontSize: 13, borderBottom: "1px solid", borderColor: "divider" }}>{m.uf}</TableCell>
                    <TableCell sx={{ color: "text.primary", fontSize: 13, borderBottom: "1px solid", borderColor: "divider" }}>{m.empresas}</TableCell>
                    <TableCell sx={{ color: "text.primary", fontSize: 13, borderBottom: "1px solid", borderColor: "divider" }}>{formatCurrency(m.capital)}</TableCell>
                    <TableCell sx={{ borderBottom: "1px solid", borderColor: "divider", textAlign: "right" }}>
                      <Stack direction="row" alignItems="center" gap={1} justifyContent="flex-end">
                        <Box sx={{ height: 6, width: 96, borderRadius: "99px", backgroundColor: "action.selected", overflow: "hidden", flexShrink: 0 }}>
                          <Box sx={{ height: "100%", borderRadius: "99px", backgroundColor: "#f43f5e", width: `${m.intensidade}%` }} />
                        </Box>
                        <Typography variant="caption" sx={{ color: "text.secondary", fontSize: 11, flexShrink: 0 }}>
                          {m.intensidade}%
                        </Typography>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
                {municipiosAgg.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} sx={{ textAlign: "center", py: 3, color: "text.secondary", fontSize: 12, borderBottom: "none" }}>
                      Nenhuma empresa encontrada para montar a concentração regional.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
