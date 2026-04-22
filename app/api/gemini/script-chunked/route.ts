import { NextRequest, NextResponse } from 'next/server';
import { generateScriptChunked } from '@/services/geminiService';

// 긴 대본 처리는 시간이 오래 걸릴 수 있음 (Vercel Pro 필요)
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const { topic, hasReferenceImage, sourceContext, chunkSize } = await req.json();
    const scenes = await generateScriptChunked(
      topic,
      hasReferenceImage ?? false,
      sourceContext,
      chunkSize ?? 2500
      // onProgress 콜백은 HTTP 응답 특성상 지원 불가
    );
    return NextResponse.json(scenes);
  } catch (e: any) {
    console.error('[API] gemini/script-chunked error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
