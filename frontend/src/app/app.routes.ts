import { Routes } from '@angular/router';
import { ItineraryKanbanComponent } from './features/itinerary-kanban/itinerary-kanban.component';
import { TripMapComponent } from './features/trip-map/trip-map.component';

export const routes: Routes = [
  { path: 'itinerary', component: ItineraryKanbanComponent },
  { path: 'map', component: TripMapComponent },
  { path: '', redirectTo: 'itinerary', pathMatch: 'full' },
  { path: '**', redirectTo: 'itinerary' },
];
