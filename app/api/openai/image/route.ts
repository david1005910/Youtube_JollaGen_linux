import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { prompt, stylePrompt } = await req.json();
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY가 설정되지 않았습니다.' }, { status: 500 });
    }

    const fullPrompt = stylePrompt
      ? `${prompt}\n\nArt style: ${stylePrompt}`
      : prompt;

    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: fullPrompt.slice(0, 4000),
        n: 1,
        size: '1792x1024',
        response_format: 'b64_json',
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err?.error?.message ?? res.statusText;
      console.error('[API] openai/image error:', msg);
      return NextResponse.json({ error: msg }, { status: res.status });
    }

    const data = await res.json();
    const imageData = data?.data?.[0]?.b64_json ?? null;
    return NextResponse.json({ imageData });
  } catch (e: any) {
    console.error('[API] openai/image error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
