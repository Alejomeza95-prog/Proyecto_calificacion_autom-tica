# Apaga los servicios conservando los volumenes (datos). Nunca usa -v; para borrar datos existe scripts/docker-reset.ps1.
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
  docker compose down
  if ($LASTEXITCODE -ne 0) { Write-Error "docker compose down fallo."; exit 1 }
} finally {
  Pop-Location
}
