import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  ChangeDetectorRef,
} from '@angular/core';
import { NgClass, LowerCasePipe, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  DragDropModule,
  CdkDragDrop,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
import { Subject, takeUntil } from 'rxjs';

import { TripMapService } from '../../core/services/trip-map.service';
import { ItineraryService } from '../../core/services/itinerary.service';
import type {
  ItineraryItem,
  ItemType,
  OwnerId,
  UpdateItineraryItemDto,
} from '../../models/itinerary.model';

// ── Tipos internos ────────────────────────────────────────────────────────────

export interface KanbanColumn {
  id: string; // 'unscheduled' | 'YYYY-MM-DD'
  label: string; // Etiqueta de la columna (ej: "Lun 23\nOct")
  date?: string; // YYYY-MM-DD (undefined para "unscheduled")
  items: ItineraryItem[];
  isUnscheduled?: boolean;
  isWeekend?: boolean;
  destination?: Destination; // Destino asignado al día
}

type Destination = 'CDMX' | 'GDL' | 'CUN';
type SyncStatus = 'idle' | 'syncing' | 'saved' | 'error';

// ── Constantes ────────────────────────────────────────────────────────────────

const UNSCHEDULED_ID = 'unscheduled';
const TRIP_START = '2025-10-23';
const TRIP_END = '2025-11-11';

const DAY_NAMES_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const;
const MONTH_NAMES_ES = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
] as const;

/**
 * Distribución de destinos por fecha.
 * Ajusta estos rangos si el itinerario cambia.
 */
const DESTINATION_MAP: Record<string, Destination> = {
  '2025-10-23': 'CDMX',
  '2025-10-24': 'CDMX',
  '2025-10-25': 'CDMX',
  '2025-10-26': 'CDMX',
  '2025-10-27': 'CDMX',
  '2025-10-28': 'CDMX',
  '2025-10-29': 'CDMX',
  '2025-10-30': 'CDMX',
  '2025-10-31': 'CDMX',
  '2025-11-01': 'GDL',
  '2025-11-02': 'GDL',
  '2025-11-03': 'GDL',
  '2025-11-04': 'GDL',
  '2025-11-05': 'CUN',
  '2025-11-06': 'CUN',
  '2025-11-07': 'CUN',
  '2025-11-08': 'CUN',
  '2025-11-09': 'CUN',
  '2025-11-10': 'CUN',
  '2025-11-11': 'CUN',
};

const DESTINATION_META: Record<Destination, { label: string; flag: string; color: string }> = {
  CDMX: { label: 'Ciudad de México', flag: '🏙️', color: '#FF2D78' },
  GDL: { label: 'Guadalajara', flag: '🌮', color: '#F59E0B' },
  CUN: { label: 'Cancún', flag: '🏖️', color: '#06B6D4' },
};

const ITEM_TYPE_CONFIG: Record<ItemType, { color: string; label: string; emoji: string }> = {
  SHARED: { color: '#FF2D78', label: 'Compartida', emoji: '👥' }, // Rosa Mexicano
  SOLO_DANIEL: { color: '#10B981', label: 'Solo Daniel', emoji: '🧑' }, // Verde Bandera México
  SOLO_MAFE: { color: '#EC4899', label: 'Solo Mafe', emoji: '👩' }, // Magenta Bugambilia
};

/** Lugares guardados iniciales vacíos (se cargan los guardados por el usuario) */
const MOCK_SAVED_PLACES: ItineraryItem[] = [];

// ── Componente ────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-itinerary-kanban',
  standalone: true,
  imports: [DragDropModule, NgClass, LowerCasePipe, FormsModule, CommonModule],
  templateUrl: './itinerary-kanban.component.html',
  styleUrl: './itinerary-kanban.component.scss',
})
export class ItineraryKanbanComponent implements OnInit, OnDestroy {
  // ── Servicios ─────────────────────────────────────────────────────────────

