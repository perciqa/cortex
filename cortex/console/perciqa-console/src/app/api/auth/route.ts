import { NextResponse, type NextRequest } from "next/server";
import { createHmac } from "crypto";

export async function POST(request: NextRequest) {
  const { password } = await request.json();
  const expected = process.env.CONSOLE_PASSWORD ?? "perciqa";
  const secret = process.env.COOKIE_SECRET ?? "dev-secret";

  if (password !== expected) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const token = createHmac("sha256", secret).update(password).digest("hex");
  const res = NextResponse.json({ ok: true });
  res.cookies.set("console_session", token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
  return res;
}
