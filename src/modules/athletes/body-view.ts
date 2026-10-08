import type { bodyProfile } from "./body";

/** Datos serializables para `BodyCard`. */
export const toBodyView = (p: Awaited<ReturnType<typeof bodyProfile>>) => ({
  assessment: p.assessment,
  consent: p.consent && { grantedAt: p.consent.grantedAt.toISOString(), source: p.consent.source },
  measurements: p.measurements.map((m) => ({
    id: m.id,
    measuredOn: m.measuredOn,
    source: m.source,
    weightKg: m.weightKg,
    heightCm: m.heightCm,
    wingspanCm: m.wingspanCm,
    skeletalMuscleKg: m.skeletalMuscleKg,
    bodyFatKg: m.bodyFatKg,
    bodyFatPercent: m.bodyFatPercent,
    visceralFat: m.visceralFat,
    bodyWaterKg: m.bodyWaterKg,
    basalMetabolismKcal: m.basalMetabolismKcal,
  })),
});
