import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { trialDaysLeft } from "@/modules/schools/trial";
import { getSchoolContext } from "./data";

export default async function SchoolLayout({ children, params }: LayoutProps<"/[slug]">) {
  const { slug } = await params;
  const { user, school } = await getSchoolContext(slug);
  const daysLeft =
    school.status === "TRIAL" && school.trialEndsAt ? trialDaysLeft(school.trialEndsAt, new Date()) : null;

  return (
    <>
      <AppHeader userName={user.name}>
        <Link href={`/${school.slug}`} className="font-semibold">
          {school.name}
        </Link>
      </AppHeader>
      {daysLeft !== null && (
        <div className="bg-accent/15 px-4 py-2 text-center text-sm">
          {daysLeft > 0 ? (
            <>
              Te quedan{" "}
              <strong>
                {daysLeft} {daysLeft === 1 ? "día" : "días"}
              </strong>{" "}
              de prueba gratis.
            </>
          ) : (
            <>Tu prueba gratis terminó.</>
          )}
        </div>
      )}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}
