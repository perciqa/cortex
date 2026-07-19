import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/api/auth", "/_next", "/favicon.ico"];

function isPublic(path: string) {
  return PUBLIC.some((p) => path.startsWith(p));
}

async function makeToken(password: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(password));
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname) || pathname.includes(".")) return NextResponse.next();

  const secret = process.env.COOKIE_SECRET ?? "dev-secret";
  const expected = await makeToken(process.env.CONSOLE_PASSWORD ?? "perciqa", secret);
  const cookie = request.cookies.get("console_session")?.value;

  if (cookie === expected) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
