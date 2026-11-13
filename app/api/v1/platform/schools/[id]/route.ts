import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { updateSchoolServices } from "@/lib/db/schools";
import { ServicesSchema } from "@/lib/services";

type RouteContext = { params: Promise<{ id: string }> };

const PatchBody = z.object({ services: ServicesSchema });

async function denyUnlessPlatformAdmin(): Promise<NextResponse | null> {
  try {
    await requirePlatformAdmin();
    return null;
  } catch (e) {
    if (e instanceof Response) return NextResponse.json({ error: "Forbidden" }, { status: e.status });
    throw e;
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const denied = await denyUnlessPlatformAdmin();
  if (denied) return denied;

  const id = z.string().uuid().safeParse((await params).id);
  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!id.success || !parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { services } = parsed.data;
  if (!(await updateSchoolServices(id.data, services))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ services }, { status: 200 });
}