  private readonly tripMapService = inject(TripMapService);
  private readonly itineraryService = inject(ItineraryService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  // ── Estado del tablero ────────────────────────────────────────────────────

  columns: KanbanColumn[] = [];

  // ── Signals de UI ─────────────────────────────────────────────────────────

  readonly isDragging = signal(false);
  readonly draggingItemId = signal<string | null>(null);
  readonly syncStatus = signal<SyncStatus>('idle');
  readonly lastSyncedItem = signal<string | null>(null);

  // ── Estado de Edición / Eliminación ───────────────────────────────────────

  readonly editingItem = signal<ItineraryItem | null>(null);
  readonly isUpdating = signal<boolean>(false);
  readonly isDeleting = signal<string | null>(null);

  editFormDate = '2025-10-23';
  editFormTime = '12:00';
  editFormDuration = 60;
  editFormType: ItemType = 'SHARED';
  editFormNotes = '';

  readonly minDate = '2025-10-23';
  readonly maxDate = '2025-11-11';

  /** Columna seleccionada en el quick-switcher móvil */
  readonly activeColumnId = signal<string>('unscheduled');

  scrollToColumn(columnId: string): void {
    this.activeColumnId.set(columnId);
    const el = document.getElementById('kanban-col-' + columnId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }

  /** Totales para el header de stats */
  get totalScheduled(): number {
    return this.columns.filter((c) => !c.isUnscheduled).reduce((sum, c) => sum + c.items.length, 0);
  }

  get totalSaved(): number {
    return this.columns.find((c) => c.isUnscheduled)?.items.length ?? 0;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.buildColumns();
    this.subscribeToItems();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Construcción de columnas ──────────────────────────────────────────────

  private buildColumns(): void {
    const unscheduledColumn: KanbanColumn = {
      id: UNSCHEDULED_ID,
      label: 'Lugares Guardados',
      isUnscheduled: true,
      items: [...MOCK_SAVED_PLACES], // Copia para evitar mutaciones en mock
    };

    const dayColumns: KanbanColumn[] = this.generateTripDates().map((date) => ({
      id: date,
      date,
      label: this.formatDateLabel(date),
      items: [],
      isWeekend: this.isWeekend(date),
      destination: DESTINATION_MAP[date],
    }));

    this.columns = [unscheduledColumn, ...dayColumns];
  }

  /** Genera el array de fechas del viaje en formato YYYY-MM-DD */
  private generateTripDates(): string[] {
    const dates: string[] = [];
    const start = new Date(`${TRIP_START}T12:00:00`);
    const end = new Date(`${TRIP_END}T12:00:00`);
    const current = new Date(start);

    while (current <= end) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }
    return dates; // 20 fechas
  }

  // ── Suscripción a items del servicio ──────────────────────────────────────

  private subscribeToItems(): void {
    // Cargar lugares guardados desde el backend (dateTime IS NULL)
    this.tripMapService.savedPlaces$.pipe(takeUntil(this.destroy$)).subscribe((saved) => {
      const unscheduledCol = this.columns.find((c) => c.isUnscheduled);
      if (unscheduledCol) {
        unscheduledCol.items = [...saved];
        this.cdr.markForCheck();
      }
    });

    this.tripMapService.allTripItems$.pipe(takeUntil(this.destroy$)).subscribe((items) => {
      // Separar: items sin fecha van a Guardados, con fecha van a su columna
      const unscheduledCol = this.columns.find((c) => c.isUnscheduled);

      // Limpiar columnas de día
      this.columns.filter((c) => !c.isUnscheduled).forEach((c) => (c.items = []));

      items.forEach((item) => {
        if (!item.dateTime) {
          // Item guardado sin fecha: va a columna Lugares Guardados
          if (unscheduledCol && !unscheduledCol.items.find((i) => i.id === item.id)) {
            unscheduledCol.items.push(item);
          }
        } else {
          const dateKey = item.dateTime.substring(0, 10);
          const column = this.columns.find((c) => c.id === dateKey);
          if (column) column.items.push(item);
        }
      });

      // Ordenar cronológicamente (solo columnas de día, ignorando nulls)
      this.columns
        .filter((c) => !c.isUnscheduled)
        .forEach((c) => {
          c.items.sort((a, b) => {
            if (!a.dateTime) return 1;
            if (!b.dateTime) return -1;
            return new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime();
          });
        });

      this.cdr.markForCheck();
    });
  }

  // ── Handler de Drag & Drop ────────────────────────────────────────────────

  /**
   * Manejador principal del evento cdkDropListDropped.
   *
   * Casos:
   * 1. Mismo contenedor → reordenar (moveItemInArray) — solo estado local
   * 2. Contenedor diferente → transferir (transferArrayItem) + sync backend
   */
  onDrop(event: CdkDragDrop<ItineraryItem[]>): void {
    this.isDragging.set(false);
    this.draggingItemId.set(null);

    if (event.previousContainer === event.container) {
      // ── Caso 1: Reordenamiento interno ──────────────────────
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
      // Sin sync al backend (no hay campo de orden en el modelo actual)
    } else {
      // ── Caso 2: Transferencia entre columnas ─────────────────
      const movedItem = event.previousContainer.data[event.previousIndex];
      const targetColId = event.container.id;
      const sourceColId = event.previousContainer.id;

      transferArrayItem(
        event.previousContainer.data,
        event.container.data,
        event.previousIndex,
        event.currentIndex,
      );

      this.syncItemToColumn(movedItem, targetColId, sourceColId);
    }

    this.cdr.markForCheck();
  }

  /** Dispara cuando el usuario empieza a arrastrar una tarjeta */
  onDragStarted(item: ItineraryItem): void {
    this.isDragging.set(true);
    this.draggingItemId.set(item.id);
  }

  /** Dispara cuando se suelta la tarjeta (independientemente de si hubo drop) */
  onDragEnded(): void {
    this.isDragging.set(false);
    this.draggingItemId.set(null);
  }

  // ── Sincronización con Backend ────────────────────────────────────────────

  /**
   * Sincroniza el movimiento de un ítem al backend.
   *
   * Casos:
   * - Día → Día: actualiza la fecha del ítem en el backend.
   * - Día → Guardados: elimina el ítem del backend (dateTime es NOT NULL en BD).
   *   El ítem queda vivo solo en el estado local de `_savedPlaces$`.
   * - Guardados → Día: crea/actualiza el ítem con la nueva fecha.
   */
  private syncItemToColumn(item: ItineraryItem, targetColId: string, sourceColId: string): void {
    const tripId = this.tripMapService.selectedTripId();

    if (targetColId === UNSCHEDULED_ID) {
      // ── Movido a "Lugares Guardados" → PATCH dateTime = null ─────────────
      if (sourceColId === UNSCHEDULED_ID) return; // ya era guardado

      this.syncStatus.set('syncing');
      this.itineraryService
        .updateItem$(tripId, item.id, { dateTime: null })
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.syncStatus.set('idle');
            this.lastSyncedItem.set(item.placeName);
            setTimeout(() => this.lastSyncedItem.set(null), 3000);
            this.cdr.markForCheck();
          },
          error: (err) => {
            console.error('[KanbanComponent] Error unsetting dateTime:', err);
            this.syncStatus.set('error');
            setTimeout(() => this.syncStatus.set('idle'), 5000);
            this.tripMapService.notifyItemChanged(); // revierte visualmente
            this.cdr.markForCheck();
          },
        });
      return;
    }

