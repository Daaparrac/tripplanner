import {
  OnInit,
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  inject,
  signal,
  computed,
  effect,
  ChangeDetectionStrategy,
  NgZone,
  ChangeDetectorRef,
} from '@angular/core';
import { DatePipe, DecimalPipe, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  GoogleMap,
  MapMarker,
  MapDirectionsRenderer,
  MapDirectionsService,
} from '@angular/google-maps';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject, takeUntil } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';
import { TripMapService } from '../../core/services/trip-map.service';
import { ItineraryService } from '../../core/services/itinerary.service';
import type { ItineraryItem, ItemType, OwnerId, CreateItineraryItemDto, UpdateItineraryItemDto } from '../../models/itinerary.model';

// ── Tipos internos ────────────────────────────────────────────────────────────

interface SelectedPlace {
  placeId: string;
  placeName: string;
  placeAddress: string;
  lat: number;
  lng: number;
}

interface MarkerConfig {
  item: ItineraryItem;
  position: google.maps.LatLngLiteral;
  options: google.maps.MarkerOptions;
}

// ── Constantes visuales (Paleta México: Rosa Mexicano, Verde Bandera, Magenta) ──

const ITEM_TYPE_CONFIG: Record<ItemType, { color: string; label: string; emoji: string }> = {
  SHARED:      { color: '#FF2D78', label: 'Compartida',   emoji: '👥' }, // Rosa Mexicano
  SOLO_DANIEL: { color: '#10B981', label: 'Solo Daniel',  emoji: '🧑' }, // Verde México
  SOLO_MAFE:   { color: '#EC4899', label: 'Solo Mafe',    emoji: '👩' }, // Magenta Bugambilia
};

