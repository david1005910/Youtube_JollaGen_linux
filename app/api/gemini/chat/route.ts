import { NextRequest } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export const maxDuration = 60;

const SYSTEM_INSTRUCTION = `당신은 YouTube 콘텐츠 전문 AI 어시스턴트입니다.
사용자가 요청하는 주제로 YouTube 영상용 자막(나레이션)과 이미지 프롬프트를 생성합니다.

## 핵심 역할
- 주제/키워드 → 씬별 자막(나레이션) + 이미지 프롬프트 생성
- 대화를 통해 내용을 구체화하고 수정
- 사용자가 쓴 언어로 응답 (한국어 ↔ 영어)

## 스크립트 생성 규칙
사용자가 스크립트/자막/대본 생성을 요청하면 반드시 아래 JSON 블록을 포함하세요:

\`\`\`json
[
  {
    "sceneNumber": 1,
    "narration": "한국어 나레이션 텍스트 (20~40자)",
    "visualPrompt": "English image prompt for scene, detailed visual description"
  }
]
\`\`\`

## 이미지 프롬프트 규칙
- 영어로 작성
- 구체적 시각 요소 포함 (구도, 색상, 스타일)
- 한국 금융/뉴스 콘텐츠: 상승=빨강, 하락=파랑
- 인물이 있으면 stick figure 스타일 명시

## 자막 규칙
- 씬당 20~40자 분량
- 자연스러운 나레이션 흐름
- 총 5~15개 씬 생성

스크립트를 생성한 후에는 수정 요청에 응답하고, 사용자가 만족하면 최종 JSON을 다시 출력하세요.`;

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

    const contents = messages
      .filter((_: any, i: number) => !(i === 0 && messages[0]?.role === 'assistant'))
      .map((m: { role: string; content: string }) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      }));

    if (contents.length === 0) {
      return new Response(JSON.stringify({ error: 'No user messages' }), { status: 400 });
    }

    const streamResult = await ai.models.generateContentStream({
      model: 'gemini-2.5-flash',
      contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        maxOutputTokens: 8192,
        temperature: 0.7,
      },
    });

    const readable = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        try {
          for await (const chunk of streamResult) {
            const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
            if (text) {
              controller.enqueue(enc.encode(`data: ${JSON.stringify({ text })}\n\n`));
            }
          }
          controller.enqueue(enc.encode('data: [DONE]\n\n'));
        } catch (err: any) {
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (e: any) {
    console.warn('[Gemini Chat API]', e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
