import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { listAllSchools } from "@/lib/db/schools";
import { provisionSchool, type ProvisionSchoolResult } from "@/lib/db/provision";
import { ProvisionSchoolInput } from "@/lib/validations/school";

async function denyUnlessPlatformAdmin(): Promise<NextResponse | null> {
  try {
    await requirePlatformAdmin();
    return null;
  } catch (e) {
    if (e instanceof Response) return NextResponse.json({ error: "Forbidden" }, { status: e.status });
    throw e;
  }
}

export async function GET(): Promise<NextResponse> {
  const denied = await denyUnlessPlatformAdmin();
  if (denied) return denied;
  return NextResponse.json({ schools: await listAllSchools() }, { status: 200 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await denyUnlessPlatformAdmin();
  if (denied) return denied;

  const parsed = ProvisionSchoolInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  let result: ProvisionSchoolResult;
  try {
    result = await provisionSchool(parsed.data, process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("already exists")) {
      return NextResponse.json({ error: "duplicate_slug" }, { status: 409 });
    }
    console.error("[platform/schools] provision failed", e);
    return NextResponse.json({ error: "provision_failed" }, { status: 500 });
  }

  return NextResponse.json(
    {
      schoolId: result.schoolId,
      slug: parsed.data.slug,
      // Only a platform admin sees this; they pass it on to the new school admin.
      magicLinkUrl: result.magicLinkUrl,
    },
    { status: 201 },
  );
}
