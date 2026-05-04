import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const FAL_MODEL_IDS: Record<string, string> = {
  'fal-imagen-3': 'fal-ai/imagen3',
  'fal-imagen-4': 'fal-ai/imagen4/preview',
  'fal-flux-pro-ultra': 'fal-ai/flux-pro/v1.1-ultra',
  'fal-flux-pro': 'fal-ai/flux-pro/v1.1',
  'fal-flux-dev': 'fal-ai/flux/dev',
  'fal-nano-banana-2': 'fal-ai/nano-banana-2',
};

// Gemini 이미지 생성 후보 모델 (순서대로 시도, 구버전 삭제됨)
const GEMINI_IMAGE_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image-preview',
];

export async function POST(req: NextRequest) {
  const { prompt, modelId, referenceImages } = await req.json() as {
    prompt: string;
    modelId: string;
    referenceImages?: string[]; // base64 data URLs for Gemini multimodal
  };

  if (!prompt?.trim()) {
    return NextResponse.json({ error: '프롬프트가 필요합니다.' }, { status: 400 });
  }

  try {
    // ── Gemini 이미지 생성 ──────────────────────────────────────────────────
    if (modelId === 'gemini-2.0-flash-image') {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' }, { status: 500 });

      // v1beta는 image generation 미지원 → v1alpha 사용
      const ai = new GoogleGenAI({ apiKey, apiVersion: 'v1alpha' } as any);

      // Build multimodal contents (reference images + prompt)
      const buildContents = (promptText: string) => {
        if (!referenceImages?.length) return promptText;
        const parts: any[] = [];
        parts.push({ text: 'Use the following reference images for style and character consistency:' });
        for (const dataUrl of referenceImages) {
          const [header, data] = dataUrl.split(',');
          const mimeType = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg';
          parts.push({ inlineData: { data, mimeType } });
        }
        parts.push({ text: promptText });
        return [{ role: 'user', parts }];
      };

      for (const model of GEMINI_IMAGE_MODELS) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: buildContents(prompt) as any,
            config: { responseModalities: ['IMAGE', 'TEXT'] } as any,
          });

          for (const part of (response.candidates?.[0]?.content?.parts ?? [])) {
            if ((part as any).inlineData) {
              const { data, mimeType } = (part as any).inlineData;
              return NextResponse.json({ imageDataUrl: `data:${mimeType};base64,${data}` });
            }
          }
        } catch (e: any) {
          const msg: string = e?.message ?? '';
          // 모델 미지원 오류면 다음 모델 시도
          if (msg.includes('NOT_FOUND') || msg.includes('not found') || msg.includes('not supported')) {
            console.warn(`[Image] ${model} 미지원, 다음 시도`);
            continue;
          }
          throw e;
        }
      }

      // Gemini 모두 실패 → Imagen 3 generateImages 폴백
      try {
        const response = await ai.models.generateImages({
          model: 'imagen-3.0-generate-002',
          prompt,
          config: { numberOfImages: 1, aspectRatio: '16:9' } as any,
        });
        const imageBytes = (response as any).generatedImages?.[0]?.image?.imageBytes;
        if (imageBytes) {
          return NextResponse.json({ imageDataUrl: `data:image/jpeg;base64,${imageBytes}` });
        }
      } catch (e: any) {
        console.warn('[Image] Imagen 3 폴백 실패:', e?.message);
      }

      return NextResponse.json({ error: 'Gemini 이미지 생성 실패. FAL 모델을 선택하거나 프롬프트를 확인하세요.' }, { status: 500 });
    }

    // ── fal.ai 이미지 생성 ──────────────────────────────────────────────────
    const falModelId = FAL_MODEL_IDS[modelId];
    if (!falModelId) {
      return NextResponse.json({ error: `알 수 없는 모델: ${modelId}` }, { status: 400 });
    }

    const apiKey = process.env.FAL_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'FAL_API_KEY가 설정되지 않았습니다.' }, { status: 500 });

    const falRes = await fetch(`https://fal.run/${falModelId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt, image_size: 'landscape_16_9', num_inference_steps: 28 }),
    });

    if (!falRes.ok) {
      const errText = await falRes.text();
      return NextResponse.json({ error: `fal.ai 오류 ${falRes.status}: ${errText.slice(0, 300)}` }, { status: 500 });
    }

    const falData = await falRes.json() as { images?: { url: string }[] };
    const imageUrl = falData.images?.[0]?.url;
    if (!imageUrl) {
      return NextResponse.json({ error: 'fal.ai 응답에 이미지가 없습니다.' }, { status: 500 });
    }

    return NextResponse.json({ imageUrl });
  } catch (err: any) {
    const raw: string = err?.message ?? JSON.stringify(err) ?? '이미지 생성 실패';
    let friendly = raw;
    try {
      // SDK가 JSON 문자열을 message에 담는 경우 파싱
      const parsed = JSON.parse(raw);
      const inner = parsed?.error ?? parsed;
      const code: number = inner?.code ?? 0;
      const msg: string = inner?.message ?? raw;
      if (code === 429 || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
        friendly = 'Gemini API 무료 쿼터가 초과됐습니다. fal.ai 모델(Imagen 3/4, FLUX)을 선택하거나 잠시 후 다시 시도하세요.';
      } else if (code === 404 || msg.includes('NOT_FOUND')) {
        friendly = `Gemini 모델을 찾을 수 없습니다. fal.ai 모델을 선택하세요.`;
      } else {
        friendly = msg.slice(0, 300);
      }
    } catch {}
    return NextResponse.json({ error: friendly }, { status: 500 });
  }
}
