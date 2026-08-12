import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import RefreshIcon from "@mui/icons-material/Refresh";
import LanguageIcon from "@mui/icons-material/Language";
import GroupsIcon from "@mui/icons-material/Groups";
import StoreIcon from "@mui/icons-material/Store";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import CategoryIcon from "@mui/icons-material/Category";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import CodeIcon from "@mui/icons-material/Code";
import { buscarDossieEmpresa, type DossieHermes } from "@/lib/api";
import RawDataView from "./RawDataView";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; data: DossieHermes }
  | { status: "error"; message: string };

interface Props {
  cnpj: string;
  /** Se `true`, dispara o fetch ao montar. Default `true`. */
  autoload?: boolean;
}

function _useToggle(initial = false) {
  const [v, setV] = useState(initial);
  return [v, () => setV((x) => !x)] as const;
}

const labelSx = {
  fontSize: 10,
  fontWeight: 600,
  textTransform: "uppercase" as const,
  letterSpacing: "0.12em",
  color: "text.secondary",
  display: "flex",
  alignItems: "center",
  gap: 0.5,
  mb: 1.5,
};

function formatBRL(value: number | null): string | null {
  if (value == null || Number.isNaN(value)) return null;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function DossieHermesSection({ cnpj, autoload = true }: Props) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [showRaw, toggleRaw] = _useToggle(false);
  const theme = useTheme();
  const sectionSx = useMemo(
    () => ({
      borderRadius: "12px" as const,
      border: "1px solid",
      borderColor: "divider",
      bgcolor:
        theme.palette.mode === "light"
          ? alpha(theme.palette.grey[100], 0.95)
          : alpha(theme.palette.common.white, 0.04),
      p: 2,
    }),
    [theme],
  );

  async function load() {
    setState({ status: "loading" });
    try {
      const data = await buscarDossieEmpresa(cnpj, { descobrirFiliais: true });
      setState({ status: "ok", data });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Falha ao buscar dossiê",
      });
    }
  }

  useEffect(() => {
    if (!autoload) return;
    if (!cnpj) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cnpj]);

  if (state.status === "idle" || state.status === "loading") {
    return (
      <Box sx={sectionSx}>
        <Typography sx={labelSx}>
          <LanguageIcon sx={{ fontSize: 12 }} /> Dossiê Hermes (Receita Federal)
        </Typography>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <CircularProgress size={14} thickness={5} />
          <Typography variant="caption" color="text.secondary">
            Carregando dados de Receita Federal, sócios, filiais e site oficial…
          </Typography>
        </Stack>
      </Box>
    );
  }

  if (state.status === "error") {
    return (
      <Box sx={sectionSx}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography sx={labelSx}>
            <LanguageIcon sx={{ fontSize: 12 }} /> Dossiê Hermes (Receita)
          </Typography>
          <Tooltip title="Tentar novamente">
            <IconButton size="small" onClick={() => load()}>
              <RefreshIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        </Stack>
        <Typography variant="caption" color="error">
          {state.message}
        </Typography>
      </Box>
    );
  }

  const d = state.data;
  const enderecoLinha = [
    d.endereco?.tipo_logradouro,
    d.endereco?.logradouro,
    d.endereco?.numero,
    d.endereco?.complemento,
  ]
    .filter(Boolean)
    .join(" ");
  const enderecoExtras = [
    d.endereco?.bairro,
    d.endereco?.cep ? `CEP ${d.endereco.cep}` : null,
    [d.endereco?.cidade, d.endereco?.uf].filter(Boolean).join(" / "),
  ]
    .filter(Boolean)
    .join(" · ");

  const filiaisExternas = d.filiais.filter((f) => !f.is_self);
  const filiaisAtivas = filiaisExternas.filter((f) =>
    (f.situacao || "").toLowerCase().includes("ativ"),
  );

  return (
    <Box sx={sectionSx}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
        <Typography sx={{ ...labelSx, mb: 0 }}>
          <LanguageIcon sx={{ fontSize: 12 }} /> Dossiê Hermes ({d.fonte})
        </Typography>
        <Stack direction="row" spacing={0.25}>
          <Tooltip title={showRaw ? "Ocultar JSON cru" : "Ver JSON cru do dossiê"}>
            <IconButton size="small" onClick={toggleRaw}>
              <CodeIcon sx={{ fontSize: 14, color: showRaw ? "primary.main" : undefined }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Atualizar dossiê (descarta cache)">
            <IconButton size="small" onClick={() => load()}>
              <RefreshIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      {showRaw && (
        <Box sx={{ mb: 2 }}>
          <RawDataView
            data={d}
            title="Dossiê Hermes (JSON cru)"
            highlight={["cnpj", "telefone", "whatsapp", "email", "site", "ie", "cnae"]}
          />
        </Box>
      )}

      <Stack spacing={2}>
        {/* Resumo cadastral */}
        <Box>
          <Stack direction="row" flexWrap="wrap" spacing={0.75} sx={{ mb: 1 }}>
            {d.tipo && (
              <Chip
                label={d.tipo.toUpperCase()}
                size="small"
                color={d.tipo.toLowerCase() === "matriz" ? "primary" : "default"}
                variant="outlined"
                sx={{ fontSize: 10 }}
              />
            )}
            {d.situacao_cadastral && (
              <Chip
                label={d.situacao_cadastral}
                size="small"
                color={
                  d.situacao_cadastral.toLowerCase() === "ativa"
                    ? "success"
                    : "warning"
                }
                variant="outlined"
                sx={{ fontSize: 10 }}
              />
            )}
            {d.porte && (
              <Chip label={d.porte} size="small" variant="outlined" sx={{ fontSize: 10 }} />
            )}
          </Stack>
          <Stack spacing={0.5}>
            {d.razao_social && (
              <Typography variant="caption" color="text.secondary">
                <strong style={{ color: "rgba(240,240,240,0.5)" }}>Razão social:</strong>{" "}
                {d.razao_social}
              </Typography>
            )}
            {d.nome_fantasia && (
              <Typography variant="caption" color="text.secondary">
                <strong style={{ color: "rgba(240,240,240,0.5)" }}>Nome fantasia:</strong>{" "}
                {d.nome_fantasia}
              </Typography>
            )}
            {d.natureza_juridica && (
              <Typography variant="caption" color="text.secondary">
                <strong style={{ color: "rgba(240,240,240,0.5)" }}>Natureza jurídica:</strong>{" "}
                {d.natureza_juridica}
              </Typography>
            )}
            {d.qualificacao_responsavel && (
              <Typography variant="caption" color="text.secondary">
                <strong style={{ color: "rgba(240,240,240,0.5)" }}>Resp. legal:</strong>{" "}
                {d.qualificacao_responsavel}
              </Typography>
            )}
            {formatBRL(d.capital_social) && (
              <Typography variant="caption" color="text.secondary">
                <strong style={{ color: "rgba(240,240,240,0.5)" }}>Capital social:</strong>{" "}
                {formatBRL(d.capital_social)}
              </Typography>
            )}
            {d.data_inicio_atividade && (
              <Typography variant="caption" color="text.secondary">
                <strong style={{ color: "rgba(240,240,240,0.5)" }}>Início atividade:</strong>{" "}
                {d.data_inicio_atividade}
              </Typography>
            )}
            {d.atualizado_em && (
              <Typography variant="caption" color="text.disabled">
                Atualizado em {d.atualizado_em} (Receita)
              </Typography>
            )}
          </Stack>
        </Box>

        {(enderecoLinha || enderecoExtras) && (
          <Box>
            <Typography variant="caption" color="text.disabled" sx={{ display: "block" }}>
              Endereço fiscal
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {enderecoLinha || "—"}
              {enderecoExtras && (
                <span style={{ display: "block", color: "rgba(240,240,240,0.5)" }}>
                  {enderecoExtras}
                </span>
              )}
            </Typography>
          </Box>
        )}

        {(d.contatos_receita.telefone1 ||
          d.contatos_receita.telefone2 ||
          d.contatos_receita.email) && (
          <Box>
            <Typography variant="caption" color="text.disabled" sx={{ display: "block", mb: 0.5 }}>
              Contatos da Receita
            </Typography>
            <Stack spacing={0.25}>
              {d.contatos_receita.telefone1 && (
                <Typography variant="caption">
                  <span style={{ color: "rgba(240,240,240,0.5)" }}>Telefone 1:</span>{" "}
                  {d.contatos_receita.telefone1}
                </Typography>
              )}
              {d.contatos_receita.telefone2 && (
                <Typography variant="caption">
                  <span style={{ color: "rgba(240,240,240,0.5)" }}>Telefone 2:</span>{" "}
                  {d.contatos_receita.telefone2}
                </Typography>
              )}
              {d.contatos_receita.email && (
                <Typography variant="caption">
                  <span style={{ color: "rgba(240,240,240,0.5)" }}>E-mail:</span>{" "}
                  <a
                    href={`mailto:${d.contatos_receita.email}`}
                    style={{ color: "#0ea5e9" }}
                  >
                    {d.contatos_receita.email}
                  </a>
                </Typography>
              )}
            </Stack>
          </Box>
        )}

        <Divider sx={{ borderColor: "rgba(255,255,255,0.06)" }} />

        {/* CNAE principal + secundárias COMPLETAS */}
        <Box>
          <Typography sx={{ ...labelSx, mb: 0.75 }}>
            <CategoryIcon sx={{ fontSize: 12 }} /> CNAEs ({d.cnaes_secundarias.length} secundárias)
          </Typography>
          <Stack spacing={0.5}>
            {d.cnae_principal?.subclasse && (
              <Typography variant="caption">
                <strong style={{ color: "#10b981" }}>Principal:</strong>{" "}
                <span style={{ fontFamily: "monospace" }}>{d.cnae_principal.subclasse}</span>{" "}
                — {d.cnae_principal.descricao}
              </Typography>
            )}
            {d.cnaes_secundarias.map((c, i) => (
              <Typography key={`${c.subclasse}-${i}`} variant="caption" color="text.secondary">
                <span style={{ fontFamily: "monospace", color: "rgba(240,240,240,0.6)" }}>
                  {c.subclasse}
                </span>{" "}
                — {c.descricao}
              </Typography>
            ))}
          </Stack>
        </Box>

        {/* Inscrições Estaduais */}
        {d.inscricoes_estaduais.length > 0 && (
          <>
            <Divider sx={{ borderColor: "rgba(255,255,255,0.06)" }} />
            <Box>
              <Typography sx={{ ...labelSx, mb: 0.75 }}>
                <ReceiptLongIcon sx={{ fontSize: 12 }} /> Inscrições estaduais (
                {d.inscricoes_estaduais.length})
              </Typography>
              <Stack direction="row" flexWrap="wrap" spacing={0.5} useFlexGap>
                {d.inscricoes_estaduais.map((ie, i) => (
                  <Chip
                    key={`${ie.uf}-${ie.ie}-${i}`}
                    size="small"
                    label={`${ie.uf}: ${ie.ie}${ie.ativa ? "" : " (inativa)"}`}
                    color={ie.ativa ? "success" : "default"}
                    variant="outlined"
                    sx={{ fontSize: 10 }}
                  />
                ))}
              </Stack>
            </Box>
          </>
        )}

        {/* Sócios (QSA) */}
        {d.socios.length > 0 && (
          <>
            <Divider sx={{ borderColor: "rgba(255,255,255,0.06)" }} />
            <Box>
              <Typography sx={{ ...labelSx, mb: 0.75 }}>
                <GroupsIcon sx={{ fontSize: 12 }} /> Quadro Societário (QSA — {d.socios.length})
              </Typography>
              <Stack spacing={1}>
                {d.socios.map((s, i) => (
                  <Box
                    key={`${s.cpf_cnpj}-${i}`}
                    sx={{
                      borderRadius: "8px",
                      border: "1px solid rgba(255,255,255,0.05)",
                      p: 1.25,
                      bgcolor: "rgba(255,255,255,0.02)",
                    }}
                  >
                    <Stack direction="row" justifyContent="space-between" spacing={1}>
                      <Typography variant="caption" fontWeight={600}>
                        {s.nome || "(sem nome)"}
                      </Typography>
                      {s.tipo && (
                        <Chip
                          size="small"
                          label={s.tipo.toUpperCase()}
                          variant="outlined"
                          sx={{ fontSize: 9, height: 18 }}
                        />
                      )}
                    </Stack>
                    <Stack spacing={0.25} sx={{ mt: 0.5 }}>
                      {s.cpf_cnpj && (
                        <Typography
                          variant="caption"
                          sx={{ fontFamily: "monospace", color: "text.disabled" }}
                        >
                          {s.cpf_cnpj}
                        </Typography>
                      )}
                      {s.qualificacao && (
                        <Typography variant="caption" color="text.secondary">
                          {s.qualificacao}
                        </Typography>
                      )}
                      {s.faixa_etaria && (
                        <Typography variant="caption" color="text.disabled">
                          Faixa etária: {s.faixa_etaria}
                        </Typography>
                      )}
                      {s.data_entrada && (
                        <Typography variant="caption" color="text.disabled">
                          Entrou em {s.data_entrada}
                        </Typography>
                      )}
                      {s.representante && (
                        <Typography variant="caption" color="text.secondary">
                          <span style={{ color: "rgba(240,240,240,0.5)" }}>Repr. legal:</span>{" "}
                          {s.representante}
                          {s.qualificacao_representante && ` (${s.qualificacao_representante})`}
                        </Typography>
                      )}
                    </Stack>
                  </Box>
                ))}
              </Stack>
            </Box>
          </>
        )}

        {/* Filiais */}
        {filiaisExternas.length > 0 && (
          <>
            <Divider sx={{ borderColor: "rgba(255,255,255,0.06)" }} />
            <Box>
              <Typography sx={{ ...labelSx, mb: 0.75 }}>
                <StoreIcon sx={{ fontSize: 12 }} /> Filiais ({filiaisExternas.length} •{" "}
                {filiaisAtivas.length} ativas)
              </Typography>
              <Stack spacing={1}>
                {filiaisExternas.map((f, i) => (
                  <Box
                    key={`${f.cnpj}-${i}`}
                    sx={{
                      borderRadius: "8px",
                      border: "1px solid rgba(255,255,255,0.05)",
                      p: 1.25,
                      bgcolor: "rgba(255,255,255,0.02)",
                    }}
                  >
                    <Stack direction="row" justifyContent="space-between" spacing={1}>
                      <Typography variant="caption" sx={{ fontFamily: "monospace" }}>
                        {f.cnpj}
                      </Typography>
                      <Chip
                        size="small"
                        label={f.situacao || "—"}
                        color={
                          (f.situacao || "").toLowerCase().includes("ativ")
                            ? "success"
                            : "default"
                        }
                        variant="outlined"
                        sx={{ fontSize: 9, height: 18 }}
                      />
                    </Stack>
                    <Stack spacing={0.25} sx={{ mt: 0.5 }}>
                      {(f.cidade || f.uf) && (
                        <Typography variant="caption" color="text.secondary">
                          {[f.cidade, f.uf].filter(Boolean).join(" / ")}
                        </Typography>
                      )}
                      {f.atividade_principal && (
                        <Typography variant="caption" color="text.disabled">
                          {f.atividade_principal}
                        </Typography>
                      )}
                      {f.telefone && (
                        <Typography variant="caption" color="text.disabled">
                          ☏ {f.telefone}
                        </Typography>
                      )}
                      {f.email && (
                        <Typography variant="caption">
                          <a href={`mailto:${f.email}`} style={{ color: "#0ea5e9" }}>
                            {f.email}
                          </a>
                        </Typography>
                      )}
                      {f.data_inicio && (
                        <Typography variant="caption" color="text.disabled">
                          Início: {f.data_inicio}
                          {f.data_situacao && ` · Situação desde ${f.data_situacao}`}
                        </Typography>
                      )}
                    </Stack>
                  </Box>
                ))}
              </Stack>
            </Box>
          </>
        )}

        {/* Site oficial */}
        {d.site_oficial && d.site_oficial.url && (
          <>
            <Divider sx={{ borderColor: "rgba(255,255,255,0.06)" }} />
            <Box>
              <Typography sx={{ ...labelSx, mb: 0.75 }}>
                <OpenInNewIcon sx={{ fontSize: 12 }} /> Site oficial
              </Typography>
              <Typography variant="caption">
                <a
                  href={d.site_oficial.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "#0ea5e9" }}
                >
                  {d.site_oficial.url}
                </a>
              </Typography>
              {d.site_oficial.contatos_extraidos && (
                <Stack spacing={0.5} sx={{ mt: 0.75 }}>
                  {d.site_oficial.contatos_extraidos.emails.length > 0 && (
                    <Typography variant="caption" color="text.secondary">
                      <span style={{ color: "rgba(240,240,240,0.5)" }}>E-mails:</span>{" "}
                      {d.site_oficial.contatos_extraidos.emails.join(" · ")}
                    </Typography>
                  )}
                  {d.site_oficial.contatos_extraidos.telefones.length > 0 && (
                    <Typography variant="caption" color="text.secondary">
                      <span style={{ color: "rgba(240,240,240,0.5)" }}>Telefones:</span>{" "}
                      {d.site_oficial.contatos_extraidos.telefones.join(" · ")}
                    </Typography>
                  )}
                  {d.site_oficial.contatos_extraidos.whatsapps.length > 0 && (
                    <Typography variant="caption" color="text.secondary">
                      <span style={{ color: "rgba(240,240,240,0.5)" }}>WhatsApp:</span>{" "}
                      {d.site_oficial.contatos_extraidos.whatsapps.join(" · ")}
                    </Typography>
                  )}
                  {Object.keys(d.site_oficial.contatos_extraidos.redes_sociais).length > 0 && (
                    <Typography variant="caption" color="text.secondary">
                      <span style={{ color: "rgba(240,240,240,0.5)" }}>Redes:</span>{" "}
                      {Object.entries(d.site_oficial.contatos_extraidos.redes_sociais)
                        .map(([plat, slug]) => `${plat}: ${slug}`)
                        .join(" · ")}
                    </Typography>
                  )}
                </Stack>
              )}
            </Box>
          </>
        )}
      </Stack>
    </Box>
  );
}
