import { describe, expect, it } from "vitest";
import { columnName, excelSerialToIso, parseCsv, readFirstSheet, toCsv, writeWorkbook } from ".";
import { readZip, writeZip } from "./zip";

describe("zip", () => {
  it("escribe y lee entradas", () => {
    const zip = writeZip([
      { name: "a.txt", data: Buffer.from("hola ñandú") },
      { name: "carpeta/b.xml", data: Buffer.from("<x/>".repeat(1000)) },
    ]);
    const files = readZip(zip);
    expect(files.get("a.txt")?.toString()).toBe("hola ñandú");
    expect(files.get("carpeta/b.xml")?.length).toBe(4000);
  });

  it("rechaza archivos que no son zip", () => {
    expect(() => readZip(Buffer.from("no es un zip, es texto plano con suficiente largo"))).toThrow();
  });
});

describe("xlsx", () => {
  it("nombres de columna", () => {
    expect(columnName(0)).toBe("A");
    expect(columnName(25)).toBe("Z");
    expect(columnName(26)).toBe("AA");
  });

  it("ida y vuelta conserva textos, números y celdas vacías", () => {
    const book = writeWorkbook([
      {
        name: "Alumnos",
        rows: [
          ["Nombres", "Saldo", "Nota"],
          ["María José", 120000, '<b>&"x"'],
          ["Ana", null, "=1+1"],
        ],
      },
      { name: "Otra", rows: [["no se lee"]] },
    ]);
    expect(readFirstSheet(book)).toEqual([
      ["Nombres", "Saldo", "Nota"],
      ["María José", "120000", '<b>&"x"'],
      ["Ana", "", "=1+1"],
    ]);
  });

  it("lee cadenas compartidas y fechas como las guarda Excel", () => {
    const xml = (s: string) => Buffer.from(s);
    const book = writeZip([
      {
        name: "xl/workbook.xml",
        data: xml(`<workbook><sheets><sheet name="Hoja1" sheetId="1" r:id="rId1"/></sheets></workbook>`),
      },
      {
        name: "xl/_rels/workbook.xml.rels",
        data: xml(`<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`),
      },
      {
        name: "xl/sharedStrings.xml",
        data: xml(`<sst><si><t>Nacimiento</t></si><si><r><t>Pe</t></r><r><t>dro</t></r></si></sst>`),
      },
      {
        name: "xl/styles.xml",
        data: xml(
          `<styleSheet><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`,
        ),
      },
      {
        name: "xl/worksheets/sheet1.xml",
        data: xml(
          `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row>` +
            `<row r="3"><c r="A3" s="1"><v>42083</v></c><c r="C3" t="s"><v>1</v></c></row></sheetData></worksheet>`,
        ),
      },
    ]);
    expect(readFirstSheet(book)).toEqual([["Nacimiento"], [], ["2015-03-20", "", "Pedro"]]);
  });

  it("convierte seriales de Excel a fechas", () => {
    expect(excelSerialToIso(45658)).toBe("2025-01-01");
  });
});

describe("csv", () => {
  it("detecta punto y coma y respeta comillas", () => {
    expect(parseCsv('﻿a;b;c\r\n1;"x;y";"di ""hola"""\n')).toEqual([
      ["a", "b", "c"],
      ["1", "x;y", 'di "hola"'],
    ]);
  });

  it("exporta con BOM y neutraliza fórmulas", () => {
    expect(
      toCsv([
        ["a", 1, null],
        ["=SUMA(A1)", "x,y", "ok"],
      ]),
    ).toBe('﻿a,1,\r\n\'=SUMA(A1),"x,y",ok');
  });
});
