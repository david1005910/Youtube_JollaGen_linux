import { NextRequest } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export const maxDuration = 60;

const SYSTEM = `당신은 YouTube 영상 클립 편집 전문가입니다.
주어진 자막/트랜스크립트를 분석하여 가장 흥미로운 클립 구간을 추출해주세요.

응답은 반드시 아래 JSON 형식만 출력하세요 (추가 설명 없이):
{
  "clips": [
    {
      "start": "HH:MM:SS",
      "end": "HH:MM:SS",
      "label": "클립 제목 (한국어, 20자 이내)",
      "reason": "선택 이유 (30자 이내)"
    }
  ]
}

규칙:
- 클립 길이: 최소 30초, 최대 5분
- 클립 수: 최대 8개
- 핵심 장면, 하이라이트, 재미있는 순간 위주로 선택
- 시간 형식은 반드시 HH:MM:SS (예: 00:01:30)`;

export async function POST(req: NextRequest) {
  try {
    const { transcript, userQuery, videoTitle, duration } = await req.json();

    if (!transcript) {
      return Response.json({ error: 'transcript가 필요합니다.' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return Response.json({ error: 'GEMINI_API_KEY 미설정' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const prompt = [
      `영상 제목: ${videoTitle || '알 수 없음'}`,
      `영상 길이: ${duration ? Math.round(duration / 60) + '분' : '알 수 없음'}`,
      userQuery ? `사용자 요청: "${userQuery}"` : '',
      '',
      '## 자막/트랜스크립트',
      transcript.slice(0, 12000),
    ].filter(Boolean).join('\n');

    const result = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: SYSTEM,
        temperature: 0.3,
        maxOutputTokens: 2048,
      },
    });

    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // JSON 파싱 — 코드블록 제거 후 시도
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const json = JSON.parse(cleaned);

    return Response.json({ ok: true, clips: json.clips || [] });

  } catch (e: any) {
    console.error('[Clipper Analyze]', e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
