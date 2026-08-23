import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Ctx) {
  await params;
  return NextResponse.json(
    { error: "Survey template deletion is retired. Archive or supersede the template instead." },
    { status: 405, headers: { Allow: "GET, PATCH" } },
  );
}
