import { NextRequest, NextResponse } from "next/server";

/**
 * Public events proxy — batch endpoint.
 * `GET /api/public/events?slugs=a,b,c`
 *
 * SWA hostuje jen frontend; externí konzumenti (olafadventures.cz)
 * volají `https://olaf.events/api/public/*` a očekávají JSON z olaf-api
 * containeru. Tenhle Next.js route.ts proxy-uje request na container
 * URL, drží CORS `*` + cache headers per spec.
 */
const API_BASE =
  process.env.INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000";

export async function GET(request: NextRequest) {
  const target = new URL("/api/public/events", API_BASE);
  target.search = request.nextUrl.search;
  return proxy(target);
}

export async function OPTIONS() {
  return corsPreflight();
}

async function proxy(target: URL): Promise<NextResponse> {
  try {
    const upstream = await fetch(target.toString(), {
      // Nechceme forwardovat cookies / auth — public read-only.
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
    console.error("public events proxy failed", err);
    return withCors(
      NextResponse.json(
        { error: "Upstream unavailable" },
        { status: 502 },
      ),
    );
  }
}

function corsPreflight(): NextResponse {
  return withCors(new NextResponse(null, { status: 204 }));
}

function withCors(response: NextResponse): NextResponse {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return response;
}
