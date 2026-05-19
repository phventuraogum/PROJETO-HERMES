/**
 * Brand label config — fonte única para nome do produto visível ao cliente.
 *
 * Hermes é o nome interno do código (URL, repo, código, ClickUp space).
 * "Pinn Outbound" é o nome comercial — alinhado às linhas Pinn BAI / Sales
 * Agent / APA da Pinn PB.
 *
 * Decisão narrativa (display vs alias) está em
 * docs/adrs/ADR-002-rebrand-ui-hermes-pinn-outbound.md. Enquanto a Mesa não
 * bater martelo, default mantém status quo (productAlias visível).
 *
 * Para trocar nome no produto inteiro: editar BRAND aqui. Único arquivo.
 */
export const BRAND = {
  /** Nome principal visível ao cliente (header, sidebar, login, OG). */
  product: "Hermes",

  /** Alias secundário (badge mute). Null = sem alias. Pós-decisão Mesa: alternar entre "Pinn Outbound" e null. */
  productAlias: null as string | null,

  /** Organização legal — usado em copyright e atribuição. */
  org: "Pinn PB",

  /** Copyright line — recalcula ano automaticamente. */
  copyright: `© ${new Date().getFullYear()} Pinn PB`,

  /** Tagline curta — usada em <title> e OG. */
  tagline: "Prospecção B2B Inteligente",
} as const;
