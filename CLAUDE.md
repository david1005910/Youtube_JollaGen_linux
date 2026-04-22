# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

**TubeGen AI** - AI 기반 스토리보드 & 영상 자동 생성 앱

주요 기능:
- 키워드/대본 입력 → AI가 자동으로 스토리보드 생성
- 씬별 이미지 생성 (Gemini 2.5 Flash Image)
- TTS 음성 생성 (ElevenLabs + 타임스탬프 자막)
- 이미지→영상 애니메이션 변환 (fal.ai PixVerse v5.5)
- MP4 렌더링 및 내보내기
- 엑셀 스토리보드 내보내기 (이미지 포함)

## 개발 명령어

```bash
npm install       # 의존성 설치
npm run dev       # 개발 서버 실행 (포트 3000)
npm run build     # 프로덕션 빌드
npm run start     # 빌드 결과 실행
```

**참고:** 테스트/린트 스크립트 없음

## 환경 변수 설정

`.env.local` 파일에 API 키 설정 (서버 사이드 전용 — 클라이언트에 절대 노출 안 됨):
```
GEMINI_API_KEY=your_gemini_api_key
FAL_API_KEY=your_fal_api_key
ELEVENLABS_API_KEY=your_elevenlabs_key
ELEVENLABS_VOICE_ID=your_voice_id   # 선택적
```

`NEXT_PUBLIC_` 접두사 없는 변수는 서버에서만 접근 가능.

## Vercel 배포

```bash
vercel deploy   # Vercel CLI 배포
```
Vercel 대시보드에서 환경변수 설정 후 배포. `vercel.json`에 API 라우트 타임아웃 300초 설정됨.
Vercel Pro 필요 사항: 긴 대본 처리(`/api/gemini/script-chunked`), 레퍼런스 이미지 10MB 초과 시.

## 기술 스택

- **프레임워크**: Next.js 15 (App Router) + React 19 + TypeScript 5.8
- **Path alias**: `@` → 프로젝트 루트
- **스타일링**: Tailwind CSS (CDN — `app/layout.tsx` head에 포함)
- **AI 서비스**:
  - Google Gemini API (`@google/genai`) — 스크립트 생성, 이미지 생성, TTS 폴백
  - fal.ai — PixVerse v5.5 영상 변환
  - ElevenLabs — 고품질 TTS + 타임스탬프 자막
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
│       └── fal/video/route.ts
├── App.tsx               # 메인 앱 ('use client', import from apiClient)
├── types.ts              # TypeScript 인터페이스
├── config.ts             # 전역 설정 (모델, 가격, 스타일)
├── components/           # 모두 'use client' 컴포넌트
├── services/
│   ├── apiClient.ts      # 클라이언트→/api/* 래퍼 (브라우저에서 호출)
│   ├── imageConfig.ts    # localStorage 기반 이미지/스타일 설정 (클라이언트 전용)
│   ├── geminiService.ts  # Gemini SDK (서버 API 라우트에서만 import)
│   ├── elevenLabsService.ts # ElevenLabs (서버 API 라우트에서만 import)
│   ├── falService.ts     # fal.ai (서버 API 라우트에서만 import)
│   ├── videoService.ts   # Canvas MP4 렌더링 (브라우저 전용)
│   ├── projectService.ts # IndexedDB (브라우저 전용)
│   ├── prompts.ts        # V10.0 프롬프트 엔진
│   ├── srtService.ts     # SRT 자막 생성
│   └── exportService.ts  # 엑셀 내보내기
└── utils/
    └── csvHelper.ts
```

**핵심 구분:**
- **서버 전용**: `services/{geminiService,elevenLabsService,falService}.ts` — API 라우트에서만 import
- **클라이언트 전용**: `services/{videoService,projectService,exportService,srtService}.ts` — 브라우저 API 사용
- **공유**: `services/apiClient.ts` — 브라우저에서 `/api/*` 호출, `services/imageConfig.ts` — localStorage 읽기

## 아키텍처

### 데이터 흐름
```
사용자 입력 (키워드/대본)
    ↓
[geminiService] 트렌드 검색 → 스크립트 생성 (씬 분할)
                └── 긴 대본(3000자+) → generateScriptChunked()로 청크 분할 처리
    ↓
[imageService] 씬별 이미지 생성 (Gemini 라우팅)   ← Promise.all로 audio와 병렬 실행
[elevenLabsService] 나레이션 TTS + 자막 타임스탬프  ↗
    ↓
[falService] 이미지→영상 애니메이션 변환 (수동 버튼 방식)
    ↓
[videoService] MP4 렌더링 및 내보내기 (자막 하드코딩 옵션)
```

### 핵심 서비스

| 파일 | 역할 |
|------|------|
| `geminiService.ts` | Gemini API 통합 — 트렌드 검색, 스크립트 생성, 이미지 생성, TTS 폴백, 키워드 정화(sanitizePrompt) |
| `elevenLabsService.ts` | ElevenLabs TTS + 단어별 타임스탬프, AI 의미 단위 청크 생성 |
| `prompts.ts` | V10.0 프롬프트 엔진 — 의미 기반 시각화, 구도 시스템, 색상 규칙 |
| `videoService.ts` | Canvas 2D 기반 MP4 렌더링 (자막 하드코딩, 레이지 로딩) |
| `projectService.ts` | IndexedDB 저장 (DB: 'TubeGenAI'), 썸네일 생성, localStorage 마이그레이션 |
| `imageService.ts` | 이미지 생성 라우터 — 참조 이미지(캐릭터/스타일 분리) 처리 |

### 주요 타입 (`types.ts`)

- `ScriptScene` — 씬 데이터 (narration, visualPrompt, analysis)
- `GeneratedAsset` — 생성된 에셋 (이미지, 오디오, 자막, 영상, status)
- `ReferenceImages` — 참조 이미지 (캐릭터/스타일 분리, 강도 0~100, 최대 각 2장)
- `SubtitleData` — 자막 (단어별 타임스탬프 + meaningChunks)
- `SceneAnalysis` — 구도(MICRO/STANDARD/MACRO/NO_CHAR), color_plan, motion

### 설정 (`config.ts`)

- `IMAGE_MODELS` — 이미지 생성 모델 (Gemini 2.5 Flash)
- `GEMINI_STYLE_CATEGORIES` — 화풍 프리셋 (크레용, 한국 경제 카툰, 수채화, 커스텀, 없음)
- `ELEVENLABS_MODELS` / `ELEVENLABS_DEFAULT_VOICES` — TTS 모델/음성 목록
- `PRICING` — API 가격 (이미지 $0.0315, TTS $0.00003/char, 영상 $0.15; USD→KRW 1450 고정)
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
