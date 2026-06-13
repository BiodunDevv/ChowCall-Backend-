import { describe, expect, it } from "vitest";
import { isRestaurantOpen, normalizeOpeningHours } from "../src/shared/utils/restaurant-hours.js";

describe("restaurant opening hours", () => {
  const item7Hours = {
    Monday: { open: true, from: "09:00", to: "22:00" },
    Saturday: { open: true, from: "00:00", to: "22:00" },
    Sunday: { open: true, from: "09:00", to: "22:00" },
  };

  it("supports existing capitalized weekday keys", () => {
    expect(isRestaurantOpen(item7Hours, new Date("2026-06-13T10:00:00.000Z"))).toBe(true);
    expect(isRestaurantOpen(item7Hours, new Date("2026-06-13T22:00:00.000Z"))).toBe(false);
  });

  it("normalizes weekday keys for future saves", () => {
    expect(normalizeOpeningHours(item7Hours)).toHaveProperty("monday");
    expect(normalizeOpeningHours(item7Hours)).not.toHaveProperty("Monday");
  });

  it("keeps overnight schedules open after midnight", () => {
    const hours = {
      Friday: { open: true, from: "18:00", to: "02:00" },
      Saturday: { open: false, from: "09:00", to: "22:00" },
    };
    expect(isRestaurantOpen(hours, new Date("2026-06-13T00:30:00.000Z"))).toBe(true);
    expect(isRestaurantOpen(hours, new Date("2026-06-13T02:30:00.000Z"))).toBe(false);
  });
});
