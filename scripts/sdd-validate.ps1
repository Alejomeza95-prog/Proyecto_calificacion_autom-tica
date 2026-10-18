# Valida la trazabilidad SDD de una historia: specs/<ID>/spec.md, plan.md y tasks.md.
# Solo lectura: no modifica archivos. Codigo de salida 0 si no hay fallas, 1 si las hay.
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/sdd-validate.ps1 -Id HU-EVAL-002 [-RequireReady] [-SpecsRoot specs]
param(
  [Parameter(Mandatory = $true)][string]$Id,
  [string]$SpecsRoot = '',
  [switch]$RequireReady
)

$ErrorActionPreference = 'Stop'
if (-not $SpecsRoot) { $SpecsRoot = Join-Path (Split-Path -Parent $PSScriptRoot) 'specs' }
# Caracteres no ASCII por codigo: Windows PowerShell 5.1 lee los .ps1 sin BOM como ANSI
$SEC = [string][char]0x00A7    # simbolo de seccion
$DASH = [string][char]0x2014   # raya
$script:fails = 0
$script:warns = 0
function Ok([string]$m)   { Write-Host "[OK]    $m" }
function Fail([string]$m) { Write-Host "[FALLA] $m"; $script:fails++ }
function Warn([string]$m) { Write-Host "[AVISO] $m"; $script:warns++ }

function Get-Status([string]$text) {
  if ($text -match '(?m)^status:\s*([a-z-]+)') { return $Matches[1] } else { return $null }
}
function Get-FrontId([string]$text) {
  if ($text -match '(?m)^id:\s*(\S+)') { return $Matches[1] } else { return $null }
}
# IDs citados (CA-01, RN-02, RNF-03), excluyendo los tachados ~~CA-01~~
function Get-Refs([string]$text, [string]$prefix) {
  $clean = [regex]::Replace($text, '~~[^~]*~~', '')
  $set = @{}
  foreach ($m in [regex]::Matches($clean, "\b$prefix-\d{2,}\b")) { $set[$m.Value] = $true }
  return @($set.Keys | Sort-Object)
}

$dir = Join-Path $SpecsRoot $Id
Write-Host "Validacion SDD de $Id ($dir)"
if (-not (Test-Path $dir)) { Fail "No existe la carpeta $dir"; exit 1 }

$docs = @{}
foreach ($name in 'spec', 'plan', 'tasks') {
  $path = Join-Path $dir "$name.md"
  if (Test-Path $path) { $docs[$name] = Get-Content -Raw -Encoding UTF8 $path; Ok "$name.md existe" }
  else { Fail "$name.md no existe" }
}
if ($script:fails -gt 0) { Write-Host "Resultado: $($script:fails) falla(s)"; exit 1 }

# --- Front matter: id y estado ---
$valid = @{
  spec  = @('draft', 'ready', 'in-progress', 'in-review', 'done')
  plan  = @('draft', 'ready')
  tasks = @('draft', 'ready', 'in-progress', 'in-review', 'done')
}
$status = @{}
foreach ($name in 'spec', 'plan', 'tasks') {
  $fid = Get-FrontId $docs[$name]
  if ($fid -ne $Id) { Fail "$name.md: id '$fid' no coincide con '$Id'" }
  $st = Get-Status $docs[$name]
  $status[$name] = $st
  if ($valid[$name] -contains $st) { Ok "$name.md: status $st" } else { Fail "$name.md: status '$st' invalido (validos: $($valid[$name] -join ', '))" }
  if ($docs[$name] -match 'HU-XXXX|<T.tulo>') { Warn "$name.md conserva marcadores de la plantilla (HU-XXXX / <Titulo>)" }
}

$readyOrLater = @('ready', 'in-progress', 'in-review', 'done')
if ($readyOrLater -contains $status.plan -and -not ($readyOrLater -contains $status.spec)) { Fail "plan.md esta en ready pero spec.md no" }
if ($readyOrLater -contains $status.tasks -and -not ($status.plan -eq 'ready' -and ($readyOrLater -contains $status.spec))) { Fail "tasks.md esta en $($status.tasks) pero spec.md y plan.md no estan en ready" }
if ($RequireReady) {
  if (-not ($readyOrLater -contains $status.spec)) { Fail "spec.md debe estar en ready para implementar" }
  if ($status.plan -ne 'ready') { Fail "plan.md debe estar en ready para implementar" }
  if (-not ($readyOrLater -contains $status.tasks)) { Fail "tasks.md debe estar en ready para implementar" }
}

