export type GeocodeResult = {
  lat: number;
  lng: number;
  confidence: number;
  formattedAddress: string;
};

export type RouteDistanceResult = {
  distanceKm: number;
  durationMinutes: number;
  provider: "mapbox";
};

export interface MapsProvider {
  geocode(address: string): Promise<GeocodeResult>;
  routeDistance(origin: { lat: number; lng: number }, destination: { lat: number; lng: number }): Promise<RouteDistanceResult>;
  mapLink(lat: number, lng: number): string;
}
