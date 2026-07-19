import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json({ api_key: process.env.ARGUS_API_KEY ?? "" });
}
