import { describe, expect, it } from "vitest";
import { findAgeCategory, sportsAge } from "./age-category";
import { SKATING_AGE_CATEGORIES } from "./sport-template";

describe("sportsAge", () => {
  it("usa el año de la temporada sin importar el día de nacimiento", () => {
    expect(sportsAge("2015-12-31", 2026)).toBe(11);
    expect(sportsAge("2015-01-01", 2026)).toBe(11);
  });
});

describe("findAgeCategory", () => {
  it("ubica la categoría según la plantilla de patinaje", () => {
    expect(findAgeCategory(6, SKATING_AGE_CATEGORIES)?.name).toBe("Mini");
    expect(findAgeCategory(11, SKATING_AGE_CATEGORIES)?.name).toBe("Infantil");
    expect(findAgeCategory(18, SKATING_AGE_CATEGORIES)?.name).toBe("Junior");
    expect(findAgeCategory(45, SKATING_AGE_CATEGORIES)?.name).toBe("Máster");
  });

  it("la plantilla cubre todas las edades sin huecos ni solapes", () => {
    for (let age = 3; age <= 80; age++) {
      const matches = SKATING_AGE_CATEGORIES.filter(
        (c) => (c.minAge === null || age >= c.minAge) && (c.maxAge === null || age <= c.maxAge),
      );
      expect(matches, `edad ${age}`).toHaveLength(1);
    }
  });
});
