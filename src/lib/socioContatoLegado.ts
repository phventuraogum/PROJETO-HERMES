/**
 * Legado: mesmo contato da empresa copiado para cada sócio no merge antigo.
 * Manter em sincronia com `backend/api/enrichment_merge.py`:
 * `_fonte_socio_eh_so_propagacao_empresa` / `_RE_CADASTRO_EMPRESA_FONTE`.
 */
export const CADASTRO_EMPRESA_FONTE_RE = /cadastro da empresa|cadastro empresa/i;

export function fonteSocioEhSoPropagacaoEmpresa(fonte: string | null | undefined): boolean {
  const f = String(fonte ?? "").trim();
  if (!f) return false;
  if (/assertiva/i.test(f)) return false;
  return CADASTRO_EMPRESA_FONTE_RE.test(f);
}
