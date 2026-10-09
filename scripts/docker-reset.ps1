Write-Warning "PELIGRO: este comando borra TODOS los datos locales de MongoDB y Redis en los volúmenes de este Compose."
$answer = Read-Host "Escribe BORRAR_DATOS para continuar"
if ($answer -eq "BORRAR_DATOS") {
  docker compose down -v
  docker compose up -d mongo redis
} else { Write-Host "Cancelado." }
