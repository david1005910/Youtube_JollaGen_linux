# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

**TubeGen AI** - AI 기반 스토리보드 & 영상 자동 생성 앱

주요 기능:
- 키워드/대본 입력 → AI가 자동으로 스토리보드 생성 (Claude Sonnet 4.6)
- 씬별 이미지 생성 (Gemini 2.5 Flash Image / Google Imagen 3·4 via fal.ai)
- TTS 음성 생성 (ElevenLabs + 타임스탬프 자막, 유료보이스→Rachel 자동 폴백)
- 이미지→영상 애니메이션 변환 (fal.ai Google Veo 3)
- MP4 렌더링 및 내보내기
- 엑셀 스토리보드 내보내기 (이미지 포함)
- YouTube 영상 다운로드 → AI 클립 분석 → 자막 소각(burn) 5단계 워크플로우 (`VideoWorkflow.tsx`)

## 개발 명령어

```bash
npm install       # 의존성 설치
npm run dev       # 개발 서버 실행 (포트 3000)
npm run build     # 프로덕션 빌드
npm run start     # 빌드 결과 실행
npm run lint      # Next.js ESLint 검사
```

**참고:** 테스트 스크립트 없음

## 시스템 의존성 (서버 런타임)

YouTube 클리퍼 워크플로우는 아래 CLI 도구가 서버에 설치되어 있어야 함:

```bash
# yt-dlp — YouTube 영상 다운로드 (download-stream API)
pip install yt-dlp        # 또는: sudo apt install yt-dlp

# ffmpeg — 자막 소각 (burn-subtitles API)
sudo apt install ffmpeg
```

- 다운로드 임시 경로: `/tmp/tubegen/`
- 자막 소각 출력 경로: `public/clips/`  (Next.js 정적 서빙 → `/clips/파일명.mp4`)

## 환경 변수 설정

`.env.local` 파일에 API 키 설정 (서버 사이드 전용 — 클라이언트에 절대 노출 안 됨):
```
GEMINI_API_KEY=your_gemini_api_key          # 이미지/TTS 전용
ANTHROPIC_API_KEY=your_anthropic_api_key    # 스크립트·프롬프트·채팅 생성 (Claude)
FAL_API_KEY=your_fal_api_key                # Imagen 3/4, Veo 3, ElevenLabs 프록시
ELEVENLABS_API_KEY=your_elevenlabs_key
ELEVENLABS_VOICE_ID=your_voice_id           # 선택적 (유료보이스 불가 시 Rachel 자동 전환)
OPENAI_API_KEY=your_openai_api_key          # DALL-E 3 이미지 생성용 (선택적)
TRANSCRIPT_API_KEY=sk_...                   # TranscriptAPI.com — YouTube 데이터 조회용 (선택적)
```

`NEXT_PUBLIC_` 접두사 없는 변수는 서버에서만 접근 가능.

## Vercel 배포

```bash
vercel deploy   # Vercel CLI 배포
```
Vercel 대시보드에서 환경변수 설정 후 배포. `vercel.json`에 API 라우트 타임아웃 300초 설정됨.
Vercel Pro 필요 사항: 긴 대본 처리(`/api/gemini/script-chunked`), 레퍼런스 이미지 10MB 초과 시.

## 기술 스택

- **프레임워크**: Next.js 15 (App Router) + React 19 + TypeScript 5.8 (`strict: false`)
- **Path alias**: `@` → 프로젝트 루트 (`@/*` → `./*` per tsconfig.json)
- **스타일링**: Tailwind CSS (CDN — `app/layout.tsx` head에 포함)
- **AI 서비스**:
  - Anthropic Claude (`@anthropic-ai/sdk`) — 스크립트·트렌드·자막·모션·채팅 생성 (`claudeService.ts`)
  - Google Gemini API (`@google/genai`) — 이미지 생성, TTS 폴백 (텍스트 생성 제거됨)
  - fal.ai — Google Imagen 3/4 이미지 생성 + Veo 3 영상 변환 + ElevenLabs 프록시
  - ElevenLabs — 고품질 TTS + 타임스탬프 자막 (유료보이스→Rachel 자동 전환)
  - OpenAI (`DALL-E 3`) — 대체 이미지 생성 (`/api/openai/image`)
