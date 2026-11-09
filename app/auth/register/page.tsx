import { RegisterForm } from "@/components/auth/RegisterForm";
import Link from "next/link";
import { GuestViewButton } from "@/components/auth/GuestViewButton";
import { resolveSchoolFromParam } from "@/lib/db/schools";
import { authLinkQuery } from "@/lib/auth/redirects";

interface PageProps {
  searchParams: Promise<{ token?: string; school?: string }>;
}

export default async function RegisterPage({ searchParams }: PageProps) {
  const { token, school: schoolParam } = await searchParams;
  const found = await resolveSchoolFromParam(schoolParam);
  // Demo schools take no sign-ups (resolveSchoolIdFromParam refuses them too).
  const school = found?.demoExpiresAt === null ? found : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8 border rounded-lg shadow-sm">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">הרשמה למערכת</h1>
          <p className="text-muted-foreground text-sm">{school ? school.name : "צרו חשבון חדש"}</p>
        </div>
        <RegisterForm inviteToken={token} school={school?.accessToken} />
        <p className="text-center text-sm text-muted-foreground">
          כבר יש לכם חשבון?{" "}
          <Link
            href={{ pathname: "/auth/login", query: authLinkQuery(token, school?.accessToken) }}
            className="underline hover:text-foreground"
          >
            כניסה
          </Link>
        </p>
        <GuestViewButton
          label="המשך כאורח (צפייה בלוח)"
          href={school ? `/schedule?school=${school.accessToken}` : undefined}
        />
      </div>
    </div>
  );
}
