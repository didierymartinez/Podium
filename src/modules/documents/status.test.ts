import { describe, expect, it } from "vitest";
import { documentStatus, expiresOnFor } from "./status";

describe("vencimiento de documentos", () => {
  it("suma meses y respeta fin de mes", () => {
    expect(expiresOnFor("2026-01-15", 12)).toBe("2027-01-15");
    expect(expiresOnFor("2026-01-31", 1)).toBe("2026-02-28");
    expect(expiresOnFor("2026-11-30", 3)).toBe("2027-02-28");
    expect(expiresOnFor("2026-01-15", null)).toBeNull();
  });

  it("clasifica pendiente, vigente, por vencer y vencido", () => {
    const today = "2026-10-08";
    expect(documentStatus(undefined, true, today)).toBe("missing");
    expect(documentStatus(undefined, false, today)).toBe("optional");
    expect(documentStatus({ expiresOn: null }, true, today)).toBe("valid");
    expect(documentStatus({ expiresOn: "2026-10-07" }, true, today)).toBe("expired");
    expect(documentStatus({ expiresOn: "2026-10-08" }, true, today)).toBe("expiring");
    expect(documentStatus({ expiresOn: "2026-11-07" }, true, today)).toBe("expiring");
    expect(documentStatus({ expiresOn: "2026-11-08" }, true, today)).toBe("valid");
  });
});
