import { describe, expect, it } from "vitest";
import { isRestaurantOpenForSchedule, type BusinessHourSource } from "./restaurant-hours";

const hours: BusinessHourSource[] = [
  { weekday: 0, opens_at: null, closes_at: null, is_closed: true },
  { weekday: 1, opens_at: "17:00:00", closes_at: "22:00:00", is_closed: false },
  { weekday: 2, opens_at: "17:00:00", closes_at: "22:00:00", is_closed: false },
  { weekday: 3, opens_at: "17:00:00", closes_at: "22:00:00", is_closed: false },
  { weekday: 4, opens_at: "17:00:00", closes_at: "22:00:00", is_closed: false },
  { weekday: 5, opens_at: "17:00:00", closes_at: "23:00:00", is_closed: false },
  { weekday: 6, opens_at: "17:00:00", closes_at: "23:00:00", is_closed: false },
];

describe("isRestaurantOpenForSchedule", () => {
  it("mantem domingo fechado mesmo com override aberto", () => {
    const sundayAt19Local = new Date("2026-08-30T23:00:00.000Z");
    expect(
      isRestaurantOpenForSchedule(
        { is_open_override: "open" },
        hours,
        sundayAt19Local,
      ),
    ).toBe(false);
  });

  it("fecha antes do inicio de segunda-feira", () => {
    const mondayAt1659Local = new Date("2026-08-31T20:59:00.000Z");
    expect(
      isRestaurantOpenForSchedule(
        { is_open_override: "auto" },
        hours,
        mondayAt1659Local,
      ),
    ).toBe(false);
  });

  it("abre dentro do horario configurado em Campo Grande", () => {
    const mondayAt19Local = new Date("2026-08-31T23:00:00.000Z");
    expect(
      isRestaurantOpenForSchedule(
        { is_open_override: "auto" },
        hours,
        mondayAt19Local,
      ),
    ).toBe(true);
  });

  it("falha fechado quando nao ha agenda", () => {
    expect(
      isRestaurantOpenForSchedule(
        { is_open_override: "auto" },
        [],
        new Date("2026-08-31T23:00:00.000Z"),
      ),
    ).toBe(false);
  });
});
