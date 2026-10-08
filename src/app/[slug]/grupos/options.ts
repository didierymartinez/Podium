import "server-only";
import { db } from "@/db/client";
import { listFeePlans } from "@/modules/billing/fee-plans";
import { listCoaches } from "@/modules/coaches/coaches";
import { getSportsStructure } from "@/modules/schools/queries";
import type { GroupFormOptions } from "./group-form";

export async function loadGroupFormOptions(schoolId: string): Promise<GroupFormOptions> {
  const [structure, plans, coaches] = await Promise.all([
    getSportsStructure(db, schoolId),
    listFeePlans(db, schoolId),
    listCoaches(db, schoolId),
  ]);
  return {
    // Solo modalidades y niveles activos (los archivados siguen en los grupos que ya los usan).
    disciplines: structure.disciplines
      .filter((d) => d.active)
      .map((d) => ({
        id: d.id,
        name: d.name,
        levels: d.levels.filter((l) => l.active).map(({ id, name, position }) => ({ id, name, position })),
      })),
    feePlans: plans
      .filter((p) => p.active)
      .map(({ id, name, monthlyAmount }) => ({ id, name, monthlyAmount })),
    coaches: coaches.filter((c) => c.active).map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}` })),
  };
}
