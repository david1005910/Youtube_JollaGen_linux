import { NextRequest, NextResponse } from 'next/server';
import { generateAudioForScene } from '@/services/geminiService';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    const audioData = await generateAudioForScene(text);
    return NextResponse.json({ audioData });
  } catch (e: any) {
    console.error('[API] gemini/audio error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
