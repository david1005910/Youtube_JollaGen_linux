import { NextRequest, NextResponse } from 'next/server';
import { generateScript } from '@/services/claudeService';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const { topic, hasReferenceImage, sourceContext } = await req.json();
    const scenes = await generateScript(topic, hasReferenceImage ?? false, sourceContext);
    return NextResponse.json(scenes);
  } catch (e: any) {
    console.warn('[API] gemini/script error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
