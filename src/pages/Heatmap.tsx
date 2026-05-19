// src/pages/Heatmap.tsx
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { GoogleMap, useJsApiLoader, Marker } from "@react-google-maps/api";

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

/** Monta endereço para geocoding (Google) a partir dos campos da prospecção. */
export function buildEnderecoEmpresa(e: Empresa): string | null {
  const log = [e.logradouro, e.numero].filter(Boolean).join(", ").trim();
  const cidadeUf = [e.cidade, e.uf].filter(Boolean).join(" - ").trim();
  const parts = [log, e.bairro && String(e.bairro).trim(), cidadeUf, e.cep ? `CEP ${String(e.cep).replace(/\D/g, "")}` : ""].filter(
    Boolean,
  ) as string[];
  if (parts.length === 0) return null;
  return `${parts.join(", ")}, Brasil`;
}

type MunicipioAgg = {
  municipio: string;
  uf: string;
  empresas: number;
  capital: number;
  intensidade: number;
};

type PlotPoint = {
  empresa: Empresa;
  lat: number;
  lng: number;
  viaGeocode?: boolean;
};

const DEFAULT_CENTER: [number, number] = [-14.235, -51.9253];

const mapContainerStyle: CSSProperties = {
  width: "100%",
  height: "100%",
};

// ----------------------
// Google Maps + geocoding
// ----------------------

