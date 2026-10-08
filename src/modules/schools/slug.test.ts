import { describe, expect, it } from "vitest";
import { slugify, validateSlug } from "./slug";

describe("slugify", () => {
  it("quita tildes, espacios y símbolos", () => {
    expect(slugify("Club Patín Veloz")).toBe("club-patin-veloz");
    expect(slugify("  Escuela Ñandú & Cía.  ")).toBe("escuela-nandu-cia");
  });

  it("recorta a la longitud máxima sin dejar guion final", () => {
    const slug = slugify("a".repeat(39) + " bbbb");
    expect(slug).toBe("a".repeat(39));
  });
});

describe("validateSlug", () => {
  it("acepta URLs válidas", () => {
    expect(validateSlug("patinveloz")).toBeNull();
    expect(validateSlug("club-patin-2")).toBeNull();
  });

  it("rechaza URLs inválidas", () => {
    expect(validateSlug("ab")).toBe("too_short");
    expect(validateSlug("a".repeat(41))).toBe("too_long");
    expect(validateSlug("Club")).toBe("invalid_chars");
    expect(validateSlug("club--patin")).toBe("invalid_chars");
    expect(validateSlug("-club")).toBe("invalid_chars");
    expect(validateSlug("registro")).toBe("reserved");
  });
});
