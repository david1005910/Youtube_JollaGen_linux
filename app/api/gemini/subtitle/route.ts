import { NextRequest, NextResponse } from 'next/server';
import { splitSubtitleByMeaning } from '@/services/geminiService';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { narration, maxChars } = await req.json();
    const chunks = await splitSubtitleByMeaning(narration, maxChars ?? 20);
    return NextResponse.json(chunks);
  } catch (e: any) {
    console.error('[API] gemini/subtitle error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