function HeatmapGoogleInner({
  empresas,
  execucao,
  municipiosAgg,
  totalCapital,
  loading,
}: {
  empresas: Empresa[];
  execucao: ExecucaoResumo | null;
  municipiosAgg: MunicipioAgg[];
  totalCapital: number;
  loading: boolean;
}) {
  const apiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() ?? "";
  const { isLoaded, loadError } = useJsApiLoader({
    id: "hermes-google-maps-heatmap",
    googleMapsApiKey: apiKey,
  });

  const [geocodeByCnpj, setGeocodeByCnpj] = useState<Record<string, { lat: number; lng: number }>>({});
  const [geocodeRunning, setGeocodeRunning] = useState(false);
  const [geocodeErrors, setGeocodeErrors] = useState(0);
  const mapRef = useRef<google.maps.Map | null>(null);
  const processedGeocodeRef = useRef<Set<string>>(new Set());
  const empresasKey = useMemo(() => empresas.map((e) => e.cnpj).join("|"), [empresas]);

  useEffect(() => {
    processedGeocodeRef.current.clear();
  }, [empresasKey]);

  const plotPoints: PlotPoint[] = useMemo(() => {
    const out: PlotPoint[] = [];
    for (const e of empresas) {
      if (e.latitude != null && e.longitude != null) {
        out.push({ empresa: e, lat: e.latitude, lng: e.longitude, viaGeocode: false });
        continue;
      }
      const g = geocodeByCnpj[e.cnpj];
      if (g) out.push({ empresa: e, lat: g.lat, lng: g.lng, viaGeocode: true });
    }
    return out;
  }, [empresas, geocodeByCnpj]);

  const mapCenter = useMemo(() => {
    if (plotPoints.length === 0) return { lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] };
    const sum = plotPoints.reduce(
      (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
      { lat: 0, lng: 0 },
    );
    return { lat: sum.lat / plotPoints.length, lng: sum.lng / plotPoints.length };
  }, [plotPoints]);

  useEffect(() => {
    if (!isLoaded || !window.google?.maps || empresas.length === 0) return;

    const need = empresas.filter((e) => {
      if (e.latitude != null && e.longitude != null) return false;
      if (!buildEnderecoEmpresa(e)) return false;
      return !processedGeocodeRef.current.has(e.cnpj);
    });
    if (need.length === 0) return;

    let cancelled = false;
    const geocoder = new google.maps.Geocoder();

    (async () => {
      setGeocodeRunning(true);
      setGeocodeErrors(0);
      let errs = 0;
      for (const emp of need) {
        if (cancelled) break;
        processedGeocodeRef.current.add(emp.cnpj);
        const address = buildEnderecoEmpresa(emp);
        if (!address) continue;

        await new Promise<void>((resolve) => {
          geocoder.geocode({ address, region: "BR" }, (results, status) => {
            if (cancelled) {
              resolve();
              return;
            }
            if (status === "OK" && results?.[0]?.geometry?.location) {
              const loc = results[0].geometry.location;
              setGeocodeByCnpj((prev) => ({
                ...prev,
                [emp.cnpj]: { lat: loc.lat(), lng: loc.lng() },
              }));
            } else {
              errs += 1;
              setGeocodeErrors(errs);
            }
            window.setTimeout(resolve, 140);
          });
        });
      }
      setGeocodeRunning(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, empresas]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m || plotPoints.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    plotPoints.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
    if (plotPoints.length === 1) {
      m.setCenter({ lat: plotPoints[0].lat, lng: plotPoints[0].lng });
      m.setZoom(14);
      return;
    }
    m.fitBounds(bounds, 48);
  }, [plotPoints]);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  useEffect(() => {
    if (loadError) toast.error("Falha ao carregar o script do Google Maps.");
  }, [loadError]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Mapa de Calor – Concentração por Município</h1>
        <p className="text-sm text-muted-foreground">
          Distribuição das empresas da última prospecção no Google Maps; endereços sem coordenadas são geocodificados
          automaticamente.
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

      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 text-xs md:text-sm">
            <Badge variant="outline" className="bg-muted/40">
              Pontos no mapa: <span className="ml-1 font-semibold">{plotPoints.length}</span>
            </Badge>
            <Badge variant="outline" className="bg-muted/40">
              Empresas na lista: <span className="ml-1 font-semibold">{empresas.length}</span>
            </Badge>
            <Badge variant="outline" className="bg-muted/40">
              Capital social total: <span className="ml-1 font-semibold">{formatCurrency(totalCapital)}</span>
            </Badge>
            {(geocodeRunning || geocodeErrors > 0) && (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400">
                {geocodeRunning ? "Geocodificando endereços…" : null}
                {!geocodeRunning && geocodeErrors > 0 ? `${geocodeErrors} endereço(s) não localizado(s)` : null}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="h-[420px] w-full bg-muted/30 flex items-center justify-center">
            {!isLoaded ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando Google Maps…
              </div>
            ) : (
              <GoogleMap
                mapContainerStyle={mapContainerStyle}
                center={mapCenter}
                zoom={6}
                onLoad={onMapLoad}
                options={{
                  streetViewControl: false,
                  mapTypeControl: false,
                  fullscreenControl: true,
                }}
              >
                {plotPoints.map((p, idx) => {
                  const emp = p.empresa;
                  const score = emp.score_icp ?? 50;
                  const normalized = Math.max(0, Math.min(score, 100));
                  const scale = 6 + (normalized / 100) * 10;
                  const title = [
                    emp.nome_fantasia || emp.razao_social,
                    `${emp.cidade || ""} / ${emp.uf || ""}`,
                    p.viaGeocode ? "(localização por endereço)" : "",
                  ]
                    .filter(Boolean)
                    .join("\n");

                  return (
                    <Marker
                      key={`${emp.cnpj}-${idx}`}
                      position={{ lat: p.lat, lng: p.lng }}
                      title={title}
                      icon={{
                        path: google.maps.SymbolPath.CIRCLE,
                        scale,
                        fillColor: "#38bdf8",
                        fillOpacity: 0.35 + (normalized / 100) * 0.5,
                        strokeColor: "#0ea5e9",
                        strokeWeight: 1,
                      }}
                    />
                  );
                })}
              </GoogleMap>
            )}
          </div>
        </CardContent>
      </Card>

      <RegionalTable municipiosAgg={municipiosAgg} loading={loading} />
    </div>
  );
}

// ----------------------
// Leaflet fallback (sem chave ou desenvolvimento)
// ----------------------

function HeatmapLeafletFallback({
  empresas,
  execucao,
  municipiosAgg,
  totalCapital,
  mapCenter,
  loading,
}: {
  empresas: Empresa[];
  execucao: ExecucaoResumo | null;
  municipiosAgg: MunicipioAgg[];
  totalCapital: number;
  mapCenter: [number, number];
  loading: boolean;
}) {
  const empresasComGeo = useMemo(
    () => empresas.filter((e) => e.latitude != null && e.longitude != null),
    [empresas],
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Mapa de Calor – Concentração por Município</h1>
        <p className="text-sm text-muted-foreground">
          {!import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ? (
            <>
              Defina <code className="text-xs bg-muted px-1 rounded">VITE_GOOGLE_MAPS_API_KEY</code> no{" "}
              <code className="text-xs bg-muted px-1 rounded">.env</code> para usar Google Maps e geocodificar endereços da
              prospecção. Sem chave, apenas pontos com latitude/longitude já preenchidos aparecem abaixo (Leaflet/OSM).
            </>
          ) : (
            <>Distribuição das empresas filtradas por município, com base na última prospecção.</>
          )}
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

      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 text-xs md:text-sm">
            <Badge variant="outline" className="bg-muted/40">
              Pontos de mapa: <span className="ml-1 font-semibold">{empresasComGeo.length}</span>
            </Badge>
            <Badge variant="outline" className="bg-muted/40">
              Empresas somadas: <span className="ml-1 font-semibold">{empresas.length}</span>
            </Badge>
            <Badge variant="outline" className="bg-muted/40">
              Capital social total: <span className="ml-1 font-semibold">{formatCurrency(totalCapital)}</span>
            </Badge>
          </div>
        </CardContent>
      </Card>

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
                const radius = 6 + (normalized / 100) * 12;
                const fillOpacity = 0.25 + (normalized / 100) * 0.6;

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
                        <div className="font-semibold">{emp.nome_fantasia || emp.razao_social}</div>
                        <div>
                          {emp.cidade} / {emp.uf}
                        </div>
                        {emp.capital_social != null && <div>Capital: {formatCurrency(emp.capital_social)}</div>}
                        {emp.segmento && <div>Segmento: {emp.segmento}</div>}
                        {emp.score_icp != null && <div>Score ICP: {emp.score_icp.toFixed(1)}</div>}
                      </div>
                    </LeafletTooltip>
                  </CircleMarker>
                );
              })}
            </MapContainer>
          </div>
        </CardContent>
      </Card>

      <RegionalTable municipiosAgg={municipiosAgg} loading={loading} />
    </div>
  );
}

