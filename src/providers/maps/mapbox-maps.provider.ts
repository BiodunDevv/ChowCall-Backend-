import { env } from "../../config/env.js";
import { AppError } from "../../shared/errors/app-error.js";
import type { GeocodeResult, MapsProvider, RouteDistanceResult } from "./maps.provider.js";

type MapboxFeature = {
  place_name?: string;
  center?: [number, number];
  relevance?: number;
};

type MapboxGeocodeResponse = {
  features?: MapboxFeature[];
};

type MapboxDirectionsResponse = {
  routes?: Array<{
    distance: number;
    duration: number;
  }>;
};

function mapboxUrl(path: string, params: Record<string, string | number>) {
  const url = new URL(`https://api.mapbox.com/${path}`);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });
  url.searchParams.set("access_token", env.MAPBOX_ACCESS_TOKEN);
  return url;
}

export const mapboxMapsProvider: MapsProvider = {
  async geocode(address): Promise<GeocodeResult> {
    const url = mapboxUrl(`geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`, {
      country: "ng",
      limit: 1,
    });
    const response = await fetch(url);
    if (!response.ok) {
      throw new AppError(502, "Mapbox geocoding failed", "MAPBOX_GEOCODING_FAILED", await response.text());
    }

    const body = (await response.json()) as MapboxGeocodeResponse;
    const feature = body.features?.[0];
    if (!feature?.center) {
      throw new AppError(422, "Address could not be geocoded", "ADDRESS_GEOCODE_FAILED");
    }

    const [lng, lat] = feature.center;
    return {
      lat,
      lng,
      confidence: feature.relevance ?? 0.7,
      formattedAddress: feature.place_name ?? address,
    };
  },

  async routeDistance(origin, destination): Promise<RouteDistanceResult> {
    const coordinates = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
    const url = mapboxUrl(`directions/v5/mapbox/driving/${coordinates}`, {
      alternatives: "false",
      geometries: "geojson",
      overview: "simplified",
    });
    const response = await fetch(url);
    if (!response.ok) {
      throw new AppError(502, "Mapbox route distance failed", "MAPBOX_ROUTE_FAILED", await response.text());
    }

    const body = (await response.json()) as MapboxDirectionsResponse;
    const route = body.routes?.[0];
    if (!route) {
      throw new AppError(422, "Route could not be calculated", "ROUTE_DISTANCE_FAILED");
    }

    return {
      distanceKm: Number((route.distance / 1000).toFixed(2)),
      durationMinutes: Math.ceil(route.duration / 60),
      provider: "mapbox",
    };
  },

  mapLink(lat, lng) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  },
};
