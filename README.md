# 🇲🇽 Trip Planner México — Daniel & Mafe

Una aplicación web PWA para planificar el viaje a México: Ciudad de México, Guadalajara y Cancún.

> **Stack**: Angular 18 · Node.js + Express · PostgreSQL (Aiven) · Google Cloud Run · Google Maps API · Google OAuth2

---

## ✨ Funcionalidades

### 🗺️ Mapa Interactivo
- Visualiza las actividades del día sobre Google Maps
- Marcadores diferenciados por tipo (Compartida 👥 / Solo Daniel 🧑 / Solo Mafe 👩)
- Generador de ruta optimizada entre actividades del día
- Alertas de proximidad: detecta cuándo dos actividades en paralelo están a más de N km

### 📋 Kanban de Itinerario
- Tablero con **20 columnas** (una por día del viaje: 23 Oct – 11 Nov)
- **Lugares Guardados** — columna especial para guardar sitios sin fecha asignada
- Drag & Drop entre días: actualiza la fecha automáticamente en el backend
- Drag a Guardados: cambia `dateTime = null` en la BD (el ítem persiste)
- Horarios siempre en zona horaria `America/Mexico_City` (independiente del navegador)
- Edición y eliminación de actividades con modales
- Indicador visual de sincronización en tiempo real

### 🔐 Autenticación
- Google OAuth2 con Google Identity Services (GSI)
- Modal de inicio de sesión con botón oficial de Google
- Estado de sesión persistente

### 📱 PWA
- Instalable como app nativa en Android e iOS
- Ícono personalizado (pareja México ❤️✈️)
- Funciona con HTTPS en producción (Google Cloud Run)

---

## 🏗️ Arquitectura

```
trip-planner/
├── backend/                  # Node.js + Express + Sequelize
│   ├── src/
│   │   ├── controllers/      # Lógica de negocio (itinerary, auth, trips)
│   │   ├── models/           # Sequelize ORM: ItineraryItem, Trip
│   │   ├── routes/           # Express routers
│   │   ├── services/         # Google Maps Distance Matrix, Auth
│   │   └── config/           # DB connection, constants
│   └── Dockerfile
│
├── frontend/                 # Angular 18 Standalone + Signals
│   ├── src/app/
│   │   ├── core/
│   │   │   ├── components/   # LoginModal
│   │   │   └── services/     # AuthService, ItineraryService, TripMapService
│   │   ├── features/
│   │   │   ├── itinerary-kanban/   # Kanban board component
│   │   │   └── trip-map/           # Google Maps component
│   │   └── models/           # TypeScript interfaces
│   ├── public/               # PWA icons, manifest, service worker
│   ├── Dockerfile            # Nginx + runtime env injection
│   └── nginx.conf
│
├── deploy-gcp.ps1            # Script de despliegue a Cloud Run (PowerShell)
└── .github/workflows/        # GitHub Actions CI/CD
```

---

## 🚀 Setup Local

### Pre-requisitos
- Node.js 20+
- Una base de datos PostgreSQL (o cuenta en [Aiven.io](https://aiven.io))
- API keys de Google Maps y Google OAuth2

### 1. Backend

```bash
cd backend
cp .env.example .env
# Edita .env con tus credenciales
npm install
npm run dev
# API disponible en http://localhost:3002
```

**Variables de entorno requeridas** (`.env`):

```env
NODE_ENV=development
PORT=3002

# PostgreSQL (Aiven u otro proveedor)
DATABASE_URL=postgresql://user:pass@host:port/dbname?sslmode=require

# Google OAuth2
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret

# Google Maps
GOOGLE_MAPS_API_KEY=your-maps-api-key

# CORS
ALLOWED_ORIGINS=http://localhost:4300
```

### 2. Frontend

```bash
cd frontend
npm install
npm start
# App disponible en http://localhost:4300
```

**Variables de entorno de runtime** (`frontend/src/assets/env.js`):

```javascript
window.__env = {
  apiUrl: 'http://localhost:3002',
  googleClientId: 'your-client-id.apps.googleusercontent.com',
  googleMapsKey: 'your-maps-api-key',
};
```

---

## ☁️ Despliegue en Google Cloud Run

El proyecto incluye un script PowerShell para desplegar backend y frontend automáticamente:

```powershell
.\deploy-gcp.ps1
```

El script:
1. Lee las variables de entorno desde `backend/.env`
2. Construye y sube la imagen Docker del backend a Cloud Run
3. Construye el frontend con la URL del backend inyectada en runtime
4. Sube el frontend como segundo servicio Cloud Run

### Servicios desplegados

| Servicio | URL |
|---|---|
| Backend API | `https://trip-planner-backend-xxx-uc.a.run.app` |
| Frontend PWA | `https://trip-planner-frontend-xxx-uc.a.run.app` |

---

## 🗄️ Modelo de Datos

### `ItineraryItem`

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID | Identificador único |
| `tripId` | UUID | Referencia al viaje |
| `placeId` | string | Google Places ID |
| `placeName` | string | Nombre del lugar |
| `lat / lng` | decimal | Coordenadas cacheadas |
| `dateTime` | timestamptz \| **null** | Fecha/hora de la actividad. `NULL` = guardado sin fecha |
| `durationMinutes` | integer | Duración estimada |
| `ownerId` | enum | `DANIEL` \| `MAFE` \| `SHARED` |
| `type` | enum | `SHARED` \| `SOLO_DANIEL` \| `SOLO_MAFE` |
| `notes` | text | Notas opcionales |

> 💡 `dateTime = NULL` es el mecanismo para la columna **"Lugares Guardados"** — el ítem existe en BD pero no tiene fecha asignada, por lo que no aparece en ningún día del Kanban.

---

## 🛣️ API Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/api/trips` | Lista viajes |
| `POST` | `/api/trips` | Crear viaje |
| `GET` | `/api/trips/:id/itinerary` | Items del itinerario (`?date=YYYY-MM-DD` o `?saved=true`) |
| `POST` | `/api/trips/:id/itinerary` | Añadir item |
| `PATCH` | `/api/trips/:id/itinerary/:itemId` | Actualizar item (acepta `dateTime: null`) |
| `DELETE` | `/api/trips/:id/itinerary/:itemId` | Eliminar item |
| `POST` | `/api/trips/:id/proximity` | Verificar alertas de proximidad |
| `GET` | `/api/auth/config` | Configuración OAuth pública |
| `POST` | `/api/auth/google` | Verificar token Google |

---

## 🗓️ Itinerario del Viaje

| Fechas | Ciudad |
|---|---|
| 23 Oct – 31 Oct | 🏙️ Ciudad de México |
| 1 Nov – 4 Nov | 🌮 Guadalajara |
| 5 Nov – 11 Nov | 🏖️ Cancún |

---

## 🛠️ Decisiones técnicas destacadas

- **Zona horaria**: Todo el manejo de fechas usa `Intl.DateTimeFormat` con `timeZone: 'America/Mexico_City'` para evitar desfases al leer/escribir fechas UTC desde la BD.
- **Runtime env injection**: Las variables de entorno del frontend se inyectan en tiempo de ejecución (no en build time) mediante `env.js` generado por el `entrypoint.sh` del contenedor Nginx, permitiendo el mismo Docker image en múltiples entornos.
- **Google Auth**: El botón de Google Identity Services se renderiza con un `effect()` de Angular que reacciona a la señal `isAuthModalOpen()`, garantizando que el contenedor DOM existe antes de intentar renderizar el botón.

---

## 📄 Licencia

MIT — Proyecto personal de Daniel & Mafe 💑