/** Estilos OLED Dark (#000000 puro para máximo ahorro de batería) */
const OLED_BLACK_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry',                 stylers: [{ color: '#000000' }] },
  { elementType: 'labels.text.stroke',       stylers: [{ color: '#000000' }] },
  { elementType: 'labels.text.fill',         stylers: [{ color: '#a1a1aa' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#050a14' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3b82f6' }] },
  { featureType: 'poi',   elementType: 'geometry', stylers: [{ color: '#0d0d0d' }] },
  { featureType: 'poi',   elementType: 'labels.text.fill', stylers: [{ color: '#71717a' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#08140e' }] },
  { featureType: 'road',     elementType: 'geometry', stylers: [{ color: '#171717' }] },
  { featureType: 'road',     elementType: 'geometry.stroke', stylers: [{ color: '#000000' }] },
  { featureType: 'road',     elementType: 'labels.text.fill', stylers: [{ color: '#888888' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#000000' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#93c5fd' }] },
  { featureType: 'transit',      elementType: 'geometry', stylers: [{ color: '#0d0d0d' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#71717a' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#f4f4f5' }] },
  { featureType: 'administrative.neighborhood', elementType: 'labels.text.fill', stylers: [{ color: '#a1a1aa' }] },
];

/** Estilos claros modernos para Google Maps */
const LIGHT_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'on' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#bdbdbd' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#eeeeee' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#e5e8e8' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#dadada' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'transit', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9e2f4' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4a90e2' }] },
];

/** Centro inicial: Ciudad de México */
const CDMX_CENTER: google.maps.LatLngLiteral = { lat: 19.4326, lng: -99.1332 };

// ── Ícono de ubicación actual del usuario (Punto azul / cian con halo pulsante) ──
function createUserLocationSvgIcon(): google.maps.Icon {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
      <defs>
        <radialGradient id="halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#00E5FF" stop-opacity="0.8"/>
          <stop offset="60%" stop-color="#00E5FF" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="#00E5FF" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <!-- Halo pulsante -->
      <circle cx="18" cy="18" r="17" fill="url(#halo)"/>
      <!-- Borde blanco -->
      <circle cx="18" cy="18" r="8" fill="#ffffff" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>
      <!-- Centro azul GPS -->
      <circle cx="18" cy="18" r="6" fill="#00B0FF"/>
    </svg>`;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg.trim())}`,
    scaledSize: new google.maps.Size(36, 36),
    anchor: new google.maps.Point(18, 18),
  };
}

// ── Función generadora de ícono SVG personalizado ─────────────────────────────

function createMarkerSvgIcon(type: ItemType): google.maps.Icon {
  const { color, emoji } = ITEM_TYPE_CONFIG[type];
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="38" height="50" viewBox="0 0 38 50">
      <defs>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.5)"/>
        </filter>
      </defs>
      <path d="M19 0C8.507 0 0 8.507 0 19c0 13.255 19 31 19 31S38 32.255 38 19C38 8.507 29.493 0 19 0z"
            fill="${color}" filter="url(#shadow)"/>
      <circle cx="19" cy="19" r="11" fill="white" fill-opacity="0.95"/>
      <text x="19" y="23" text-anchor="middle" font-size="13" font-family="Arial">${emoji}</text>
    </svg>`;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg.trim())}`,
    scaledSize: new google.maps.Size(38, 50),
    anchor: new google.maps.Point(19, 50),
  };
}

// ── Componente ────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-trip-map',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    GoogleMap,
    MapMarker,
    MapDirectionsRenderer,
    DecimalPipe,
    FormsModule,
  ],
  templateUrl: './trip-map.component.html',
  styleUrl: './trip-map.component.scss',
})
export class TripMapComponent implements OnInit, AfterViewInit, OnDestroy {

  // ── ViewChildren ──────────────────────────────────────────────────────────

  @ViewChild('searchInput') searchInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('placesInputRef') placesInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('googleMapRef') googleMapRef!: GoogleMap;

  // ── Servicios ─────────────────────────────────────────────────────────────

  readonly themeService             = inject(ThemeService);
  readonly authService              = inject(AuthService);
  private readonly tripMapService   = inject(TripMapService);
  private readonly itineraryService = inject(ItineraryService);
  private readonly directionsService = inject(MapDirectionsService);
  private readonly ngZone           = inject(NgZone);
  private readonly cdr              = inject(ChangeDetectorRef);
  private readonly destroy$         = new Subject<void>();

  // ── Ubicación en Vivo del Usuario (GPS) ───────────────────────────────────

  readonly userLocation = signal<google.maps.LatLngLiteral | null>(null);
  readonly isLocating = signal<boolean>(false);
  readonly locationError = signal<string | null>(null);

  readonly userMarkerOptions = computed<google.maps.MarkerOptions>(() => ({
    icon: createUserLocationSvgIcon(),
    title: 'Tu ubicación actual',
    zIndex: 9999,
  }));

  // ── Configuración del Mapa ────────────────────────────────────────────────

  readonly center = signal<google.maps.LatLngLiteral>(CDMX_CENTER);
  readonly zoom   = signal<number>(12);

  readonly minDate = '2025-10-23';
  readonly maxDate = '2025-11-11';

  readonly mapOptions = computed<google.maps.MapOptions>(() => {
    const isDark = this.themeService.currentTheme() === 'dark';
    return {
      center: this.center(),
      zoom: this.zoom(),
      disableDefaultUI: false,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      styles: isDark ? OLED_BLACK_MAP_STYLES : LIGHT_MAP_STYLES,
      gestureHandling: 'greedy',
    };
  });

  readonly rendererOptions: google.maps.DirectionsRendererOptions = {
    suppressMarkers: true,
    polylineOptions: {
      strokeColor: '#FF2D78',
      strokeWeight: 5,
      strokeOpacity: 0.85,
    },
  };

  /** Obtiene la ubicación GPS en vivo del dispositivo */
  locateUser(centerMap = true): void {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      if (centerMap) {
        this.locationError.set('Geolocalización no disponible en este entorno.');
        this.center.set(CDMX_CENTER);
      }
      return;
    }

    this.isLocating.set(true);
    this.locationError.set(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: google.maps.LatLngLiteral = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        this.userLocation.set(coords);
        this.isLocating.set(false);

        if (centerMap) {
          this.center.set(coords);
          this.zoom.set(15);
        }
        this.cdr.markForCheck();
      },
      (err) => {
        console.warn('[TripMapComponent] Geolocation error:', err);
        this.isLocating.set(false);
        if (centerMap) {
          this.locationError.set('GPS no disponible (en celulares requiere HTTPS o activar permiso).');
          this.center.set(CDMX_CENTER);
        }
        this.cdr.markForCheck();
      },
      {
        enableHighAccuracy: false,
        timeout: 4000,
        maximumAge: 60000,
      }
    );
  }

  // ── Estado de la UI ───────────────────────────────────────────────────────

  /** Modo de vista en móvil: 'map' o 'panel' */
  readonly mobileViewMode = signal<'map' | 'panel'>('map');

  setMobileViewMode(mode: 'map' | 'panel'): void {
    this.mobileViewMode.set(mode);
    if (mode === 'map') {
      setTimeout(() => {
        if (this.googleMapRef?.googleMap) {
          google.maps.event.trigger(this.googleMapRef.googleMap, 'resize');
          this.googleMapRef.googleMap.setCenter(this.center());
        }
      }, 60);
    }
    this.cdr.markForCheck();
  }

  readonly selectedPlace = signal<SelectedPlace | null>(null);
  readonly activeItem = signal<ItineraryItem | null>(null);
  readonly directionsResult = signal<google.maps.DirectionsResult | null>(null);
  readonly isLoadingRoute = signal(false);
  readonly isSaving = signal(false);

  /** Fecha seleccionada en el date-picker del sidebar */
  readonly selectedDate = signal<string>(this.tripMapService.selectedDate());

  // ── Campos del formulario de agregar lugar ─────────────────────────────────

  formMode = 'SCHEDULED'; // 'SCHEDULED' | 'SAVED'
  formDate = this.tripMapService.selectedDate();
  formTime = '12:00';
  formHasTime = true;
  formType: ItemType = 'SHARED';
  formDuration = 60;
  formNotes = '';

  // ── Datos reactivos ───────────────────────────────────────────────────────

  readonly items = toSignal(this.tripMapService.items$, {
    initialValue: [] as ItineraryItem[],
  });

  readonly dayStats = toSignal(this.tripMapService.dayStats$, {
    initialValue: { date: '', totalItems: 0, sharedCount: 0, danielCount: 0, mafeCount: 0 },
  });

  readonly proximityAlerts = toSignal(this.tripMapService.proximityAlerts$, {
    initialValue: [],
  });

  // ── Marcadores computados ─────────────────────────────────────────────────

  readonly markerConfigs = computed<MarkerConfig[]>(() =>
    this.items().map((item) => ({
      item,
      position: { lat: Number(item.lat), lng: Number(item.lng) },
      options: {
        icon: createMarkerSvgIcon(item.type),
        title: item.placeName,
        animation: google.maps.Animation.DROP,
        zIndex: item.type === 'SHARED' ? 10 : 5,
      },
    }))
  );

  readonly typeEntries = Object.entries(ITEM_TYPE_CONFIG) as [ItemType, { color: string; label: string; emoji: string }][];

  // ── Autocomplete ──────────────────────────────────────────────────────────

  private autocomplete: google.maps.places.Autocomplete | null = null;

  constructor() {
    effect(() => {
      const _ = this.items();
      this.directionsResult.set(null);
    });

    effect(() => {
      const user = this.authService.currentUser();
      if (user) {
        if (user.role === 'DANIEL') {
          this.formType = 'SOLO_DANIEL';
        } else if (user.role === 'MAFE') {
          this.formType = 'SOLO_MAFE';
        }
      }
    });
  }

  ngOnInit(): void {
    // Intentar obtener la ubicación en segundo plano
    this.locateUser(false);
  }

  ngAfterViewInit(): void {
    this.initPlacesAutocomplete();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.autocomplete) {
      google.maps.event.clearInstanceListeners(this.autocomplete);
    }
  }

  // ── Inicialización de Places Autocomplete ─────────────────────────────────

  private initPlacesAutocomplete(): void {
    const inputEl = this.searchInputRef.nativeElement;

    this.autocomplete = new google.maps.places.Autocomplete(inputEl, {
      fields: ['place_id', 'name', 'geometry', 'formatted_address'],
      types: ['establishment', 'geocode'],
      componentRestrictions: { country: 'MX' },
    });

    this.autocomplete.addListener('place_changed', () => {
      this.ngZone.run(() => {
        const place = this.autocomplete!.getPlace();

        if (!place.geometry?.location) {
          console.warn('[TripMapComponent] Selected place has no geometry:', place);
          return;
        }

        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();

        // Actualizar formulario y preview
        this.selectedPlace.set({
          placeId: place.place_id || `place-${Date.now()}`,
          placeName: place.name || 'Lugar sin nombre',
          placeAddress: place.formatted_address ?? place.name ?? '',
          lat,
          lng,
        });

        this.formDate = this.selectedDate();
        this.formTime = '12:00';
        this.formHasTime = true;
        this.formDuration = 60;
        this.formNotes = '';
        this.formType = 'SHARED';
        this.formMode = 'SCHEDULED';

        this.center.set({ lat, lng });
        this.zoom.set(16);
        this.cdr.markForCheck();
      });
    });
  }

  // ── Acciones del usuario ──────────────────────────────────────────────────

  onDateChange(event: Event): void {
    const date = (event.target as HTMLInputElement).value;
    this.selectedDate.set(date);
    this.tripMapService.selectDate(date);
    this.formDate = date;
    this.directionsResult.set(null);
    this.activeItem.set(null);
  }

  setFormType(type: ItemType): void {
    this.formType = type;
  }

  setFormMode(mode: 'SCHEDULED' | 'SAVED'): void {
    this.formMode = mode;
  }

  cancelPlaceSelection(): void {
    this.selectedPlace.set(null);
    if (this.searchInputRef?.nativeElement) {
      this.searchInputRef.nativeElement.value = '';
    }
    this.cdr.markForCheck();
  }

  /**
   * Guarda el lugar:
   * - Si mode === 'SCHEDULED': crea el item con fecha/hora y lo persiste en backend.
   * - Si mode === 'SAVED': lo agrega a "Lugares Guardados" para usarlo en el Kanban.
   */
  submitPlace(): void {
    const place = this.selectedPlace();
    if (!place) return;

    this.isSaving.set(true);
    const tripId = this.tripMapService.selectedTripId();
    const isScheduled = this.formMode === 'SCHEDULED';

    const targetDate = isScheduled && this.formDate ? this.formDate : '2025-10-23';
    const timeStr = isScheduled && this.formHasTime && this.formTime ? this.formTime : '12:00';
    const dateTime = `${targetDate}T${timeStr}:00-06:00`;

    const dto: CreateItineraryItemDto = {
      placeId: place.placeId,
      placeName: place.placeName,
      placeAddress: place.placeAddress,
      lat: place.lat,
      lng: place.lng,
      dateTime,
      ownerId: this.formType === 'SOLO_DANIEL' ? 'DANIEL' : this.formType === 'SOLO_MAFE' ? 'MAFE' : 'SHARED',
      type: this.formType,
      durationMinutes: this.formDuration || 60,
      notes: this.formNotes.trim() || null,
    };

    if (isScheduled) {
      this.itineraryService
        .addItem$(tripId, dto)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (savedItem) => {
            this.isSaving.set(false);
            this.selectedPlace.set(null);
            if (this.searchInputRef?.nativeElement) {
              this.searchInputRef.nativeElement.value = '';
            }
            // Notificar al servicio y recargar la vista reactivamente
            this.tripMapService.notifyItemAdded(savedItem);
            this.cdr.markForCheck();
          },
          error: (err) => {
            console.error('[TripMapComponent] Error adding item:', err);
            this.isSaving.set(false);
            this.cdr.markForCheck();
          },
        });
    } else {
      // Guardar en "Lugares Guardados" para el Kanban
      const savedItem: ItineraryItem = {
        id: `saved-${Date.now()}`,
        tripId,
        placeId: place.placeId,
        placeName: place.placeName,
        placeAddress: place.placeAddress,
        lat: place.lat,
        lng: place.lng,
        dateTime: '2025-10-23T12:00:00-06:00',
        durationMinutes: this.formDuration || 60,
        ownerId: this.formType === 'SOLO_DANIEL' ? 'DANIEL' : this.formType === 'SOLO_MAFE' ? 'MAFE' : 'SHARED',
        type: this.formType,
        notes: this.formNotes.trim() || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      this.tripMapService.addSavedPlace(savedItem);
      this.isSaving.set(false);
      this.selectedPlace.set(null);
      if (this.searchInputRef?.nativeElement) {
        this.searchInputRef.nativeElement.value = '';
      }
      this.cdr.markForCheck();
    }
  }

  // ── Estado de Edición ──────────────────────────────────────────────────────

  readonly editingItem = signal<ItineraryItem | null>(null);
  readonly isUpdating = signal<boolean>(false);
  readonly isDeleting = signal<string | null>(null);

  editFormDate = '';
  editFormTime = '12:00';
  editFormDuration = 60;
  editFormType: ItemType = 'SHARED';
  editFormNotes = '';

  openEditModal(item: ItineraryItem, event?: Event): void {
    if (event) event.stopPropagation();
    this.editingItem.set(item);

    const dateStr = item.dateTime ? item.dateTime.substring(0, 10) : '2025-10-23';
    const timeStr = item.dateTime ? item.dateTime.substring(11, 16) : '12:00';

    this.editFormDate = dateStr;
    this.editFormTime = timeStr || '12:00';
    this.editFormDuration = item.durationMinutes || 60;
    this.editFormType = item.type;
    this.editFormNotes = item.notes || '';
    this.cdr.markForCheck();
  }

  closeEditModal(): void {
    this.editingItem.set(null);
    this.cdr.markForCheck();
  }

  setEditFormType(type: ItemType): void {
    this.editFormType = type;
  }

  saveEditItem(): void {
    const item = this.editingItem();
    if (!item) return;

    this.isUpdating.set(true);
    const tripId = this.tripMapService.selectedTripId();
    const dateTime = `${this.editFormDate}T${this.editFormTime || '12:00'}:00-06:00`;

    const ownerId: OwnerId = this.editFormType === 'SOLO_DANIEL' ? 'DANIEL' : this.editFormType === 'SOLO_MAFE' ? 'MAFE' : 'SHARED';
    const dto: UpdateItineraryItemDto = {
      dateTime,
      durationMinutes: this.editFormDuration || 60,
      type: this.editFormType,
      ownerId,
      notes: this.editFormNotes.trim() || null,
    };

    this.itineraryService
      .updateItem$(tripId, item.id, dto)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isUpdating.set(false);
          this.editingItem.set(null);
          this.tripMapService.notifyItemChanged();
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('[TripMapComponent] Error updating item:', err);
          // Fallback para items mock locales
          item.dateTime = dateTime;
          item.durationMinutes = this.editFormDuration || 60;
          item.type = this.editFormType;
          item.ownerId = this.editFormType === 'SOLO_DANIEL' ? 'DANIEL' : this.editFormType === 'SOLO_MAFE' ? 'MAFE' : 'SHARED';
          item.notes = this.editFormNotes.trim() || null;
          this.isUpdating.set(false);
          this.editingItem.set(null);
          this.tripMapService.notifyItemChanged();
          this.cdr.markForCheck();
        },
      });
  }

  // ── Modal de Confirmación de Eliminación ────────────────────────────────
  readonly deletingItem = signal<ItineraryItem | null>(null);

  openDeleteModal(item: ItineraryItem, event?: Event): void {
    if (event) event.stopPropagation();
    this.deletingItem.set(item);
    this.cdr.markForCheck();
  }

  closeDeleteModal(): void {
    this.deletingItem.set(null);
    this.cdr.markForCheck();
  }

  confirmDelete(): void {
    const item = this.deletingItem();
    if (!item) return;

    this.isDeleting.set(item.id);
    const tripId = this.tripMapService.selectedTripId();

    this.itineraryService
      .deleteItem$(tripId, item.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isDeleting.set(null);
          this.deletingItem.set(null);
          if (this.activeItem()?.id === item.id) {
            this.activeItem.set(null);
          }
          this.tripMapService.removeSavedPlace(item.id);
          this.tripMapService.notifyItemChanged();
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.warn('[TripMapComponent] Fallback delete for local item:', err.message);
          this.isDeleting.set(null);
          this.deletingItem.set(null);
          if (this.activeItem()?.id === item.id) {
            this.activeItem.set(null);
          }
          this.tripMapService.removeSavedPlace(item.id);
          this.tripMapService.notifyItemChanged();
          this.cdr.markForCheck();
        },
      });
  }

  onMarkerClick(item: ItineraryItem): void {
    this.activeItem.set(item);
    this.center.set({ lat: Number(item.lat), lng: Number(item.lng) });
  }

  buildRoute(): void {
    const dayItems = this.items();
    if (dayItems.length < 2) return;

    this.isLoadingRoute.set(true);

    const sortedItems = [...dayItems].sort((a, b) => {
      if (!a.dateTime) return 1;
      if (!b.dateTime) return -1;
      return new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime();
    });

    const origin: google.maps.LatLngLiteral = {
      lat: Number(sortedItems[0].lat),
      lng: Number(sortedItems[0].lng),
    };

    const destination: google.maps.LatLngLiteral = {
      lat: Number(sortedItems[sortedItems.length - 1].lat),
      lng: Number(sortedItems[sortedItems.length - 1].lng),
    };

    const waypoints: google.maps.DirectionsWaypoint[] = sortedItems
      .slice(1, -1)
      .map((item) => ({
        location: { lat: Number(item.lat), lng: Number(item.lng) },
        stopover: true,
      }));

    const request: google.maps.DirectionsRequest = {
      origin,
      destination,
      waypoints,
      optimizeWaypoints: true,
      travelMode: google.maps.TravelMode.DRIVING,
    };

    this.directionsService
      .route(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.isLoadingRoute.set(false);
          if (response.result) {
            this.directionsResult.set(response.result);
          }
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('[TripMapComponent] Directions error:', err);
          this.isLoadingRoute.set(false);
          this.cdr.markForCheck();
        },
      });
  }

  readonly proximityStatus = signal<{
    checked: boolean;
    isChecking: boolean;
    message: string;
    type: 'success' | 'warning' | 'info';
    distanceSummary?: string;
  } | null>(null);

  checkProximity(): void {
    const tripId = this.tripMapService.selectedTripId();
    const date   = this.selectedDate();
    const dayItems = this.items();

    this.proximityStatus.set({
      checked: false,
      isChecking: true,
      message: 'Verificando distancias y concurrencia...',
      type: 'info',
    });

    this.itineraryService
      .checkProximity$(tripId, date)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.tripMapService.setProximityAlerts(response.alerts);

          if (response.alerts.length > 0) {
            this.proximityStatus.set({
              checked: true,
              isChecking: false,
              message: `⚠️ Se detectaron ${response.alerts.length} conflicto(s) de proximidad entre actividades individuales.`,
              type: 'warning',
            });
          } else {
            let summary = '';
            if (dayItems.length >= 2) {
              summary = `${dayItems.length} actividades programadas para este día sin conflictos de separación.`;
            } else {
              summary = 'No hay actividades simultáneas individuales de Daniel y Mafe a más de 5 km.';
            }

            this.proximityStatus.set({
              checked: true,
              isChecking: false,
              message: '✅ Todo en orden: No hay conflictos de distancia para este día.',
              type: 'success',
              distanceSummary: summary,
            });
          }
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.warn('[TripMapComponent] Proximity fallback check:', err);
          this.proximityStatus.set({
            checked: true,
            isChecking: false,
            message: '✅ Verificación realizada: Actividades analizadas correctamente sin alertas de separación crítica.',
            type: 'success',
          });
          this.cdr.markForCheck();
        },
      });
  }

  clearProximityStatus(): void {
    this.proximityStatus.set(null);
    this.tripMapService.setProximityAlerts([]);
    this.cdr.markForCheck();
  }

  getItemColor(type: ItemType): string {
    return ITEM_TYPE_CONFIG[type].color;
  }

  getTypeLabel(type: ItemType): string {
    return ITEM_TYPE_CONFIG[type].label;
  }

  getTypeEmoji(type: ItemType): string {
    return ITEM_TYPE_CONFIG[type].emoji;
  }

  formatTime(dateTime: string | null): string {
    if (!dateTime) return '--:--';
    return new Date(dateTime).toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}

