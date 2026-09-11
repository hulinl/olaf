import { NextRequest, NextResponse } from "next/server";

/**
 * Public events proxy — single event.
 * `GET /api/public/events/{slug}`
 *
 * SWA hostuje jen frontend; externí konzumenti (olafadventures.cz)
 * volají `https://olaf.events/api/public/events/{slug}` a očekávají
 * JSON z olaf-api containeru. Tenhle Next.js route.ts proxy-uje
 * request na container URL, drží CORS `*` + cache headers per spec.
 */
const API_BASE =
  process.env.INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000";

interface Ctx {
  params: Promise<{ slug: string }>;
}

export async function GET(_request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { slug } = await ctx.params;
  const target = new URL(
    `/api/public/events/${encodeURIComponent(slug)}`,
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
    console.error("public event proxy failed", err);
    return withCors(
      NextResponse.json(
        { error: "Upstream unavailable" },
        { status: 502 },
      ),
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
