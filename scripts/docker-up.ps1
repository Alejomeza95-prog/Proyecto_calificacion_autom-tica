# Arranca solo los servicios base (mongo, redis). Valida la configuracion antes de arrancar.
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
  $null = & docker compose config --quiet 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Error "Configuracion de Docker Compose invalida o .env incompleto. Revisa .env contra .env.docker.example (no se arranco nada)."
    exit 1
  }
  docker compose up -d mongo redis
  if ($LASTEXITCODE -ne 0) { Write-Error "docker compose up fallo. Revisa: docker compose logs mongo redis"; exit 1 }
  docker compose ps
} finally {
  Pop-Location
}