- **영상 플레이어**: Remotion (`@remotion/player`) — React 기반 영상 미리보기
- **저장소**: IndexedDB (프로젝트 저장), localStorage (설정)
- **내보내기**: ExcelJS, JSZip, FileSaver

## 프로젝트 구조

```
/                         # 루트
├── app/
│   ├── layout.tsx        # HTML 루트 레이아웃 (Tailwind CDN 포함)
│   ├── page.tsx          # 홈 페이지 (App.tsx 렌더링)
│   └── api/              # 서버 사이드 API 라우트 (AI 키 보호)
│       ├── gemini/{trends,script,script-chunked,image,audio,motion,subtitle}/route.ts
│       ├── elevenlabs/{tts,voices}/route.ts
│       ├── fal/{video,image}/route.ts
│       ├── openai/image/route.ts  # DALL-E 3 (OPENAI_API_KEY 필요)
│       ├── tts/route.ts           # 통합 TTS 엔드포인트
│       ├── image/generate/route.ts # 통합 이미지 생성 엔드포인트
│       ├── settings/apikey/route.ts # 런타임 API 키 관리
│       ├── media/serve/route.ts   # 로컬 파일 스트리밍 (범위 요청 지원, /tmp/tubegen + public/ 허용)
│       └── youtube/
│           ├── chat/route.ts          # YouTube AI 채팅
│           ├── data/route.ts          # YouTube 데이터 조회
│           ├── download/route.ts      # 단순 다운로드
│           ├── download-stream/route.ts # yt-dlp + SSE 실시간 진행률
│           ├── clip/route.ts          # 구간 클리핑
│           ├── clipper-analyze/route.ts # AI 클립 분석
│           └── burn-subtitles/route.ts  # FFmpeg 자막 소각 (libass, ASS 스타일)
├── App.tsx               # 메인 앱 ('use client', import from apiClient)
├── types.ts              # TypeScript 인터페이스
├── config.ts             # 전역 설정 (모델, 가격, 스타일)
├── components/           # 모두 'use client' 컴포넌트
├── services/
│   ├── apiClient.ts      # 클라이언트→/api/* 래퍼 (브라우저에서 호출)
│   ├── imageConfig.ts    # localStorage 기반 이미지/스타일 설정 (클라이언트 전용)
│   ├── claudeService.ts  # Claude SDK — 텍스트 생성 전용 (서버 API 라우트에서만 import)
│   ├── geminiService.ts  # Gemini SDK — 이미지·TTS 전용 (서버 API 라우트에서만 import)
│   ├── elevenLabsService.ts # ElevenLabs (서버 API 라우트에서만 import)
│   ├── falService.ts     # fal.ai — Imagen·Veo 3 (서버 API 라우트에서만 import)
│   ├── videoService.ts   # Canvas MP4 렌더링 (브라우저 전용)
│   ├── projectService.ts # IndexedDB (브라우저 전용)
│   ├── remotionService.ts # GeneratedAsset[] → RemotionVideoProps 변환 (브라우저 전용)
│   ├── prompts.ts        # V10.0 프롬프트 엔진
│   ├── srtService.ts     # SRT 자막 생성
│   └── exportService.ts  # 엑셀 내보내기
└── utils/
    └── csvHelper.ts
```

**핵심 구분:**
- **서버 전용**: `services/{claudeService,geminiService,elevenLabsService,falService}.ts` — API 라우트에서만 import
- **클라이언트 전용**: `services/{videoService,projectService,exportService,srtService,remotionService}.ts` — 브라우저 API 사용
- **공유**: `services/apiClient.ts` — 브라우저에서 `/api/*` 호출 + 모델 라우팅 로직, `services/imageConfig.ts` — localStorage 읽기

**레거시 파일 (무시):** 루트의 `index.html`, `index.tsx`, `vite.config.ts.bak`, `dist/` — Vite 시절 파일. Next.js로 마이그레이션 후 미삭제 상태.

**`imageService.ts` 주의:** `generateImage()` 함수는 현재 미사용 (API 라우트는 `geminiService.ts` 직접 호출). `projectService.ts`가 `getSelectedImageModel()`만 사용 중 — `imageConfig.ts`와 중복. 향후 정리 대상.

