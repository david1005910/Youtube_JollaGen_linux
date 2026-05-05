import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';

export const maxDuration = 60;

const SYSTEM = `당신은 유튜브 콘텐츠 소재 발굴 전문가입니다.
사용자가 선택한 카테고리와 키워드를 바탕으로 지금 당장 제작하면 조회수가 나올 유튜브 영상 소재를 발굴합니다.

출력 형식 (반드시 준수):
각 소재는 아래 구조로 작성합니다.

## 🔥 소재 N: [제목]

**왜 지금인가**: 현재 이 주제가 뜨거운 이유 (1~2문장)
**핵심 훅**: 영상 첫 3초 후킹 문장 (시청자가 계속 볼 수밖에 없는 문장)
**예상 타겟**: 이 영상을 볼 시청자층
**추천 제목 3개**:
  1. (클릭률 높은 제목)
  2. (궁금증 유발 제목)
  3. (숫자/데이터 활용 제목)
**대본 방향**: 영상 구성 흐름 요약 (3~5줄)

---

규칙:
- 소재는 반드시 5개 제시
- 현재 트렌드·뉴스·시사와 연결
- 한국 시청자 관점에서 작성
- 제목에 숫자·감정·궁금증 유발 요소 포함`;

async function streamGemini(
  ctrl: ReadableStreamDefaultController,
  enc: TextEncoder,
  prompt: string
) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) throw new Error('GEMINI_API_KEY 없음');
  const ai = new GoogleGenAI({ apiKey: geminiKey });
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];
  for (const model of models) {
    try {
      const stream = await ai.models.generateContentStream({
        model,
        contents: `${SYSTEM}\n\n${prompt}`,
        config: { maxOutputTokens: 4096, temperature: 0.8 },
      });
      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ text })}\n\n`));
      }
      return;
    } catch (e: any) {
      const skip = /RESOURCE_EXHAUSTED|quota|429|not found|not supported|UNAVAILABLE/i.test(e.message ?? '');
      if (skip) continue;
      throw e;
    }
  }
  throw new Error('Gemini 할당량 초과');
}

export async function POST(req: NextRequest) {
  try {
    const { category, keyword, preferredModel = 'claude' } = await req.json();
    if (!category) return Response.json({ error: 'category 필요' }, { status: 400 });

    const prompt = keyword
      ? `카테고리: ${category}\n추가 키워드/조건: ${keyword}\n\n위 카테고리와 키워드에 맞는 유튜브 소재 5개를 발굴해주세요.`
      : `카테고리: ${category}\n\n지금 가장 뜨거운 "${category}" 관련 유튜브 소재 5개를 발굴해주세요.`;

    const readable = new ReadableStream({
      async start(ctrl) {
        const enc = new TextEncoder();
        try {
          if (preferredModel === 'gemini') {
            await streamGemini(ctrl, enc, prompt);
          } else {
            const anthropicKey = process.env.ANTHROPIC_API_KEY;
            if (!anthropicKey) {
              await streamGemini(ctrl, enc, prompt);
            } else {
              try {
                const client = new Anthropic({ apiKey: anthropicKey });
                const stream = client.messages.stream({
                  model: 'claude-sonnet-4-6',
                  max_tokens: 4096,
                  system: SYSTEM,
                  messages: [{ role: 'user', content: prompt }],
                });
                for await (const event of stream) {
                  if (
                    event.type === 'content_block_delta' &&
                    event.delta.type === 'text_delta' &&
                    event.delta.text
                  ) {
                    ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`));
                  }
                }
              } catch (claudeErr: any) {
                // Claude 크레딧 부족 등 실패 시 Gemini로 자동 폴백
                const msg = claudeErr?.message ?? '';
                if (msg.includes('credit') || msg.includes('billing') || msg.includes('quota') || msg.includes('400') || msg.includes('429')) {
                  ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ text: '⚠️ Claude 크레딧 부족 → Gemini로 전환 중...\n\n' })}\n\n`));
                  await streamGemini(ctrl, enc, prompt);
                } else {
                  throw claudeErr;
                }
              }
            }
          }
          ctrl.enqueue(enc.encode('data: [DONE]\n\n'));
        } catch (e: any) {
          ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ error: e.message })}\n\n`));
        } finally {
          ctrl.close();
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
    return Response.json({ error: e.message }, { status: 500 });
  }
}
