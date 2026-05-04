import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { text, voiceId, modelId } = await req.json() as {
    text: string;
    voiceId?: string;
    modelId?: string;
  };

  if (!text?.trim()) {
    return NextResponse.json({ error: '텍스트가 필요합니다.' }, { status: 400 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ELEVENLABS_API_KEY가 설정되지 않았습니다.' }, { status: 500 });
  }

  const voice = voiceId ?? process.env.ELEVENLABS_VOICE_ID ?? '21m00Tcm4TlvDq8ikWAM'; // Rachel
  const model = modelId ?? 'eleven_multilingual_v2';

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: model,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (!res.ok) {
    // Rachel 폴백 (유료 보이스 실패 시)
    if (res.status === 401 || res.status === 422) {
      const fallbackRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM`, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: model,
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      });
      if (!fallbackRes.ok) {
        const errText = await fallbackRes.text();
        return NextResponse.json({ error: `TTS 실패: ${errText.slice(0, 200)}` }, { status: 500 });
      }
      const buf = await fallbackRes.arrayBuffer();
      const base64 = Buffer.from(buf).toString('base64');
      return NextResponse.json({ audioDataUrl: `data:audio/mpeg;base64,${base64}`, usedFallback: true });
    }
    const errText = await res.text();
    return NextResponse.json({ error: `ElevenLabs 오류 ${res.status}: ${errText.slice(0, 200)}` }, { status: 500 });
  }

  const buf = await res.arrayBuffer();
  const base64 = Buffer.from(buf).toString('base64');
  return NextResponse.json({ audioDataUrl: `data:audio/mpeg;base64,${base64}` });
}