## 아키텍처

### 데이터 흐름
```
사용자 입력 (키워드/대본)
    ↓
App.tsx → apiClient.ts → /api/gemini/script → geminiService.generateScript()
          └── 긴 대본(3000자+) → /api/gemini/script-chunked
    ↓
apiClient.generateImage() [모델 라우팅: dall-e-3 / fal-*(Imagen·FLUX) / Gemini(기본)]
    ├── /api/gemini/image → geminiService.generateImageForScene()
    ├── /api/openai/image → DALL-E 3
    └── /api/fal/image → falService (Imagen 3: fal-ai/imagen3, Imagen 4: fal-ai/imagen4/preview)
apiClient.generateAudioWithElevenLabs() → /api/elevenlabs/tts   ← Promise.all 병렬 실행
    유료보이스 실패 → Rachel 자동 전환 → 실패 시 fal.ai ElevenLabs 프록시 → Gemini TTS
    ↓
[falService] 이미지→영상 (수동 버튼, /api/fal/video) → Veo 3: fal-ai/veo3/image-to-video (8초)
    ↓
[videoService] MP4 렌더링 및 내보내기 (자막 하드코딩 옵션)
```

### 핵심 서비스

| 파일 | 역할 |
|------|------|
| `claudeService.ts` | Claude API 통합 — 트렌드 검색, 스크립트 생성, 자막 분리, 모션 프롬프트 (FAST: haiku, SMART: sonnet) |
| `geminiService.ts` | Gemini API 통합 — 이미지 생성, TTS 폴백, 키워드 정화(sanitizePrompt) (텍스트 생성 제거됨) |
| `elevenLabsService.ts` | ElevenLabs TTS + 단어별 타임스탬프, 유료보이스→Rachel 자동 폴백 |
| `falService.ts` | fal.ai — Imagen 3/4 이미지 생성 + Veo 3 영상 변환 (8초, 720p) |
| `prompts.ts` | V10.0 프롬프트 엔진 — 의미 기반 시각화, 구도 시스템, 색상 규칙 |
| `videoService.ts` | Canvas 2D 기반 MP4 렌더링 (자막 하드코딩, 레이지 로딩) |
| `projectService.ts` | IndexedDB 저장 (DB: 'TubeGenAI'), 썸네일 생성, localStorage 마이그레이션 |
| `remotionService.ts` | `GeneratedAsset[]` → `RemotionVideoProps` 변환 (30fps, 씬별 자막 프레임 계산) |
| `imageService.ts` | ⚠️ 레거시 — `generateImage()` 미사용; 모델 라우팅은 `apiClient.ts`로 이동됨 |

### 주요 타입 (`types.ts`)

- `ScriptScene` — 씬 데이터 (narration, visualPrompt, analysis)
- `GeneratedAsset` — 생성된 에셋 (이미지, 오디오, 자막, 영상, status)
- `ReferenceImages` — 참조 이미지 (캐릭터/스타일 분리, 강도 0~100, 최대 각 2장)
- `SubtitleData` — 자막 (단어별 타임스탬프 + meaningChunks)
- `SceneAnalysis` — 구도(`composition_type`: `MICRO|STANDARD|MACRO`), color_plan, motion. **NO_CHAR는 타입 없음** — `prompts.ts` 로직에서 `analysis === undefined`로 처리

### 설정 (`config.ts`)

- `IMAGE_MODELS` — 이미지 생성 모델 (Gemini 2.5 Flash, Imagen 3/4 via fal.ai)
- `GEMINI_STYLE_CATEGORIES` — 화풍 프리셋 (크레용, 한국 경제 카툰, 수채화, 커스텀, 없음)
- `ELEVENLABS_MODELS` / `ELEVENLABS_DEFAULT_VOICES` — TTS 모델/음성 목록
- `PRICING` — API 가격 (이미지 $0.0315, TTS $0.00003/char, 영상 $0.50 Veo 3; USD→KRW 1450 고정)
- `CONFIG.ANIMATION` — ENABLED_SCENES(10), VIDEO_DURATION(5s)

## App.tsx 핵심 패턴

