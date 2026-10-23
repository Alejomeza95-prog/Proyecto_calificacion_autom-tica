<#
.SYNOPSIS
  Verifica el entorno local de HT-CORE-01 (plan.md seccion 9.2) sin imprimir secretos.
.DESCRIPTION
  Imprime una linea [OK] o [FALLA] por comprobacion y termina con codigo 0 si todo pasa, 1 si algo falla.
  Nunca imprime valores de .env, contrasenas ni URIs (RN-04).
.PARAMETER Static
  Solo comprobaciones que no requieren contenedores en ejecucion (1-5).
#>
param([switch]$Static)

$ErrorActionPreference = 'Continue'
Push-Location (Split-Path -Parent $PSScriptRoot)
$script:failed = $false

function Report([bool]$ok, [string]$criterion, [string]$description, [string]$cause = '') {
  if ($ok) {
    Write-Host "[OK] $criterion $description"
  } else {
    $script:failed = $true
    if ($cause) { Write-Host "[FALLA] $criterion ${description}: $cause" }
    else { Write-Host "[FALLA] $criterion $description" }
  }
}

function Read-EnvFile([string]$path) {
  $values = @{}
  foreach ($line in Get-Content -LiteralPath $path) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') { $values[$Matches[1]] = $Matches[2].Trim() }
  }
  return $values
}

try {
  # 1. .env existe (CA-03, RN-02). No se crea aqui: el procedimiento esta en README_SETUP.md (T-02).
  $envExists = Test-Path -LiteralPath '.env'
  Report $envExists 'CA-03' '.env existe' 'crealo con: Copy-Item .env.docker.example .env y reemplaza los marcadores'

  # 2. .env ignorado y no versionado (CA-03, RN-01).
  $null = & git check-ignore -q .env 2>&1
  $ignored = ($LASTEXITCODE -eq 0)
  $null = & git ls-files --error-unmatch .env 2>&1
  $tracked = ($LASTEXITCODE -eq 0)
  Report ($ignored -and -not $tracked) 'CA-03' '.env ignorado por Git y fuera del indice'

  # 3. Plantilla solo con marcadores (CA-03, RN-01).
  $template = Read-EnvFile '.env.docker.example'
  $secretKeys = 'MONGO_ROOT_USER', 'MONGO_ROOT_PASSWORD', 'MONGO_ROOT_PASSWORD_URLENCODED'
  $badKeys = @($secretKeys | Where-Object { -not ($template[$_] -like 'cambiar_*') })
  Report ($badKeys.Count -eq 0) 'CA-03' 'plantilla .env.docker.example solo con marcadores cambiar_*' ("variables sin marcador: " + ($badKeys -join ', '))

  # 4. Ningun archivo .env real versionado (CA-03, RN-01).
  $trackedEnv = @(& git ls-files | Where-Object {
      $name = Split-Path -Leaf $_
      ($name -eq '.env' -or $name -like '.env.*' -or $name -like '*.env') -and
      $name -ne '.env.docker.example' -and $name -ne '.env.example'
    })
  Report ($trackedEnv.Count -eq 0) 'CA-03' 'ningun archivo .env real versionado' ("archivos versionados: " + ($trackedEnv -join ', '))

  # 5. Configuracion de Compose valida (CA-01). La salida se descarta para no exponer valores.
  $null = & docker compose config --quiet 2>&1
  Report ($LASTEXITCODE -eq 0) 'CA-01' 'docker compose config --quiet' 'configuracion invalida o variable faltante; revisa .env contra la plantilla'

  if (-not $Static) {
    # 6. Motor Docker operativo.
    $null = & docker info 2>&1
    if ($LASTEXITCODE -ne 0) {
      Report $false 'CA-02' 'motor Docker operativo' 'Docker no operativo; inicia Docker Desktop y repite'
    } else {
      Report $true 'CA-02' 'motor Docker operativo'

      # 7. mongo y redis healthy (CA-02, CA-04). Compose puede devolver un arreglo JSON o una linea JSON por servicio.
      $raw = (& docker compose ps --all --format json 2>$null) -join "`n"
      $services = @()
      if ($raw.Trim().StartsWith('[')) { $services = @($raw | ConvertFrom-Json) }
      else { $services = @($raw -split "`n" | Where-Object { $_.Trim() } | ForEach-Object { $_ | ConvertFrom-Json }) }

      foreach ($name in 'mongo', 'redis') {
        $svc = $services | Where-Object { $_.Service -eq $name } | Select-Object -First 1
        if (-not $svc) { Report $false 'CA-02' "$name disponible" 'servicio no creado; ejecuta scripts/docker-up.ps1' }
        else { Report ($svc.State -eq 'running' -and $svc.Health -eq 'healthy') 'CA-02' "$name disponible (healthy)" ("estado: " + $svc.State + ", salud: " + $svc.Health) }
      }

      # 8. Perfil app apagado (CA-02, RN-05).
      $appRunning = @($services | Where-Object { $_.Service -in 'api', 'omr', 'web' -and $_.State -eq 'running' } | ForEach-Object { $_.Service })
      Report ($appRunning.Count -eq 0) 'RN-05' 'perfil app apagado' ("en ejecucion: " + ($appRunning -join ', '))

      # 9. Logs sin contrasenas (CA-04, RN-04). Los valores solo se usan en memoria.
      if ($envExists) {
        $localEnv = Read-EnvFile '.env'
        $secrets = @('MONGO_ROOT_PASSWORD', 'MONGO_ROOT_PASSWORD_URLENCODED' | ForEach-Object { $localEnv[$_] } | Where-Object { $_ })
        $logs = (& docker compose logs --no-color mongo redis 2>&1 | Out-String)
        $leaked = @($secrets | Where-Object { $logs.Contains($_) })
        Report ($leaked.Count -eq 0) 'CA-04' 'logs de mongo y redis sin contrasenas' 'se encontro una contrasena en los logs (no se muestra)'
        $secrets = $null; $localEnv = $null; $logs = $null
      } else {
        Report $false 'CA-04' 'logs de mongo y redis sin contrasenas' 'falta .env'
      }
    }
  }
} finally {
  Pop-Location
}

if ($script:failed) { exit 1 } else { exit 0 }
