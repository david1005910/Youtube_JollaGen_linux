import { NextRequest, NextResponse } from 'next/server';
import { generateAudioWithElevenLabs } from '@/services/elevenLabsService';
import type { ElevenLabsModelId } from '@/config';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { text, voiceId, modelId } = await req.json();
    // API 키는 서버 환경변수에서 읽음 (elevenLabsService 내부에서 처리)
    const result = await generateAudioWithElevenLabs(
      text,
      undefined,      // providedApiKey: 서버 env var 사용
      voiceId,
      modelId as ElevenLabsModelId | undefined
    );
    return NextResponse.json(result);
  } catch (e: any) {
    console.error('[API] elevenlabs/tts error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