### 비용 추적
```typescript
const costRef = useRef<CostBreakdown>({...});
const addCost = (type: 'image' | 'tts' | 'video', amount: number, count: number) => {...};
// setCurrentCost 호출은 업데이트 후 한 번만 — 생성 중 불필요한 리렌더 방지
```

### 중복 실행 & 중단 방지
```typescript
const isProcessingRef = useRef(false);  // 동시 실행 방지
const isAbortedRef = useRef(false);     // 사용자 중단 신호
// 생성 루프 안에서: if (isAbortedRef.current) break;
```

### 병렬 처리
```typescript
await Promise.all([runAudio(), runImages()]);
```

### 재시도 & 폴백 로직
- 이미지/TTS 실패 시 최대 2회 재시도 (지수 백오프: 5초 기본)
- Rate Limit(429) 에러 시 대기 후 재시도
- 모든 재시도 실패 시 폴백 (ElevenLabs → Gemini TTS)

### 참조 이미지 처리
- `hasCharacterRef`가 true면 고정 캐릭터 프롬프트(`VAR_BASE_CHAR`) 제외
- 참조 이미지의 캐릭터를 따르도록 프롬프트 조정

## 프롬프트 시스템 (`prompts.ts`)

V10.0 "문장→이미지 자동 생성 시스템" 핵심 원칙:

1. **의미 기반 시각화** — 문장의 의미를 그대로 시각화
2. **수식어 반영** — 형용사/부사를 시각에 반영 ("거대한" → 크게)
3. **캐릭터 등장 규칙**:
   - NO_CHAR: 주어가 수치/데이터/추상 ("GDP가 상승", "시장이 과열")
   - STANDARD/MICRO/MACRO: 주어가 사람 ("투자자가 고민")
4. **구도 시스템**:
   - MICRO (5-15%): 작은 졸라맨 + 큰 사물
   - STANDARD (30-40%): 졸라맨과 사물 상호작용
   - MACRO (60-80%): 졸라맨 클로즈업
   - NO_CHAR: 캐릭터 없음
5. **한국 금융 색상** — 상승=빨강, 하락=파랑 (미국과 반대)
6. **고유명사 표시** — 대본에 쓰인 언어 그대로 (삼성→삼성, NVIDIA→NVIDIA)

**시스템 프롬프트 3종**:
- `CHIEF_ART_DIRECTOR` — 기본 토픽→이미지 변환
- `MANUAL_VISUAL_MATCHER` — 사용자 스크립트 그대로 유지
- `REFERENCE_MATCH` — 참조 이미지 스타일 준수

## VideoWorkflow 5단계 파이프라인 (`components/VideoWorkflow.tsx`)

YouTube 영상 클리핑 전용 독립 워크플로우. `Step` 타입: `source → transcript → clips → edit → export`

```
1. source    — YouTube URL 입력 → /api/youtube/download-stream (SSE, yt-dlp)
               → 다운로드 진행률 실시간 표시 → /tmp/tubegen/{id}_{title}.mp4 저장
               → SRT 파일 자동 감지 (ko/en 자막 병행 다운로드)
2. transcript — SRT 파일 선택 또는 직접 붙여넣기 → parseSrt() 로 SrtEntry[] 파싱
3. clips      — /api/youtube/clipper-analyze → Claude AI가 추천 클립 목록 생성
               → 사용자가 클립 구간 선택/편집
4. edit       — 클립별 자막 편집, SubStyle 커스터마이징
               (fontSize, fontColor, bgColor, bgOpacity, position, bold)
5. export     — /api/youtube/clip (구간 추출) → /api/youtube/burn-subtitles (FFmpeg 자막 소각)
               → 완성 파일: public/clips/{name}.mp4 → /api/media/serve 로 스트리밍 재생
```

**SRT 유틸리티 (컴포넌트 내부)**: `parseSrt()`, `timeToSec()`, `secToStr()`, `fmtSec()` — 외부 라이브러리 없이 자체 구현.

**`/api/media/serve`**: `ALLOWED_DIRS` = `/tmp/tubegen` + `public/` 로 경로 제한. 비디오/오디오는 Range 헤더 지원(206 응답).

