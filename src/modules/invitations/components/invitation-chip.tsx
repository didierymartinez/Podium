import { Chip, type ChipTone } from "@/components/ui";
import { INVITATION_STATE_LABELS, type InvitationState } from "../message";

const TONES: Record<InvitationState, ChipTone> = {
  account: "mint",
  opened: "brand",
  sent: "violet",
  expired: "danger",
  none: "neutral",
};

export function InvitationChip({ state }: { state: InvitationState }) {
  return (
    <Chip tone={TONES[state]} dot>
      {INVITATION_STATE_LABELS[state]}
    </Chip>
  );
}
