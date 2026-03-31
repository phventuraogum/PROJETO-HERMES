# Hermes - Atualizar producao na VPS (rodar no seu PC)
# Atualiza o codigo na VPS (git pull) e refaz o deploy (front + API).

param(
    [string]$HostVps = "root@31.97.241.171"
)

$Commands = 'cd /opt/hermes && sudo bash scripts/pull_and_deploy_vps.sh'

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Hermes - Atualizando producao na VPS" -ForegroundColor Cyan
Write-Host "  Host: $HostVps" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Comando na VPS: git pull + deploy.sh" -ForegroundColor Yellow
Write-Host ""

ssh $HostVps $Commands

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Atualizacao concluida. Acesse o site para ver o front novo." -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Erro ao atualizar. Verifique o output acima." -ForegroundColor Red
    exit 1
}
