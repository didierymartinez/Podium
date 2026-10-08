import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGroup, listGroups, setGroupActive } from "@/modules/groups/groups";
import { connectTestDb, testDatabaseUrl } from "@/test/db";
import { schoolFixture } from "@/test/fixtures";
import { listVenues, saveVenue, setVenueActive } from "./venues";

describe.skipIf(!testDatabaseUrl)("multi-sede (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  it("los grupos van a la sede principal o a la elegida; no se archiva la última ni una con grupos", async () => {
    const f = await schoolFixture(conn.db);
    const [main] = await listVenues(conn.db, f.ctx.schoolId);
    expect(main).toMatchObject({ name: "Sede principal", groups: 1 });
    expect((await listGroups(conn.db, f.ctx.schoolId))[0]).toMatchObject({
      venueId: main.id,
      venueName: "Sede principal",
    });

    const north = await saveVenue(conn.db, f.ctx, {
      name: "Sede Norte",
      address: "Calle 100 # 15-20",
      mapUrl: "https://maps.example/norte",
    });
    const group = await createGroup(conn.db, f.ctx, {
      ...f.groupInput,
      name: "Norte",
      venueId: north,
      headCoachId: null,
    });
    expect(group.venueId).toBe(north);
    expect(await setVenueActive(conn.db, f.ctx, north!, false)).toEqual({ ok: false, error: "has_groups" });
    await setGroupActive(conn.db, f.ctx, group.id, false);
    expect(await setVenueActive(conn.db, f.ctx, north!, false)).toEqual({ ok: true });
    // Con Norte archivada, la principal es la única activa.
    expect(await setVenueActive(conn.db, f.ctx, main.id, false)).toEqual({ ok: false, error: "last_venue" });
  });
});
