import Link from "next/link";
import { Logo } from "@/components/ui";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-10">
      <Link href="/" className="mb-8">
        <Logo className="text-xl" />
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
