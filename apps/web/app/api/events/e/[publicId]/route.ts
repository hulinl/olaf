import { NextRequest, NextResponse } from "next/server";

/**
 * Public event proxy — canonical share URL by public_id.
 * `GET /api/events/e/{publicId}`
 *
 * External web (olafadventures.cz Payload admin) copies this URL from
 * the Integrace section of the event cockpit. Same v3 payload as
 * `/api/public/events/{slug}` but keyed by the stable public_id, so
 * the integration survives slug renames.
 *
 * SWA hostuje jen frontend; container žije za `INTERNAL_API_URL`.
 * Tenhle route.ts proxy-uje request na container `/api/public/events/e/{id}`
 * a drží CORS `*` + cache headers per public API spec.
 */
const API_BASE =
  process.env.INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000";

interface Ctx {
  params: Promise<{ publicId: string }>;
}

export async function GET(
  _request: NextRequest,
  ctx: Ctx,
): Promise<NextResponse> {
  const { publicId } = await ctx.params;
  const target = new URL(
    `/api/public/events/e/${encodeURIComponent(publicId)}`,
    API_BASE,
  );
  try {
    const upstream = await fetch(target.toString(), {
      cache: "no-store",
      redirect: "follow",
    });
    const body = await upstream.text();
    return withCors(
      new NextResponse(body, {
        status: upstream.status,
        headers: {
          "Content-Type":
            upstream.headers.get("Content-Type") ?? "application/json",
          "Cache-Control":
            upstream.headers.get("Cache-Control") ??
            "public, max-age=60, s-maxage=60",
        },
      }),
    );
  } catch (err) {
    console.error("public event by hash proxy failed", err);
    return withCors(
      NextResponse.json({ error: "Upstream unavailable" }, { status: 502 }),
    );
  }
}

export async function OPTIONS(): Promise<NextResponse> {
  return withCors(new NextResponse(null, { status: 204 }));
}

function withCors(response: NextResponse): NextResponse {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return response;
}
