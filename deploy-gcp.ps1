# ============================================================
# Script de Despliegue Automatizado a Google Cloud Run (PWA)
# ============================================================
# Requiere Google Cloud CLI (gcloud) instalado y autenticado:
#   gcloud auth login
# ============================================================

param (
    [string]$ProjectId = "trip-planner-app-507315",
    [string]$Region = "us-central1"
)

Write-Host "=== Iniciando Despliegue de Mexico Trip Planner en Google Cloud Run ===`n" -ForegroundColor Magenta

# 1. Solicitar Project ID (Google Cloud)
if ([string]::IsNullOrWhiteSpace($ProjectId)) {
    $ProjectId = Read-Host "Ingresa tu Google Cloud Project ID"
}
gcloud config set project $ProjectId

# 2. Habilitar APIs necesarias en Google Cloud
Write-Host "`n 1/4. Habilitando APIs de Google Cloud (Cloud Run, Cloud Build)..." -ForegroundColor Yellow
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

# 3. Desplegar Backend en Cloud Run
Write-Host "`n 2/4. Construyendo y desplegando Backend en Cloud Run..." -ForegroundColor Yellow

# Leer variables de entorno del backend y crear un archivo YAML para gcloud
$yamlContent = "NODE_ENV: `'production`'`n"
if (Test-Path "./backend/.env") {
    $envLines = Get-Content "./backend/.env" | Where-Object { $_ -match "^[A-Za-z0-9_]+=" }
    foreach ($line in $envLines) {
        $idx = $line.IndexOf("=")
        $key = $line.Substring(0, $idx)
        $val = $line.Substring($idx + 1).Trim()
        
        # Ignorar variables reservadas o sobreescritas
        if ($key -eq "PORT" -or $key -eq "NODE_ENV") {
            continue
        }

        # Escapar comillas simples dentro del valor (si las hay)
        $val = $val -replace "'", "''"
        $yamlContent += "$($key): `'$val`'`n"
    }
    Write-Host " Variables de entorno procesadas para Cloud Run" -ForegroundColor Cyan
} else {
    Write-Host " No se encontro backend/.env. La base de datos podría fallar." -ForegroundColor Yellow
}
Set-Content -Path "./backend/cloud-run-env.yaml" -Value $yamlContent

gcloud run deploy trip-planner-backend `
    --source ./backend `
    --region $Region `
    --platform managed `
    --allow-unauthenticated `
    --env-vars-file ./backend/cloud-run-env.yaml `
    --quiet

# Obtener URL del Backend
$backendUrl = gcloud run services describe trip-planner-backend --region $Region --format "value(status.url)"
Write-Host " Backend desplegado con exito en: $backendUrl" -ForegroundColor Green

# 4. Desplegar Frontend en Cloud Run
Write-Host "`n 3/4. Construyendo y desplegando Frontend PWA en Cloud Run..." -ForegroundColor Yellow
gcloud run deploy trip-planner-frontend `
    --source ./frontend `
    --region $Region `
    --platform managed `
    --allow-unauthenticated `
    --set-env-vars API_URL=$backendUrl `
    --quiet

# Obtener URL del Frontend
$frontendUrl = gcloud run services describe trip-planner-frontend --region $Region --format "value(status.url)"
Write-Host " Frontend desplegado con exito en: $frontendUrl" -ForegroundColor Green

# 5. Resumen Final
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host "  APLICACION EN VIVO EN GOOGLE CLOUD!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host "URL para tus celulares Galaxy S25 Ultra y iPhone 17:" -ForegroundColor Cyan
Write-Host "  `n  $frontendUrl`n" -ForegroundColor Yellow
Write-Host "API Backend:" -ForegroundColor Cyan
Write-Host "   `n $backendUrl`n" -ForegroundColor Gray
Write-Host "Pasos en tu celular:" -ForegroundColor White
Write-Host "   1. Abre la URL en Chrome Android o Safari iOS."
Write-Host "   2. Toca 'Instalar App' o 'Agregar al inicio'."
Write-Host "   3. Listo! La PWA funcionara como app nativa independiente con HTTPS."
