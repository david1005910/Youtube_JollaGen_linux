import { NextRequest, NextResponse } from 'next/server';
import { generateImageForScene } from '@/services/geminiService';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { scene, referenceImages, stylePrompt } = await req.json();
    const imageData = await generateImageForScene(scene, referenceImages, stylePrompt);
    return NextResponse.json({ imageData });
  } catch (e: any) {
    console.error('[API] gemini/image error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
