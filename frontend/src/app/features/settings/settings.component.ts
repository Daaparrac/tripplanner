import { Component, inject, effect, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService, ThemeMode } from '../../core/services/theme.service';
import { AppStateService } from '../../core/services/app-state.service';
import { Trip, Country, TripDestination } from '../../models/itinerary.model';

interface TripFormData {
  id?: string;
  name: string;
  countryCode: string;
  startDate: string;
  endDate: string;
  destinations: string[];
  destinationsList: TripDestination[];
  proximityThresholdKm: number;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);
  readonly appState = inject(AppStateService);

  readonly user = this.auth.currentUser;

  // ── Paleta de Colores Predefinidos para Destinos ───────────────────────────
  readonly PRESET_COLORS = [
    '#06B6D4', // Cian Caribe
    '#10B981', // Esmeralda
    '#FF2D78', // Rosa Mexicano
    '#8B5CF6', // Púrpura
    '#F59E0B', // Ámbar
    '#EC4899', // Magenta
    '#3B82F6', // Azul Real
    '#EF4444', // Rojo Coral
  ];

  // ── Proximidad ─────────────────────────────────────────────────────────────
  pendingProximityValue = 5;
  isProximityChanged = false;
  isSavingProximity = false;
  saveSuccessMessage: string | null = null;

  // ── Dropdown custom de viajes ──────────────────────────────────────────────
  isTripDropdownOpen = false;

  // ── Modales de Crear / Editar Viaje ─────────────────────────────────────────
  isTripModalOpen = false;
  isEditing = false;
  isSavingTrip = false;
  tripModalError: string | null = null;

  // Búsqueda de países en el modal
  countrySearchQuery = '';
  newDestinationInput = '';

  // Subformulario para añadir nuevo tramo de ciudad
  newStageName = '';
  newStageCode = '';
  newStageStartDate = '';
  newStageEndDate = '';
  newStageColor = '#06B6D4';
  newStageEmoji = '📍';

  tripForm: TripFormData = {
    name: '',
    countryCode: 'mx',
    startDate: '',
    endDate: '',
    destinations: [],
    destinationsList: [],
    proximityThresholdKm: 5,
  };

  constructor() {
    // Sincronizar el valor inicial del slider con el valor actual del viaje activo
    effect(() => {
      const active = this.appState.activeTrip();
      if (active && !this.isProximityChanged) {
        this.pendingProximityValue = active.proximityThresholdKm ?? 5;
      }
    });
  }

  ngOnInit(): void {
    if (this.appState.trips().length === 0) {
      this.appState.loadTrips().subscribe();
    }
    if (this.appState.countries().length === 0) {
      this.appState.loadCountries().subscribe();
    }
  }

  // ── Helpers de Banderas & Países ──────────────────────────────────────────

  getFlagUrl(code: string, size = 'w40'): string {
    if (!code) return 'https://flagcdn.com/w40/mx.png';
    return `https://flagcdn.com/${size}/${code.toLowerCase()}.png`;
  }

  getCountryFlagUrlByCode(code: string, size = 'w40'): string {
    return this.getFlagUrl(code, size);
  }

  getTripCountryCode(trip: Trip | null): string {
    if (!trip) return 'mx';
    return (trip.countryCode || trip.country?.code || 'mx').toLowerCase();
  }

  getTripFlagUrl(trip: Trip | null, size = 'w40'): string {
    return this.getFlagUrl(this.getTripCountryCode(trip), size);
  }

  getCountryName(code?: string): string {
    if (!code) return '';
    const c = this.appState.countries().find((item) => item.code.toLowerCase() === code.toLowerCase());
    return c ? c.name : code.toUpperCase();
  }

  get filteredCountries(): Country[] {
    const q = this.countrySearchQuery.toLowerCase().trim();
    if (!q) return this.appState.countries();
    return this.appState
      .countries()
      .filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q));
  }

  // ── Selección de Viaje ─────────────────────────────────────────────────────

  toggleTripDropdown(): void {
    this.isTripDropdownOpen = !this.isTripDropdownOpen;
  }

  selectTrip(tripId: string): void {
    this.appState.setActiveTripId(tripId);
    this.isTripDropdownOpen = false;
    this.isProximityChanged = false;
    this.saveSuccessMessage = null;
  }

  // ── Modal Crear / Editar Viaje ─────────────────────────────────────────────

  openCreateTripModal(): void {
    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    this.isEditing = false;
    this.tripModalError = null;
    this.countrySearchQuery = '';
    this.newDestinationInput = '';
    this.resetStageForm(today, nextWeek);

    this.tripForm = {
      name: '',
      countryCode: 'mx',
      startDate: today,
      endDate: nextWeek,
      destinations: [],
      destinationsList: [],
      proximityThresholdKm: 5,
    };
    this.isTripModalOpen = true;
    this.isTripDropdownOpen = false;
  }

  openEditTripModal(): void {
    const active = this.appState.activeTrip();
    if (!active) return;

    this.isEditing = true;
    this.tripModalError = null;
    this.countrySearchQuery = '';
    this.newDestinationInput = '';
    this.resetStageForm(active.startDate, active.endDate);

    this.tripForm = {
      id: active.id,
      name: active.name,
      countryCode: this.getTripCountryCode(active),
      startDate: active.startDate,
      endDate: active.endDate,
      destinations: [...(active.destinations || [])],
      destinationsList: active.destinationsList ? JSON.parse(JSON.stringify(active.destinationsList)) : [],
      proximityThresholdKm: active.proximityThresholdKm ?? 5,
    };
    this.isTripModalOpen = true;
  }

  closeTripModal(): void {
    this.isTripModalOpen = false;
    this.tripModalError = null;
  }

  selectFormCountry(code: string): void {
    this.tripForm.countryCode = code.toLowerCase();
  }

  // ── Calendario Interactivo de Rango de Fechas para Tramos ───────────────────
  calViewYear = 2026;
  calViewMonth = 9; // 0-indexed (9 = Octubre)
  calSelectingEnd = false;

  get calMonthLabel(): string {
    const months = [
      'Enero',
      'Febrero',
      'Marzo',
      'Abril',
      'Mayo',
      'Junio',
      'Julio',
      'Agosto',
      'Septiembre',
      'Octubre',
      'Noviembre',
      'Diciembre',
    ];
    return `${months[this.calViewMonth]} ${this.calViewYear}`;
  }

  prevCalMonth(): void {
    if (this.calViewMonth === 0) {
      this.calViewMonth = 11;
      this.calViewYear--;
    } else {
      this.calViewMonth--;
    }
  }

  nextCalMonth(): void {
    if (this.calViewMonth === 11) {
      this.calViewMonth = 0;
      this.calViewYear++;
    } else {
      this.calViewMonth++;
    }
  }

  get calendarDays(): Array<{ dateStr: string; dayNumber: number; isCurrentMonth: boolean }> {
    const days: Array<{ dateStr: string; dayNumber: number; isCurrentMonth: boolean }> = [];
    const firstDayIndex = (new Date(this.calViewYear, this.calViewMonth, 1).getDay() + 6) % 7; // Lunes = 0
    const daysInMonth = new Date(this.calViewYear, this.calViewMonth + 1, 0).getDate();
    const prevMonthDays = new Date(this.calViewYear, this.calViewMonth, 0).getDate();

    // Días del mes anterior para rellenar
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = prevMonthDays - i;
      const prevMonth = this.calViewMonth === 0 ? 11 : this.calViewMonth - 1;
      const prevYear = this.calViewMonth === 0 ? this.calViewYear - 1 : this.calViewYear;
      const mm = String(prevMonth + 1).padStart(2, '0');
      const dd = String(dayNum).padStart(2, '0');
      days.push({
        dateStr: `${prevYear}-${mm}-${dd}`,
        dayNumber: dayNum,
        isCurrentMonth: false,
      });
    }

    // Días del mes actual
    for (let d = 1; d <= daysInMonth; d++) {
      const mm = String(this.calViewMonth + 1).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      days.push({
        dateStr: `${this.calViewYear}-${mm}-${dd}`,
        dayNumber: d,
        isCurrentMonth: true,
      });
    }

    // Días del mes siguiente para completar la cuadrícula
    const totalSoFar = days.length;
    const remaining = (7 - (totalSoFar % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const nextMonth = this.calViewMonth === 11 ? 0 : this.calViewMonth + 1;
      const nextYear = this.calViewMonth === 11 ? this.calViewYear + 1 : this.calViewYear;
      const mm = String(nextMonth + 1).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      days.push({
        dateStr: `${nextYear}-${mm}-${dd}`,
        dayNumber: d,
        isCurrentMonth: false,
      });
    }

    return days;
  }

  isDateStart(dateStr: string): boolean {
    return this.newStageStartDate === dateStr;
  }

  isDateEnd(dateStr: string): boolean {
    return this.newStageEndDate === dateStr;
  }

  isDateInRange(dateStr: string): boolean {
    if (!this.newStageStartDate || !this.newStageEndDate) return false;
    return dateStr > this.newStageStartDate && dateStr < this.newStageEndDate;
  }

  /** Retorna el tramo existente que ocupa esta fecha (si alguno) */
  getStageOccupyingDate(dateStr: string): TripDestination | undefined {
    return this.tripForm.destinationsList.find(
      (s) => dateStr >= s.startDate && dateStr <= s.endDate
    );
  }

  /**
   * Verifica si una fecha está deshabilitada en el calendario.
   * Regla:
   * - Fechas fuera del rango general del viaje quedan deshabilitadas.
   * - Fechas estrictamente dentro de un tramo existente [startDate, endDate) quedan bloqueadas.
   * - La fecha de fin (endDate) de un tramo sí se permite para iniciar el siguiente tramo.
   * - Si se está seleccionando la fecha final del nuevo tramo, no se puede cruzar por encima de otro tramo posterior.
   */
  isDateDisabled(dateStr: string): boolean {
    // 1. Fuera de los límites del viaje general
    if (this.tripForm.startDate && dateStr < this.tripForm.startDate) return true;
    if (this.tripForm.endDate && dateStr > this.tripForm.endDate) return true;

    // 2. Si no hemos seleccionado fecha de inicio (o estamos reiniciando selección):
    if (!this.newStageStartDate || (this.newStageStartDate && this.newStageEndDate)) {
      // Bloqueado si cae estrictamente dentro de algún tramo ya creado [startDate, endDate)
      return this.tripForm.destinationsList.some(
        (s) => dateStr >= s.startDate && dateStr < s.endDate
      );
    }

    // 3. Si ya elegimos newStageStartDate y estamos buscando newStageEndDate:
    if (this.newStageStartDate && !this.newStageEndDate) {
      if (dateStr < this.newStageStartDate) {
        return true;
      }
      // Verificar si hay algún tramo posterior entre newStageStartDate y dateStr
      // El nuevo tramo puede extenderse máximo hasta el inicio del siguiente tramo ya existente
      const nextExistingStage = this.tripForm.destinationsList
        .filter((s) => s.startDate >= this.newStageStartDate)
        .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];

      if (nextExistingStage && dateStr > nextExistingStage.startDate) {
        return true;
      }
    }

    return false;
  }

  getDateCellTooltip(dateStr: string): string {
    const occupying = this.getStageOccupyingDate(dateStr);
    if (occupying) {
      if (dateStr === occupying.endDate) {
        return `${occupying.name} (${occupying.shortCode}) termina hoy. ¡Puedes iniciar el siguiente tramo aquí!`;
      }
      return `Ocupado por ${occupying.name} (${occupying.shortCode}) [${occupying.startDate} a ${occupying.endDate}]`;
    }
    if (this.isDateDisabled(dateStr)) {
      return 'Fecha no disponible para este tramo';
    }
    return dateStr;
  }

  onSelectCalendarDay(dateStr: string): void {
    if (this.isDateDisabled(dateStr)) return;

    if (!this.newStageStartDate || (this.newStageStartDate && this.newStageEndDate)) {
      // Primer clic: define inicio del tramo
      this.newStageStartDate = dateStr;
      this.newStageEndDate = '';
      this.calSelectingEnd = true;
    } else if (this.newStageStartDate && !this.newStageEndDate) {
      // Segundo clic: define fin del tramo
      if (dateStr < this.newStageStartDate) {
        this.newStageStartDate = dateStr;
        this.newStageEndDate = '';
      } else {
        this.newStageEndDate = dateStr;
        this.calSelectingEnd = false;
      }
    }
  }

  formatStageDateSummary(): string {
    if (!this.newStageStartDate && !this.newStageEndDate) {
      return 'Toca un día en el calendario para iniciar el rango';
    }
    if (this.newStageStartDate && !this.newStageEndDate) {
      return `Inicio: ${this.newStageStartDate} ➜ (Selecciona fecha de fin)`;
    }
    return `📅 Rango: ${this.newStageStartDate} ➜ ${this.newStageEndDate}`;
  }

  private resetStageForm(start?: string, end?: string): void {
    this.newStageName = '';
    this.newStageCode = '';
    this.newStageColor = '#06B6D4';
    this.newStageEmoji = '📍';
    this.calSelectingEnd = false;

    // Calcular la fecha de inicio sugerida: el endDate del último tramo existente, o el startDate del viaje
    let suggestedStart = start || this.tripForm?.startDate || '';
    if (this.tripForm?.destinationsList && this.tripForm.destinationsList.length > 0) {
      const sorted = [...this.tripForm.destinationsList].sort((a, b) => b.endDate.localeCompare(a.endDate));
      const latest = sorted[0];
      if (latest && (!this.tripForm.endDate || latest.endDate < this.tripForm.endDate)) {
        suggestedStart = latest.endDate;
      }
    }

    this.newStageStartDate = suggestedStart;
    this.newStageEndDate = '';

    if (suggestedStart) {
      const parts = suggestedStart.split('-');
      if (parts.length === 3) {
        this.calViewYear = parseInt(parts[0], 10);
        this.calViewMonth = parseInt(parts[1], 10) - 1;
      }
    }
  }

  // ── Gestión de Destinos / Tramos de Estadía ─────────────────────────────────

  addStage(): void {
    const name = this.newStageName.trim();
    if (!name) return;

    const shortCode = this.newStageCode.trim().toUpperCase() || name.substring(0, 4).toUpperCase();
    const startDate = this.newStageStartDate || this.tripForm.startDate;
    const endDate = this.newStageEndDate || this.tripForm.endDate || startDate;

    this.tripForm.destinationsList.push({
      name,
      shortCode,
      startDate,
      endDate,
      color: this.newStageColor || '#06B6D4',
      emoji: this.newStageEmoji || '📍',
    });

    if (!this.tripForm.destinations.includes(name)) {
      this.tripForm.destinations.push(name);
    }

    this.resetStageForm(this.tripForm.startDate, this.tripForm.endDate);
  }

  removeStage(index: number): void {
    this.tripForm.destinationsList.splice(index, 1);
    this.tripForm.destinations = this.tripForm.destinationsList.map((d) => d.name);
  }

  setStageColor(color: string): void {
    this.newStageColor = color;
  }

  saveTrip(): void {
    if (!this.tripForm.name.trim()) {
      this.tripModalError = 'El nombre del viaje es obligatorio.';
      return;
    }
    if (!this.tripForm.startDate || !this.tripForm.endDate) {
      this.tripModalError = 'Debes indicar las fechas de inicio y fin.';
      return;
    }
    if (new Date(this.tripForm.endDate) <= new Date(this.tripForm.startDate)) {
      this.tripModalError = 'La fecha de fin debe ser posterior a la fecha de inicio.';
      return;
    }

    this.isSavingTrip = true;
    this.tripModalError = null;

    const payload: Partial<Trip> = {
      name: this.tripForm.name.trim(),
      countryCode: this.tripForm.countryCode.toLowerCase(),
      startDate: this.tripForm.startDate,
      endDate: this.tripForm.endDate,
      destinations: this.tripForm.destinations as any,
      destinationsList: this.tripForm.destinationsList,
      proximityThresholdKm: Number(this.tripForm.proximityThresholdKm) || 5,
    };

    if (this.isEditing && this.tripForm.id) {
      this.appState.updateTripSettings(this.tripForm.id, payload).subscribe({
        next: () => {
          this.isSavingTrip = false;
          this.isTripModalOpen = false;
          this.saveSuccessMessage = '¡Viaje y destinos actualizados exitosamente!';
          setTimeout(() => (this.saveSuccessMessage = null), 3500);
        },
        error: (err) => {
          console.error('Error actualizando viaje:', err);
          this.isSavingTrip = false;
          this.tripModalError = err.error?.message || 'Error al guardar cambios del viaje.';
        },
      });
    } else {
      this.appState.createTrip(payload).subscribe({
        next: () => {
          this.isSavingTrip = false;
          this.isTripModalOpen = false;
          this.saveSuccessMessage = '¡Nuevo viaje y destinos creados exitosamente!';
          setTimeout(() => (this.saveSuccessMessage = null), 3500);
        },
        error: (err) => {
          console.error('Error creando viaje:', err);
          this.isSavingTrip = false;
          this.tripModalError = err.error?.message || 'Error al crear el viaje.';
        },
      });
    }
  }

  // ── Tema ───────────────────────────────────────────────────────────────────

  setTheme(mode: ThemeMode): void {
    this.theme.setThemeMode(mode);
  }

  // ── Proximidad ─────────────────────────────────────────────────────────────

  onProximitySliderChange(val: number): void {
    this.pendingProximityValue = Number(val);
    const active = this.appState.activeTrip();
    const currentVal = active?.proximityThresholdKm ?? 5;
    this.isProximityChanged = this.pendingProximityValue !== currentVal;
    this.saveSuccessMessage = null;
  }

  setPresetDistance(km: number): void {
    this.onProximitySliderChange(km);
  }

  saveProximity(): void {
    const tripId = this.appState.activeTripId();
    if (!tripId || !this.isProximityChanged) return;

    this.isSavingProximity = true;
    this.saveSuccessMessage = null;

    this.appState
      .updateTripSettings(tripId, { proximityThresholdKm: Number(this.pendingProximityValue) || 5 })
      .subscribe({
        next: () => {
          this.isSavingProximity = false;
          this.isProximityChanged = false;
          this.saveSuccessMessage = `Umbral actualizado a ${this.pendingProximityValue} km con éxito.`;
          setTimeout(() => {
            this.saveSuccessMessage = null;
          }, 3500);
        },
        error: (err) => {
          console.error('[Settings] Error actualizando proximidad:', err);
          this.isSavingProximity = false;
        },
      });
  }

  logout(): void {
    this.auth.logout();
  }
}
