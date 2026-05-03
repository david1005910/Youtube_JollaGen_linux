import { NextRequest, NextResponse } from 'next/server';
import { generateVideoFromImage } from '@/services/falService';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, motionPrompt } = await req.json();
    // API 키는 서버 환경변수에서 읽음 (falService.getFalApiKey() 내부에서 처리)
    const videoUrl = await generateVideoFromImage(imageBase64, motionPrompt);
    return NextResponse.json({ videoUrl });
  } catch (e: any) {
    console.warn('[API] fal/video error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
