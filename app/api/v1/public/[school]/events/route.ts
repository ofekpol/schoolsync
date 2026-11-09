import { NextResponse } from "next/server";
import { loadPublicViewerEvents } from "@/lib/views/public-viewer-data";
import { PublicViewerEventsResponseSchema } from "@/lib/validations/public-viewer";

interface RouteContext {
  params: Promise<{ school: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  const { school } = await context.params;
  const events = await loadPublicViewerEvents(school);
  if (!events) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const payload = PublicViewerEventsResponseSchema.parse({ events });
  return NextResponse.json(payload, {
    status: 200,
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=5",
    },
  });
}
