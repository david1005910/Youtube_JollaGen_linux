import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

const FAL_MODEL_MAP: Record<string, string> = {
  'fal-imagen-3':   'fal-ai/imagen3',
  'fal-imagen-4':   'fal-ai/imagen4/preview',
  'fal-flux-dev':   'fal-ai/flux/dev',
  'fal-flux-schnell': 'fal-ai/flux/schnell',
};

// Imagen 계열 모델 여부
function isImagenModel(modelId: string) {
  return modelId === 'fal-imagen-3' || modelId === 'fal-imagen-4';
}

export async function POST(req: NextRequest) {
  try {
    const { prompt, stylePrompt, modelId } = await req.json();
    const apiKey = process.env.FAL_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'FAL_API_KEY가 설정되지 않았습니다.' }, { status: 500 });
    }

    const falModel = FAL_MODEL_MAP[modelId] ?? 'fal-ai/flux/dev';
    const fullPrompt = stylePrompt
      ? `${prompt}\n\nArt style: ${stylePrompt}`
      : prompt;

    // Imagen과 FLUX는 request body 형식이 다름
    const requestBody = isImagenModel(modelId)
      ? {
          prompt: fullPrompt,
          aspect_ratio: '16:9',
          num_images: 1,
        }
      : {
          prompt: fullPrompt,
          image_size: 'landscape_16_9',
          num_images: 1,
          num_inference_steps: modelId === 'fal-flux-schnell' ? 4 : 28,
          enable_safety_checker: false,
        };

    const res = await fetch(`https://fal.run/${falModel}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err?.detail ?? err?.message ?? res.statusText;
      console.warn('[API] fal/image error:', msg);
      return NextResponse.json({ error: msg }, { status: res.status });
    }

    const data = await res.json();
    const imageUrl = data?.images?.[0]?.url;
    if (!imageUrl) {
      return NextResponse.json({ error: '이미지 URL을 받지 못했습니다.' }, { status: 500 });
    }

    const imgRes = await fetch(imageUrl);
    const buffer = await imgRes.arrayBuffer();
    const imageData = Buffer.from(buffer).toString('base64');

    return NextResponse.json({ imageData });
  } catch (e: any) {
    console.warn('[API] fal/image error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