function RegionalTable({ municipiosAgg, loading }: { municipiosAgg: MunicipioAgg[]; loading: boolean }) {
  if (loading) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Concentração Regional</CardTitle>
        <p className="text-xs text-muted-foreground">Municípios com maior densidade de empresas após os filtros ICP.</p>
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
                        <div className="h-full rounded-full bg-rose-500" style={{ width: `${m.intensidade}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground">{m.intensidade}%</span>
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
  );
}

// ----------------------
// Página
// ----------------------

export default function HeatmapPage() {
  const [loading, setLoading] = useState(true);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [execucao, setExecucao] = useState<ExecucaoResumo | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_CENTER);

  const googleKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim();

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

        const empresasComGeo = payload.resultados.filter((e) => e.latitude != null && e.longitude != null);
        if (empresasComGeo.length > 0) {
          const mediaLat =
            empresasComGeo.reduce((acc, e) => acc + (e.latitude ?? 0), 0) / empresasComGeo.length;
          const mediaLng =
            empresasComGeo.reduce((acc, e) => acc + (e.longitude ?? 0), 0) / empresasComGeo.length;
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

  const totalCapital = useMemo(() => empresas.reduce((acc, e) => acc + (e.capital_social ?? 0), 0), [empresas]);

  const municipiosAgg: MunicipioAgg[] = useMemo(() => {
    const mapa: Record<string, { municipio: string; uf: string; empresas: number; capital: number }> = {};

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
    const maxEmpresas = lista.reduce((max, item) => (item.empresas > max ? item.empresas : max), 0);

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

  if (googleKey) {
    return (
      <HeatmapGoogleInner
        empresas={empresas}
        execucao={execucao}
        municipiosAgg={municipiosAgg}
        totalCapital={totalCapital}
        loading={loading}
      />
    );
  }

  return (
    <HeatmapLeafletFallback
      empresas={empresas}
      execucao={execucao}
      municipiosAgg={municipiosAgg}
      totalCapital={totalCapital}
      mapCenter={mapCenter}
      loading={loading}
    />
  );
}