    // ── Movido a columna de día: PATCH con nueva fecha ─────────────────────
    const timeInMexico = item.dateTime ? this.extractTimeFromISO(item.dateTime) : '12:00';
    const newDateTime = this.buildMexicoDateTime(targetColId, timeInMexico);

    this.syncStatus.set('syncing');

    this.itineraryService
      .updateItem$(tripId, item.id, { dateTime: newDateTime })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updatedItem) => {
          const column = this.columns.find((c) => c.id === targetColId);
          if (column) {
            const idx = column.items.findIndex((i) => i.id === item.id);
            if (idx !== -1) column.items[idx] = updatedItem;
          }
          this.syncStatus.set('idle');
          this.lastSyncedItem.set(item.placeName);
          setTimeout(() => this.lastSyncedItem.set(null), 3000);
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('[KanbanComponent] Sync error:', err);
          this.syncStatus.set('error');
          setTimeout(() => this.syncStatus.set('idle'), 5000);
          this.cdr.markForCheck();
        },
      });
  }

  // ── Helpers de template ───────────────────────────────────────────────────

  getItemColor(type: ItemType): string {
    return ITEM_TYPE_CONFIG[type].color;
  }

  getTypeLabel(type: ItemType): string {
    return ITEM_TYPE_CONFIG[type].label;
  }

  getTypeEmoji(type: ItemType): string {
    return ITEM_TYPE_CONFIG[type].emoji;
  }

  getDestinationMeta(dest: Destination) {
    return DESTINATION_META[dest];
  }

  /**
   * Muestra la hora del item en pantalla.
   * Extrae HH:mm directamente del string ISO para evitar conversiones
   * de zona horaria del navegador.
   */
  formatTime(dateTime: string | null): string {
    if (!dateTime) return '--:--';
    return this.extractTimeFromISO(dateTime);
  }

  /**
   * Extrae HH:mm en hora de México (America/Mexico_City, UTC-6).
   *
   * El backend siempre almacena/devuelve las fechas en UTC (ej: '...T18:00:00.000Z').
   * Convertir con Intl.DateTimeFormat garantiza que el usuario siempre ve
   * y opera con la hora correcta independientemente del timezone del navegador.
   */
  private extractTimeFromISO(dateTime: string): string {
    if (!dateTime) return '12:00';
    const d = new Date(dateTime);
    if (isNaN(d.getTime())) return '12:00';
    return d.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'America/Mexico_City',
    });
  }

  /**
   * Construye un ISO string en zona horaria de México para enviar al backend.
   * Input: 'YYYY-MM-DD' + 'HH:mm'  →  Output: '2025-10-24T12:00:00-06:00'
   */
  private buildMexicoDateTime(dateStr: string, time: string): string {
    const [hours, minutes] = time.split(':');
    return `${dateStr}T${hours ?? '12'}:${minutes ?? '00'}:00-06:00`;
  }

  /**
   * Formatea la fecha de la columna en dos líneas:
   * "Lun 23" + "Oct"
   */
  formatDateLabel(dateStr: string): string {
    // Añadir T12:00 para evitar desfase de zona horaria
    const d = new Date(`${dateStr}T12:00:00`);
    return `${DAY_NAMES_ES[d.getDay()]} ${d.getDate()}\n${MONTH_NAMES_ES[d.getMonth()]}`;
  }

  isWeekend(dateStr: string): boolean {
    const d = new Date(`${dateStr}T12:00:00`);
    const day = d.getDay();
    return day === 0 || day === 6;
  }

  openEditModal(item: ItineraryItem, event?: Event): void {
    if (event) event.stopPropagation();
    this.editingItem.set(item);

    // Extraer fecha y hora en zona horaria de México
    const dateStr = item.dateTime
      ? new Date(item.dateTime).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' })
      : '2025-10-23';
    const timeStr = item.dateTime ? this.extractTimeFromISO(item.dateTime) : '12:00';

    this.editFormDate = dateStr || '2025-10-23';
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

    const ownerId: OwnerId =
      this.editFormType === 'SOLO_DANIEL'
        ? 'DANIEL'
        : this.editFormType === 'SOLO_MAFE'
          ? 'MAFE'
          : 'SHARED';
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
          console.error('[KanbanComponent] Error updating item:', err);
          item.dateTime = dateTime;
          item.durationMinutes = this.editFormDuration || 60;
          item.type = this.editFormType;
          item.ownerId =
            this.editFormType === 'SOLO_DANIEL'
              ? 'DANIEL'
              : this.editFormType === 'SOLO_MAFE'
                ? 'MAFE'
                : 'SHARED';
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

    // Eliminar localmente de las columnas inmediatamente
    this.columns.forEach((col) => {
      col.items = col.items.filter((i) => i.id !== item.id);
    });

    this.itineraryService
      .deleteItem$(tripId, item.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isDeleting.set(null);
          this.deletingItem.set(null);
          this.tripMapService.removeSavedPlace(item.id);
          this.tripMapService.notifyItemChanged();
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.warn('[KanbanComponent] Local item removed:', err.message);
          this.isDeleting.set(null);
          this.deletingItem.set(null);
          this.tripMapService.removeSavedPlace(item.id);
          this.tripMapService.notifyItemChanged();
          this.cdr.markForCheck();
        },
      });
  }

  // ── Modal de Mover Rápido de Día ("Mover a...") ────────────────────────────
  readonly movingItem = signal<ItineraryItem | null>(null);

  openMoveModal(item: ItineraryItem, event?: Event): void {
    if (event) event.stopPropagation();
    this.movingItem.set(item);
    this.cdr.markForCheck();
  }

  closeMoveModal(): void {
    this.movingItem.set(null);
    this.cdr.markForCheck();
  }

  isItemInColumn(column: KanbanColumn, item: ItineraryItem | null): boolean {
    if (!item) return false;
    return column.items.some((i) => i.id === item.id);
  }

  moveToColumn(targetColumn: KanbanColumn): void {
    const item = this.movingItem();
    if (!item) return;

    const sourceCol = this.columns.find((c) => c.items.some((i) => i.id === item.id));
    if (!sourceCol || sourceCol.id === targetColumn.id) {
      this.closeMoveModal();
      return;
    }

    // Remover del origen y agregar al destino
    const itemIdx = sourceCol.items.findIndex((i) => i.id === item.id);
    if (itemIdx !== -1) {
      const [movedItem] = sourceCol.items.splice(itemIdx, 1);
      targetColumn.items.push(movedItem);

      if (targetColumn.isUnscheduled) {
        this.tripMapService.addSavedPlace(movedItem);
        this.syncStatus.set('saved');
        this.lastSyncedItem.set(`${movedItem.placeName} guardado`);
        setTimeout(() => this.syncStatus.set('idle'), 3000);
      } else {
        this.tripMapService.removeSavedPlace(movedItem.id);
        this.syncItemToColumn(movedItem, targetColumn.id, UNSCHEDULED_ID);
      }
    }

    this.closeMoveModal();
    this.cdr.markForCheck();
  }

  trackByColumnId(_: number, col: KanbanColumn): string {
    return col.id;
  }

  trackByItemId(_: number, item: ItineraryItem): string {
    return item.id;
  }
}