**`/api/youtube/burn-subtitles`**: SRT를 임시 파일로 저장 → FFmpeg `subtitles` 필터 + `force_style` (ASS 색상: `&HAABBGGRR` 역순). 출력: `public/clips/`.

## 오디오 처리 (`videoService.ts`)

두 가지 오디오 포맷을 try-catch로 구분:
1. **MP3 (ElevenLabs)**: `AudioContext.decodeAudioData()`로 디코딩
2. **Raw PCM (Gemini TTS)**: `Int16Array` 수동 파싱 (24kHz, 16-bit)
   — MP3 디코드 실패 시 PCM으로 폴백

## Gemini 토큰 예산

```typescript
// 짧은 입력도 최소 16,384 토큰 보장 (잘림 방지)
// 최대 65,536 토큰 (비용/지연 상한)
const maxOutputTokens = Math.min(65536, Math.max(16384, calculatedTokens));
```

응답이 잘려도 깊이 추적 파서로 부분 JSON 복구.

## Claude Code 스킬 (`.claude/skills/`)

등록된 스킬 3종 — Claude Code가 자동 로드:

| 스킬 디렉토리 | 설명 |
|---|---|
| `claude-youtube-main` | YouTube 크리에이터 어시스턴트 (14개 서브스킬: audit, seo, script, hook 등) |
| `youtube-data` | TranscriptAPI.com 경유 YouTube 구조화 데이터 조회 (검색, 채널, 플레이리스트) |
| `transcript` | YouTube 영상 자막/스크립트 추출 (타임스탬프 포함) |

### TranscriptAPI.com 인증 (`TRANSCRIPT_API_KEY`)

- 모든 요청 헤더: `Authorization: Bearer $TRANSCRIPT_API_KEY` + `User-Agent: ClaudeCode/1.0`
- 키 형식: `sk_` 로 시작; 무료 100크레딧 (transcript 1cr, search 1cr, channel resolve FREE)
- **키 발급**: POST `/api/auth/register-cli` `{email}` → access_token; POST `/api/auth/verify-cli` Bearer + `{otp}` → api_key
- **보안**: HTTP 응답을 임시 파일에 저장 후 `api_key` 읽기 — 런타임이 `sk_` 값을 터미널에서 redact함
- 키 저장 위치: `.env.local` (셸 프로파일 변경은 현재 세션에 미적용)
- 상세 인증 흐름: `skills/youtube-skills-main/skills/transcript/references/auth-setup.md`

## 주의사항

- **참조 이미지** — 있으면 고정 캐릭터 프롬프트(`VAR_BASE_CHAR`) 제외
- **ElevenLabs 타임스탬프** — `with-timestamps` 엔드포인트; 문자 단위→단어 단위 변환 (손실 있음)
- **영상 변환** — 수동 버튼 클릭 방식 (자동 변환 비활성화)
- **긴 대본** — 3000자 초과 시 `generateScriptChunked()`로 청크 분할 (2500자/청크); 씬 번호 자동 보정
- **TTS Rate Limit** — 씬 간 1.5초 딜레이, 실패 시 3초 대기 후 재시도
- **자막 시스템** — AI 의미 청크(22자 max) 우선, 단어별 폴백; 연속 청크 간 gap 제거
- **프로젝트 저장** — IndexedDB 사용; 시크릿 모드에서 silent reject 가능 (폴백 없음)
- **썸네일** — 첫 이미지 200px 리사이즈, JPEG quality 0.7
- **엑셀 내보내기** — 이미지 16:9 비율(200x112px)로 셀에 삽입
- **안전 필터** — `sanitizePrompt()`로 민감 키워드 대체 (x-ray → transparent, bomb → impact 등 15종)
- **motion 프롬프트** — `visualPrompt.slice(0, 200)` 고정 (200자 상한)
- **VideoWorkflow 파일 캐시** — `/tmp/tubegen/{videoId}_*.mp4` 존재 시 재다운로드 건너뜀
- **자막 소각 경로 이스케이프** — FFmpeg SRT 경로의 `\`, `:`, `'` 문자 수동 이스케이프 필수 (특히 Windows 경로)
- **SSE 스트리밍** — `download-stream` 응답은 `Content-Type: text/event-stream`; 브라우저에서 `EventSource` 대신 `fetch` + `ReadableStream`으로 소비
