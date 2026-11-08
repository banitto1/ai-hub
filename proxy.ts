import { NextResponse, type NextRequest } from "next/server";

// Central request guard (Next.js 16 "proxy", formerly middleware).
// 1. Host allowlist: blocks DNS-rebinding (evil.example resolving to 127.0.0.1) — only the
//    loopback desktop origin and the private-network HTTPS phone gateway (:3443) are served.
// 2. CSRF: every state-changing /api request must carry an Origin equal to Host. SameSite=strict
//    alone is not enough on 127.0.0.1, because pages on other local ports count as same-site.
// 3. Baseline security headers for every response.
const LOOPBACK = /^(127\.0\.0\.1|localhost|\[::1\]):\d{2,5}$/;
const GATEWAY = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3}):3443$/;

function privateGateway(host: string) {
  const m = GATEWAY.exec(host);
  if (!m) return false;
  const [a, b, c, d] = m.slice(1).map(Number);
  if ([a, b, c, d].some(n => n > 255)) return false;
  return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 100 && b >= 64 && b <= 127);
}

function deny(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export function proxy(request: NextRequest) {
  const host = (request.headers.get("host") || "").toLowerCase();
  if (!LOOPBACK.test(host) && !privateGateway(host)) return deny(421, "Host not allowed");

  const method = request.method.toUpperCase();
  const mutating = !["GET", "HEAD", "OPTIONS"].includes(method);
  if (mutating && request.nextUrl.pathname.startsWith("/api/")) {
    const origin = request.headers.get("origin");
    // /api/auth validates its own Origin and must answer ticket replays with 401, not 403.
    if (!(request.nextUrl.pathname === "/api/auth" && !origin)) {
      let originHost = "";
      try { originHost = origin ? new URL(origin).host.toLowerCase() : ""; } catch {}
      if (!originHost || originHost !== host) return deny(403, "Forbidden");
    }
  }

  const response = NextResponse.next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  if (request.nextUrl.pathname.startsWith("/api/")) response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
