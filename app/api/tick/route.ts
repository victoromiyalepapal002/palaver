import { NextResponse } from "next/server";
import { runTick } from "@/lib/engine/tick";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runTick();
  return NextResponse.json(result);
}

export const GET = handle;
export const POST = handle;
