import { describe, expect, it } from "vitest";
import { decryptField, encryptField } from "./crypto";

describe("cifrado de campos", () => {
  it("cifra y descifra; cada cifrado es distinto", () => {
    const a = encryptField("Alergia a la penicilina");
    const b = encryptField("Alergia a la penicilina");
    expect(a).not.toBe(b);
    expect(a).not.toContain("penicilina");
    expect(decryptField(a)).toBe("Alergia a la penicilina");
  });

  it("vacíos quedan null y detecta manipulación", () => {
    expect(encryptField("")).toBeNull();
    expect(decryptField(null)).toBeNull();
    const [v, iv, tag, data] = encryptField("dato con varios caracteres")!.split(":");
    const flipped = (data[0] === "A" ? "B" : "A") + data.slice(1);
    const tampered = [v, iv, tag, flipped].join(":");
    expect(() => decryptField(tampered)).toThrow();
  });
});
