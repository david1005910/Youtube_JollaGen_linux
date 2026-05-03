import { NextRequest, NextResponse } from 'next/server';
import { generateImageForScene } from '@/services/geminiService';

export const maxDuration = 60;

const FREE_MODEL_ID = 'gemini-2.0-flash-image'; // gemini-3.1-flash-image-preview (무료)

function isQuotaError(msg: string) {
  return msg.includes('RESOURCE_EXHAUSTED') || msg.includes('limit: 0') ||
    msg.includes('429') || msg.includes('quota') || msg.includes('exceeded');
}

export async function POST(req: NextRequest) {
  try {
    const { scene, referenceImages, stylePrompt, imageModelId } = await req.json();

    let imageData: string | null = null;
    try {
      imageData = await generateImageForScene(scene, referenceImages, stylePrompt, imageModelId);
    } catch (e: any) {
      // 유료 모델이 할당량 초과(limit:0 포함)인 경우 무료 모델로 자동 폴백
      if (isQuotaError(e.message) && imageModelId !== FREE_MODEL_ID) {
        console.warn(`[Image API] 할당량 초과(${imageModelId}) → 무료 모델(${FREE_MODEL_ID})로 폴백`);
        imageData = await generateImageForScene(scene, referenceImages, stylePrompt, FREE_MODEL_ID);
      } else {
        throw e;
      }
    }

    return NextResponse.json({ imageData });
  } catch (e: any) {
    console.warn('[API] gemini/image error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
