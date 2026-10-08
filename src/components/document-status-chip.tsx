import { DOCUMENT_STATUS_LABELS, type DocumentStatus } from "@/modules/documents/status";
import { Chip, type ChipTone } from "./ui";

const TONES: Record<DocumentStatus, ChipTone> = {
  missing: "sun",
  valid: "mint",
  expiring: "sun",
  expired: "danger",
  optional: "neutral",
};

export function DocumentStatusChip({ status }: { status: DocumentStatus }) {
  return (
    <Chip tone={TONES[status]} dot>
      {DOCUMENT_STATUS_LABELS[status]}
    </Chip>
  );
}
