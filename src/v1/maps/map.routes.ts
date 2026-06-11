import { Router } from "express";
import { mapboxMapsProvider } from "../../providers/maps/mapbox-maps.provider.js";

export const mapRouter = Router();

mapRouter.post("/quote-distance", async (req, res) => {
  const destination = await mapboxMapsProvider.geocode(req.body.address ?? "");
  const route = await mapboxMapsProvider.routeDistance(req.body.origin ?? { lat: 6.45, lng: 3.39 }, destination);
  res.json({ data: { ...destination, ...route, mapLink: mapboxMapsProvider.mapLink(destination.lat, destination.lng) } });
});
