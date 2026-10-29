"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/server";

const STYLES = ["english", "pidgin", "mixed"] as const;

function readFields(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  if (!name) throw new Error("Name is required");

  const style = String(formData.get("language_style") ?? "mixed");
  const color = String(formData.get("color") ?? "#c9a227");
  const roast = Number(formData.get("roast_level") ?? 2);

  return {
    name,
    avatar: String(formData.get("avatar") ?? "🤖").trim().slice(0, 500) || "🤖",
    color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#c9a227",
    tagline: String(formData.get("tagline") ?? "").trim().slice(0, 120),
    persona: String(formData.get("persona") ?? "").trim().slice(0, 2000),
    language_style: (STYLES as readonly string[]).includes(style) ? style : "mixed",
    roast_level: Number.isFinite(roast) ? Math.min(3, Math.max(0, Math.round(roast))) : 2,
    active: formData.get("active") === "on",
  };
}

export async function updateCharacter(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing id");

  const db = createServiceClient();
  const { error } = await db.from("characters").update(readFields(formData)).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/characters");
  revalidatePath("/");
}

export async function createCharacter(formData: FormData) {
  await requireAdmin();
  const db = createServiceClient();

  const { data: last } = await db
    .from("characters")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1);
  const next = (last?.[0]?.sort_order ?? 0) + 1;

  const { error } = await db
    .from("characters")
    .insert({ ...readFields(formData), sort_order: next });
  if (error) throw new Error(error.message);

  revalidatePath("/admin/characters");
}
