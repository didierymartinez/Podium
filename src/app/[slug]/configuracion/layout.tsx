import { Alert } from "@/components/ui";
import { NoAccess } from "@/components/page-header";
import { canManagePeople, canManageSettings } from "@/modules/schools/permissions";
import { getSchoolContext } from "../data";
import { SettingsTabs } from "./settings-tabs";

export default async function SettingsLayout({ children, params }: LayoutProps<"/[slug]/configuracion">) {
  const { slug } = await params;
  const { roles } = await getSchoolContext(slug);
  if (!canManagePeople(roles)) return <NoAccess />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 px-1 pt-2">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Configuración</h1>
          <p className="mt-1 text-ink-soft">Datos de la escuela y reglas de cobro.</p>
        </div>
        <SettingsTabs slug={slug} />
      </div>
      {!canManageSettings(roles) && (
        <Alert tone="info">
          Puedes ver la configuración, pero solo el propietario o un administrador pueden cambiarla.
        </Alert>
      )}
      {children}
    </div>
  );
}
