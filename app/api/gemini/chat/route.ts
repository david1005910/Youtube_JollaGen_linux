import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';

export const maxDuration = 60;

const SYSTEM_INSTRUCTION = `당신은 [AI돈나] 프로젝트 전용 영상 프롬프트 생성 AI입니다.
사용자가 제공한 대본과 마스터 캐릭터 이미지를 분석하여, 영상 전체에서 일관된 화풍을 유지하면서 각 장면에 최적화된 시각적 프롬프트를 생성합니다.
사용자가 쓴 언어로 응답하세요 (한국어 ↔ 영어).

---

## ★ 규칙 1: 장면 수 고정 (Scene Count Lock) — 최우선 규칙

- **1문단 = 1장면**: 대본의 빈 줄로 구분된 1문단은 반드시 1개의 visualPrompt로 생성합니다.
- **분할 절대 금지**: 한 문단 안에 과거·현재·비유가 섞여 있어도 쪼개지 않습니다. 가장 핵심적인 시각 요소 하나만 선택해 단일 장면으로 구성합니다.
- **narration 원문 보존**: 대본 텍스트는 번역·수정·요약 없이 입력된 그대로 narration에 복사합니다.

---

## ★ 규칙 2: 화풍 및 캐릭터 관리

### 2-1. 고정 화풍 (Base Art Style)
- 사용자가 마스터 이미지를 첨부하거나 화풍을 설명하면, 해당 렌더링 방식·질감·조명 키워드를 **추출**합니다.
- 추출된 키워드를 **모든 장면 프롬프트 맨 앞**에 배치하여 시각적 통일성을 유지합니다.
- 화풍 키워드 예시: "2D hand-drawn crayon texture, warm pastel tones, soft shadows, 16:9 aspect ratio"

### 2-2. 마스터 캐릭터 유지
- 주인공(마스터 캐릭터) 등장 씬에서는 첨부 이미지의 외형 키워드를 그대로 사용합니다.
- 예: "the Master Character [외형 키워드: short black hair, red blouse, round face]"

### 2-3. 제3자(조연) 분리
- 새로운 인물 등장 시 반드시 "NOT the Master Character"를 삽입하여 주인공과 얼굴이 섞이지 않도록 구분합니다.
- 예: "a male office worker (NOT the Master Character), wearing blue suit, middle-aged"

---

## ★ 규칙 3: 기술적 제약 및 출력 포맷

### 3-1. 텍스트 렌더링 금지
- 모든 visualPrompt 끝에 반드시 아래 구문을 추가합니다:
  \`--no text, letters, fonts, watermarks, split screen\`

### 3-2. 단계별 출력 (10장면 단위)
- 한 번에 최대 **10장면**까지만 출력합니다.
- 10장면 출력 후 "다음 10장면을 생성하려면 **'다음'**을 입력하세요."라고 안내합니다.
- 사용자가 "다음"을 입력하면 이어서 다음 10장면을 생성합니다.

### 3-3. JSON 출력 형식 (필수)
스크립트 생성·수정 시 반드시 아래 JSON 블록을 포함하세요:

\`\`\`json
[
  {
    "sceneNumber": 1,
    "narration": "원본 대본 텍스트 그대로 복사 (수정·번역 금지)",
    "visualPrompt": "[Base Art Style] Scene description, character info, composition. --no text, letters, fonts, watermarks, split screen"
  }
]
\`\`\`

---

## 규칙 4: 이미지 프롬프트 작성 세부 규칙

### 4-1. 캐릭터 등장 판단
| 주어 유형 | 구도 | 설명 |
|----------|------|------|
| 수치·데이터·시스템·추상 개념 | NO_CHAR | 캐릭터 없음. 그래프·숫자·아이콘만 |
| 주인공 인물 | STANDARD (30~40%) | 마스터 캐릭터 키워드 사용 |
| 사물 강조, 인물은 배경 | MICRO (5~15%) | 작은 인물 + 큰 사물 |
| 감정·표정 강조 | MACRO (60~80%) | 인물 클로즈업 |
| 조연 인물 등장 | STANDARD | "NOT the Master Character" 삽입 |

### 4-2. 한국 금융·경제 색상 규칙
- 상승·호재·긍정 → 빨간색 (Red)
- 하락·악재·부정 → 파란색 (Blue)
- 중립 → 회색·베이지

### 4-3. 고유명사 표기
- 한국 브랜드·기관 → 한국어 ("삼성전자", "한국은행")
- 외국 브랜드 → 영어 ("Tesla", "NVIDIA", "Apple")

### 4-4. visualPrompt 구조
[Base Art Style] + [장면 핵심 설명] + [캐릭터 정보] + [구도·색상·분위기] + [--no text, letters, fonts, watermarks, split screen]

---

## 규칙 5: 대화 흐름

1. 사용자가 마스터 이미지(또는 화풍 설명) + 대본을 입력
2. 화풍 키워드를 먼저 추출하여 사용자에게 확인받기
3. 확인 후 1~10장면 JSON 생성 출력
4. "다음 10장면을 생성하려면 **'다음'**을 입력하세요." 안내
5. "다음" 입력 시 11~20장면 이어서 생성
6. 수정 요청 시 해당 씬 번호만 재생성

---

## 절대 금지 사항

- narration 필드에서 원본 대본 수정·번역·요약 금지
- visualPrompt를 한국어로 작성 금지 (반드시 영어)
- 한 문단을 두 개 이상의 장면으로 분할 금지
- 10장면을 초과하여 한 번에 출력 금지
- "--no text, letters, fonts, watermarks, split screen" 누락 금지
- 마스터 캐릭터와 조연 인물을 동일 외형으로 묘사 금지`;



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

