import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
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

const GEMINI_CHAT_MODELS = ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-2.5-flash'];

function isQuotaOrCreditsError(err: any): boolean {
  const msg: string = (err?.message ?? '') + JSON.stringify(err?.error ?? '');
  return (
    msg.includes('credit balance') ||
    msg.includes('billing') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('quota') ||
    err?.status === 400 ||
    err?.status === 429
  );
}

async function streamGeminiFallback(
  controller: ReadableStreamDefaultController,
  enc: TextEncoder,
  lastUserMsg: string
): Promise<void> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: 'Claude 크레딧 부족. console.anthropic.com에서 충전하세요.' })}\n\n`));
    return;
  }

  const gemini = new GoogleGenAI({ apiKey: geminiKey });

  for (const model of GEMINI_CHAT_MODELS) {
    try {
      console.warn(`[Chat 폴백] Gemini ${model} 시도`);
      const geminiStream = await gemini.models.generateContentStream({
        model,
        contents: `${SYSTEM_INSTRUCTION}\n\n${lastUserMsg}`,
      });
      for await (const chunk of geminiStream) {
        const text = chunk.text;
        if (text) controller.enqueue(enc.encode(`data: ${JSON.stringify({ text })}\n\n`));
      }
      controller.enqueue(enc.encode('data: [DONE]\n\n'));
      return;
    } catch (e: any) {
      const msg = e?.message ?? '';
      const isSkippable =
        msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota') || msg.includes('429') ||
        msg.includes('not found') || msg.includes('not supported') || msg.includes('UNAVAILABLE');
      if (isSkippable) {
        console.warn(`[Chat 폴백] ${model} 실패(${msg.slice(0, 60)}) → 다음 모델`);
        continue;
      }
      throw e;
    }
  }

  controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: 'Claude 크레딧 부족 + Gemini 할당량 초과. console.anthropic.com에서 충전하세요.' })}\n\n`));
}

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 });
    }

    // 첫 번째 assistant 환영 메시지 제거
    const filtered = messages.filter(
      (_: any, i: number) => !(i === 0 && messages[0]?.role === 'assistant')
    );

    const claudeMessages = filtered.map((m: { role: string; content: string }) => ({
      role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content,
    }));

    if (claudeMessages.length === 0 || claudeMessages[0].role !== 'user') {
      return new Response(JSON.stringify({ error: 'No user messages' }), { status: 400 });
    }

    const lastUserMsg = claudeMessages.filter((m: any) => m.role === 'user').pop()?.content ?? '';

    const readable = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();

        // Claude 사용 가능 여부 확인
        const anthropicKey = process.env.ANTHROPIC_API_KEY;
        if (!anthropicKey) {
          console.warn('[Chat] ANTHROPIC_API_KEY 없음 → Gemini 폴백');
          await streamGeminiFallback(controller, enc, lastUserMsg);
          controller.close();
          return;
        }

        try {
          const client = new Anthropic({ apiKey: anthropicKey });
          const stream = client.messages.stream({
            model: 'claude-sonnet-4-6',
            max_tokens: 8192,
            system: SYSTEM_INSTRUCTION,
            messages: claudeMessages,
          });

          for await (const event of stream) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta' &&
              event.delta.text
            ) {
              controller.enqueue(enc.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`));
            }
          }
          controller.enqueue(enc.encode('data: [DONE]\n\n'));
        } catch (err: any) {
          if (isQuotaOrCreditsError(err)) {
            console.warn('[Chat] Claude 크레딧 부족 → Gemini 폴백');
            await streamGeminiFallback(controller, enc, lastUserMsg);
          } else {
            controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`));
          }
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
    console.warn('[Claude Chat API]', e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