# --- IDs definidos en la spec ---
$specClean = [regex]::Replace($docs.spec, '~~[^~]*~~', '')
$ca  = @([regex]::Matches($specClean, '(?m)^#{2,4}\s*(CA-\d{2,})') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
$rn  = @([regex]::Matches($specClean, '\*\*(RN-\d{2,})') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
$rnf = @([regex]::Matches($specClean, '\*\*(RNF-\d{2,})') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
if ($ca.Count -eq 0) { Fail "spec.md no define criterios de aceptacion (### CA-NN)" } else { Ok "spec.md define $($ca.Count) CA, $($rn.Count) RN, $($rnf.Count) RNF" }
$defined = @{}
foreach ($x in $ca + $rn + $rnf) { $defined[$x] = $true }

# --- Referencias inexistentes en plan y tasks ---
foreach ($name in 'plan', 'tasks') {
  foreach ($prefix in 'CA', 'RN', 'RNF') {
    foreach ($ref in Get-Refs $docs[$name] $prefix) {
      if (-not $defined.ContainsKey($ref)) { Fail "$name.md cita $ref, que no existe (o esta retirado) en spec.md" }
    }
  }
}

# --- Tareas ---
$planSections = @{}
foreach ($m in [regex]::Matches($docs.plan, '(?m)^##\s+(\d+)\.')) { $planSections[$m.Groups[1].Value] = $true }
$taskIds = @{}
$covered = @{}
$rows = [regex]::Matches($docs.tasks, '(?m)^\|\s*(T-\d{2,})\s*\|(.*)$')
foreach ($row in $rows) {
  $tid = $row.Groups[1].Value
  if ($taskIds.ContainsKey($tid)) { Fail "tasks.md: $tid esta duplicada" }
  $taskIds[$tid] = $true
  $cols = $row.Groups[2].Value.Split('|') | ForEach-Object { $_.Trim() }
  if ($cols.Count -lt 4) { Fail "${tid}: fila con columnas insuficientes"; continue }
  $cubre = $cols[1]; $planRef = $cols[2]; $verif = $cols[3]
  $refs = @([regex]::Matches($cubre, '\b(?:CA|RN|RNF)-\d{2,}\b') | ForEach-Object { $_.Value })
  # Rangos CA-01..CA-05 o CA-01..05
  foreach ($r in [regex]::Matches($cubre, '\b(CA|RN|RNF)-(\d{2,})\s*\.\.\s*(?:\1-)?(\d{2,})\b')) {
    $p = $r.Groups[1].Value; $w = $r.Groups[2].Value.Length
    for ($i = [int]$r.Groups[2].Value; $i -le [int]$r.Groups[3].Value; $i++) { $refs += ('{0}-{1}' -f $p, $i.ToString().PadLeft($w, '0')) }
  }
  foreach ($x in $refs) { $covered[$x] = $true }
  if ($cubre -match '(?i)\bTodos\b') { foreach ($x in $defined.Keys) { $covered[$x] = $true } }
  if ($refs.Count -eq 0 -and $cubre -notmatch '(?i)soporte|todos') { Fail "${tid}: columna Cubre sin CA/RN/RNF ni 'Soporte'" }
  if ($planRef -notmatch "$SEC\s*\d" -and $planRef -notmatch "^($DASH|-|n/a)$") { Fail "${tid}: columna Plan sin seccion del plan" }
  foreach ($s in [regex]::Matches($planRef, "$SEC\s*(\d+)")) {
    if (-not $planSections.ContainsKey($s.Groups[1].Value)) { Fail "${tid}: cita la seccion $($s.Groups[1].Value) del plan, que no existe en plan.md" }
  }
  if ([string]::IsNullOrWhiteSpace($verif)) { Fail "${tid}: sin verificacion" }
}
if ($taskIds.Count -eq 0) { Fail "tasks.md no contiene tareas T-NN" } else { Ok "tasks.md contiene $($taskIds.Count) tareas" }
if ($docs.tasks -notmatch '(?i)sdd-release') { Fail "tasks.md no incluye la tarea de release (/sdd-release)" }

# --- Cobertura: cada CA y RN en plan y tareas ---
$planText = [regex]::Replace($docs.plan, '~~[^~]*~~', '')
foreach ($x in $ca + $rn) {
  if ($planText -notmatch "\b$x\b") { Fail "$x no aparece en plan.md (diseno o estrategia de pruebas)" }
  if (-not $covered.ContainsKey($x)) { Fail "$x no esta cubierto por ninguna tarea" }
}
foreach ($x in $rnf) { if (-not $covered.ContainsKey($x)) { Warn "$x no esta cubierto por ninguna tarea" } }
if ($ca.Count -gt 0) {
  $section12 = ''
  if ($planText -match '(?s)##\s+12\.(.*?)(\r?\n##\s+\d+\.|$)') { $section12 = $Matches[1] }
  foreach ($x in $ca) { if ($section12 -notmatch "\b$x\b") { Fail "$x no tiene caso en la estrategia de pruebas (plan seccion 12)" } }
}

Write-Host ''
if ($script:fails -eq 0) { Write-Host "Resultado: trazabilidad valida ($($script:warns) aviso(s)). Estados: spec=$($status.spec) plan=$($status.plan) tasks=$($status.tasks)"; exit 0 }
Write-Host "Resultado: $($script:fails) falla(s), $($script:warns) aviso(s)"
exit 1
