import { NextResponse } from "next/server";
export async function DELETE(){return NextResponse.json({error:"Impact records are retained. Record a correction instead of deleting history."},{status:405});}