// Gemini용 대화 히스토리 → contents 변환
function buildGeminiContents(messages: { role: string; content: string }[], system: string) {
  // 히스토리가 있으면 대화 이어가기, 없으면 시스템+마지막 메시지
  if (messages.length <= 1) {
    return `${system}\n\n${messages[0]?.content ?? ''}`;
  }
  const history = messages
    .map(m => `${m.role === 'user' ? '사용자' : 'AI'}: ${m.content}`)
    .join('\n\n');
  return `${system}\n\n대화 내역:\n${history}`;
}

export async function POST(req: NextRequest) {
  try {
    const { messages, preferredModel = 'claude' } = await req.json();
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

        // ── Gemini 우선 선택 ──
        if (preferredModel === 'gemini') {
          console.log('[Chat] Gemini 모드 선택');
          const geminiKey = process.env.GEMINI_API_KEY;
          if (!geminiKey) {
            controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' })}\n\n`));
            controller.close();
            return;
          }
          const gemini = new GoogleGenAI({ apiKey: geminiKey });
          const geminiContents = buildGeminiContents(claudeMessages, SYSTEM_INSTRUCTION);
          for (const model of GEMINI_CHAT_MODELS) {
            try {
              const stream = await gemini.models.generateContentStream({ model, contents: geminiContents });
              for await (const chunk of stream) {
                const text = chunk.text;
                if (text) controller.enqueue(enc.encode(`data: ${JSON.stringify({ text })}\n\n`));
              }
              controller.enqueue(enc.encode('data: [DONE]\n\n'));
              controller.close();
              return;
            } catch (e: any) {
              const msg = e?.message ?? '';
              const skip = msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota') ||
                           msg.includes('429') || msg.includes('not found') || msg.includes('not supported') || msg.includes('UNAVAILABLE');
              if (skip) { console.warn(`[Gemini] ${model} 실패 → 다음 모델`); continue; }
              controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
              controller.close();
              return;
            }
          }
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: 'Gemini 할당량 초과. 잠시 후 다시 시도하세요.' })}\n\n`));
          controller.close();
          return;
        }

        // ── OpenAI ──────────────────────────────────────────────────────────
        if (preferredModel === 'openai') {
          console.log('[Chat] OpenAI 모드 선택');
          const openaiKey = process.env.OPENAI_API_KEY;
          if (!openaiKey) {
            controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: 'OPENAI_API_KEY가 설정되지 않았습니다. ⚙️ 설정에서 키를 입력하세요.' })}\n\n`));
            controller.close();
            return;
          }
          try {
            const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${openaiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'gpt-4o',
                stream: true,
                messages: [
                  { role: 'system', content: SYSTEM_INSTRUCTION },
                  ...claudeMessages,
                ],
                max_tokens: 8192,
              }),
            });
            if (!openaiRes.ok) {
              const errText = await openaiRes.text();
              controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: `OpenAI 오류: ${openaiRes.status} ${errText.slice(0, 200)}` })}\n\n`));
              controller.close();
              return;
            }
            const reader = openaiRes.body!.getReader();
            const dec = new TextDecoder();
            let buf = '';
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += dec.decode(value, { stream: true });
              const lines = buf.split('\n');
              buf = lines.pop() ?? '';
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed === 'data: [DONE]') continue;
                if (trimmed.startsWith('data: ')) {
                  try {
                    const json = JSON.parse(trimmed.slice(6));
                    const text = json.choices?.[0]?.delta?.content;
                    if (text) controller.enqueue(enc.encode(`data: ${JSON.stringify({ text })}\n\n`));
                  } catch {}
                }
              }
            }
            controller.enqueue(enc.encode('data: [DONE]\n\n'));
          } catch (err: any) {
            controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: err.message ?? 'OpenAI 오류' })}\n\n`));
          } finally {
            controller.close();
          }
          return;
        }

        // ── Claude 전용 (폴백 없음) ──
        const anthropicKey = process.env.ANTHROPIC_API_KEY;
        if (!anthropicKey) {
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' })}\n\n`));
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
            controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: 'Claude 크레딧이 부족합니다. console.anthropic.com에서 충전하세요.' })}\n\n`));
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
