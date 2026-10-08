import Link from "next/link";
import { Logo } from "@/components/ui";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-[radial-gradient(60rem_30rem_at_50%_-10%,rgb(47_107_255/0.14),transparent)] px-4 py-10">
      <Link href="/" className="mb-8">
        <Logo className="text-xl" />
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
