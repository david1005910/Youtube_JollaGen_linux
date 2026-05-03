import { NextRequest, NextResponse } from 'next/server';
import { generateAudioWithElevenLabs } from '@/services/elevenLabsService';
import type { ElevenLabsModelId } from '@/config';

export const maxDuration = 60;

// fal.ai ElevenLabs 프록시 (ELEVENLABS_API_KEY 없을 때 폴백)
async function generateWithFalElevenLabs(
  text: string,
  voiceId?: string
): Promise<{ audioData: string | null; subtitleData: null; estimatedDuration: null }> {
  const falApiKey = process.env.FAL_API_KEY;
  if (!falApiKey) return { audioData: null, subtitleData: null, estimatedDuration: null };

  try {
    const response = await fetch('https://fal.run/fal-ai/elevenlabs/tts/multilingual-v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${falApiKey}`,
      },
      body: JSON.stringify({
        text,
        voice_id: voiceId || '21m00Tcm4TlvDq8ikWAM',  // Rachel
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.warn('[FAL ElevenLabs] TTS 오류:', err.slice(0, 200));
      return { audioData: null, subtitleData: null, estimatedDuration: null };
    }

    const data = await response.json();
    const audioUrl = data?.audio?.url;
    if (!audioUrl) {
      console.warn('[FAL ElevenLabs] audio URL 없음:', JSON.stringify(data).slice(0, 100));
      return { audioData: null, subtitleData: null, estimatedDuration: null };
    }

    const audioRes = await fetch(audioUrl);
    const buffer = await audioRes.arrayBuffer();
    const audioData = Buffer.from(buffer).toString('base64');

    console.log('[FAL ElevenLabs] TTS 생성 완료 (타임스탬프 없음)');
    return { audioData, subtitleData: null, estimatedDuration: null };

  } catch (e: any) {
    console.warn('[FAL ElevenLabs] TTS 실패:', e.message);
    return { audioData: null, subtitleData: null, estimatedDuration: null };
  }
}

export async function POST(req: NextRequest) {
  try {
    const { text, voiceId, modelId } = await req.json();

    // 1. 직접 ElevenLabs API 시도
    const result = await generateAudioWithElevenLabs(
      text,
      undefined,
      voiceId,
      modelId as ElevenLabsModelId | undefined
    );

    // 2. 실패 시 fal.ai ElevenLabs 프록시 폴백 (skipRetry = 유료보이스도 fal.ai로 재시도)
    if (!result.audioData) {
      console.warn('[TTS] ElevenLabs 직접 실패 → fal.ai ElevenLabs 폴백 시도');
      const falResult = await generateWithFalElevenLabs(text, voiceId);
      if (falResult.audioData) {
        return NextResponse.json(falResult);
      }
    }

    return NextResponse.json(result);
  } catch (e: any) {
    console.warn('[API] elevenlabs/tts error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
