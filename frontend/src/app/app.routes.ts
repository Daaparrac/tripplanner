import { Routes } from '@angular/router';
import { ItineraryKanbanComponent } from './features/itinerary-kanban/itinerary-kanban.component';
import { TripMapComponent } from './features/trip-map/trip-map.component';
import { SettingsComponent } from './features/settings/settings.component';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: 'itinerary', component: ItineraryKanbanComponent, canActivate: [authGuard] },
  { path: 'map', component: TripMapComponent, canActivate: [authGuard] },
  { path: 'settings', component: SettingsComponent, canActivate: [authGuard] },
  { path: '', redirectTo: 'itinerary', pathMatch: 'full' },
  { path: '**', redirectTo: 'itinerary' },
];
