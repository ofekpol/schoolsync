import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { updateSchoolServices } from "@/lib/db/schools";
import { ServicesSchema } from "@/lib/services";

type RouteContext = { params: Promise<{ id: string }> };

const PatchBody = z.object({ services: ServicesSchema });

/** The platform admin's auth user id, or the 401/403 to return. */
async function platformAdminOrDeny(): Promise<{ actorId: string } | { denied: NextResponse }> {
  try {
    return { actorId: (await requirePlatformAdmin()).id };
  } catch (e) {
    if (e instanceof Response) {
      return { denied: NextResponse.json({ error: "Forbidden" }, { status: e.status }) };
    }
    throw e;
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const admin = await platformAdminOrDeny();
  if ("denied" in admin) return admin.denied;

  const id = z.string().uuid().safeParse((await params).id);
  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!id.success || !parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { services } = parsed.data;
  if (!(await updateSchoolServices(id.data, services, admin.actorId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ services }, { status: 200 });
}
