import { NextResponse } from "next/server";
import { loadPublicViewerEventSignature } from "@/lib/views/public-viewer-data";
import { PublicViewerEventSignatureResponseSchema } from "@/lib/validations/public-viewer";

interface RouteContext {
  params: Promise<{ school: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  const { school } = await context.params;
  const signature = await loadPublicViewerEventSignature(school);
  if (signature === null) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const payload = PublicViewerEventSignatureResponseSchema.parse({ signature });
  return NextResponse.json(payload, {
    status: 200,
    headers: {
      // s-maxage lets the Vercel CDN absorb the 5 s polls; max-age=0 avoids stacking a browser TTL on top
      "Cache-Control": "public, max-age=0, s-maxage=5",
    },
  });
}
