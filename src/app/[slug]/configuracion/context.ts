import "server-only";
import { canManageSettings } from "@/modules/schools/permissions";
import { FORBIDDEN_STATE as BASE_FORBIDDEN, getActionContext } from "../action-context";

export type { ActionState } from "../action-context";

export const FORBIDDEN_STATE = {
  ...BASE_FORBIDDEN,
  message: "Solo el propietario o un administrador pueden cambiar la configuración.",
};

export const getManagerContext = (slug: string) => getActionContext(slug, canManageSettings);
