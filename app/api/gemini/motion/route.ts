import { NextRequest, NextResponse } from 'next/server';
import { generateMotionPrompt } from '@/services/geminiService';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { narration, visualPrompt } = await req.json();
    const motionPrompt = await generateMotionPrompt(narration, visualPrompt);
    return NextResponse.json({ motionPrompt });
  } catch (e: any) {
    console.error('[API] gemini/motion error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
