'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import Header from './components/Header';
import MainStudio from './components/MainStudio';
import ResultTable from './components/ResultTable';
import { GeneratedAsset, GenerationStep, ScriptScene, CostBreakdown, ReferenceImages, DEFAULT_REFERENCE_IMAGES } from './types';
import {
  generateScript, generateScriptChunked, findTrendingTopics,
  generateAudioForScene, generateMotionPrompt,
  generateImage,
  generateAudioWithElevenLabs,
  generateVideoFromImage,
} from './services/apiClient';
import { getSelectedImageModel } from './services/imageConfig';
import { generateVideo, VideoGenerationResult } from './services/videoService';
import { downloadSrtFromRecorded } from './services/srtService';
import { saveProject, getSavedProjects, deleteProject, migrateFromLocalStorage } from './services/projectService';
import { SavedProject } from './types';
import { CONFIG, PRICING, formatKRW } from './config';
import ProjectGallery from './components/ProjectGallery';
import YouTubeSkillChat from './components/YouTubeSkillChat';
import RemotionPreview from './components/RemotionPreview';
import YouTubeClipperChat from './components/YouTubeClipperChat';
import * as FileSaver from 'file-saver';

const saveAs = (FileSaver as any).saveAs || (FileSaver as any).default || FileSaver;
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function cleanErrorMessage(error: any): string {
  const msg: string = error?.message || String(error);
  if (msg.includes('할당량 초과') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota') || msg.includes('429')) {
    return 'API 할당량 초과. 하단의 "💳 유료 키 설정" 버튼으로 유료 키를 등록하면 계속 사용할 수 있습니다.';
  }
  if (msg.includes('API 키') || msg.includes('permission') || msg.includes('PERMISSION')) {
    return 'API 키 권한 오류. 설정을 확인해주세요.';
  }
  // JSON 문자열이면 파싱해서 message 추출
  if (msg.startsWith('{') || msg.startsWith('[')) {
    try {
      const parsed = JSON.parse(msg);
      const inner = parsed?.error?.message || parsed?.message || parsed?.detail?.message;
      return inner ? cleanErrorMessage({ message: inner }) : msg.slice(0, 100);
    } catch {}
  }
  return msg.length > 150 ? msg.slice(0, 150) + '...' : msg;
}

type ViewMode = 'main' | 'gallery';


const App: React.FC = () => {
  const [step, setStep] = useState<GenerationStep>(GenerationStep.IDLE);
  const [generatedData, setGeneratedData] = useState<GeneratedAsset[]>([]);
  const [progressMessage, setProgressMessage] = useState('');
  const [isVideoGenerating, setIsVideoGenerating] = useState(false);
  // 참조 이미지 상태 (강도 포함)
  const [currentReferenceImages, setCurrentReferenceImages] = useState<ReferenceImages>(DEFAULT_REFERENCE_IMAGES);
  const [needsKey, setNeedsKey] = useState(false);
  const [animatingIndices, setAnimatingIndices] = useState<Set<number>>(new Set());

  // 갤러리 뷰 관련
  const [viewMode, setViewMode] = useState<ViewMode>('main');
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [currentTopic, setCurrentTopic] = useState<string>('');
  const [showYoutubeSkills, setShowYoutubeSkills] = useState(false);
  const [showRemotionPreview, setShowRemotionPreview] = useState(false);
  const [showClipper, setShowClipper] = useState(false);

  // 비용 추적
  const [currentCost, setCurrentCost] = useState<CostBreakdown | null>(null);
  const costRef = useRef<CostBreakdown>({
    images: 0, tts: 0, videos: 0, total: 0,
    imageCount: 0, ttsCharacters: 0, videoCount: 0
  });

  const usedTopicsRef = useRef<string[]>([]);
  const assetsRef = useRef<GeneratedAsset[]>([]);
  const isAbortedRef = useRef(false);
  const isProcessingRef = useRef(false);

  const checkApiKeyStatus = useCallback(async () => {
    if ((window as any).aistudio) {
      const hasKey = await (window as any).aistudio.hasSelectedApiKey();
      setNeedsKey(!hasKey);
      return hasKey;
    }
    return true;
  }, []);

  useEffect(() => {
    checkApiKeyStatus();
    // localStorage → IndexedDB 마이그레이션 및 프로젝트 로드
    (async () => {
      await migrateFromLocalStorage(); // 기존 데이터 이전
      const projects = await getSavedProjects();
      setSavedProjects(projects);
    })();
    return () => { isAbortedRef.current = true; };
  }, [checkApiKeyStatus]);

  // 프로젝트 목록 새로고침
  const refreshProjects = useCallback(async () => {
    const projects = await getSavedProjects();
    setSavedProjects(projects);
  }, []);

  const handleOpenKeySelector = async () => {
    if ((window as any).aistudio) {
      await (window as any).aistudio.openSelectKey();
      setNeedsKey(false);
    }
  };

  const updateAssetAt = (index: number, updates: Partial<GeneratedAsset>) => {
    if (isAbortedRef.current) return;
    if (assetsRef.current[index]) {
      assetsRef.current[index] = { ...assetsRef.current[index], ...updates };
      setGeneratedData([...assetsRef.current]);
    }
  };

  // 비용 추가 헬퍼
  const addCost = (type: 'image' | 'tts' | 'video', amount: number, count: number = 1) => {
    if (type === 'image') {
      costRef.current.images += amount;
      costRef.current.imageCount += count;
    } else if (type === 'tts') {
      costRef.current.tts += amount;
      costRef.current.ttsCharacters += count;
    } else if (type === 'video') {
      costRef.current.videos += amount;
      costRef.current.videoCount += count;
    }
    costRef.current.total = costRef.current.images + costRef.current.tts + costRef.current.videos;
    setCurrentCost({ ...costRef.current });
  };

  // 비용 초기화
  const resetCost = () => {
    costRef.current = {
      images: 0, tts: 0, videos: 0, total: 0,
      imageCount: 0, ttsCharacters: 0, videoCount: 0
    };
    setCurrentCost(null);
  };

  const handleAbort = () => {
    isAbortedRef.current = true;
    isProcessingRef.current = false;
    setProgressMessage("🛑 작업 중단됨.");
    setStep(GenerationStep.COMPLETED);
  };

  const handleGenerate = useCallback(async (
    topic: string,
    refImgs: ReferenceImages,
    sourceText: string | null,
    previewedScenes?: ScriptScene[]
  ) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    isAbortedRef.current = false;

    setStep(GenerationStep.SCRIPTING);
    setProgressMessage('V9.2 Ultra 엔진 부팅 중...');

    try {
      const hasKey = await checkApiKeyStatus();
      if (!hasKey && (window as any).aistudio) {
        await (window as any).aistudio.openSelectKey();
      }

      setGeneratedData([]);
      assetsRef.current = [];
      setCurrentReferenceImages(refImgs);
      setCurrentTopic(topic); // 저장용 토픽 기록
      resetCost(); // 비용 초기화

      // 참조 이미지 존재 여부 계산
      const hasRefImages = (refImgs.character?.length || 0) + (refImgs.style?.length || 0) > 0;
      console.log(`[App] 참조 이미지 - 캐릭터: ${refImgs.character?.length || 0}개, 스타일: ${refImgs.style?.length || 0}개`);

      let targetTopic = topic;

      if (topic === "Manual Script Input" && sourceText) {
        setProgressMessage('대본 분석 및 시각화 설계 중...');
      } else if (sourceText) {
        setProgressMessage('외부 콘텐츠 분석 중...');
        targetTopic = "Custom Analysis Topic";
      } else {
        // 사용자가 입력한 키워드를 그대로 사용 (AI가 다른 토픽으로 대체하지 않음)
        setProgressMessage(`"${topic}" 스토리보드 생성 중...`);
      }

      // 긴 대본(3000자 초과) 감지 시 청크 분할 처리
      const inputLength = sourceText?.length || 0;
      const CHUNK_THRESHOLD = 3000;

      let scriptScenes: ScriptScene[];
      if (previewedScenes && previewedScenes.length > 0) {
        // MainStudio에서 미리 생성된 씬 사용 — Gemini 호출 생략
        setProgressMessage('미리 생성된 스크립트 사용 중...');
        scriptScenes = previewedScenes;
      } else if (inputLength > CHUNK_THRESHOLD) {
        setProgressMessage(`스토리보드 및 메타포 생성 중...`);
        console.log(`[App] 긴 대본 감지: ${inputLength.toLocaleString()}자 → 청크 분할 처리`);
        setProgressMessage(`긴 대본(${inputLength.toLocaleString()}자) 청크 분할 처리 중...`);
        scriptScenes = await generateScriptChunked(
          targetTopic,
          hasRefImages,
          sourceText!,
          2500,
          setProgressMessage
        );
      } else {
        setProgressMessage(`스토리보드 및 메타포 생성 중...`);
        scriptScenes = await generateScript(targetTopic, hasRefImages, sourceText);
      }
      if (isAbortedRef.current) return;
      
      const initialAssets = scriptScenes.map(scene => ({
        ...scene, imageData: null, audioData: null, audioDuration: null, subtitleData: null, videoData: null, videoDuration: null, status: 'pending' as const
      }));
      assetsRef.current = initialAssets;
      setGeneratedData(initialAssets);
      setStep(GenerationStep.ASSETS);

      const runAudio = async () => {
          const TTS_DELAY = 1500; // ElevenLabs API Rate Limit 대응: 1.5초 딜레이
          const MAX_TTS_RETRIES = 2; // 최대 재시도 횟수

          for (let i = 0; i < initialAssets.length; i++) {
              if (isAbortedRef.current) break;

              setProgressMessage(`씬 ${i + 1}/${initialAssets.length} 음성 생성 중...`);
              let success = false;

              // 재시도 로직
              for (let attempt = 0; attempt <= MAX_TTS_RETRIES && !success; attempt++) {
                  if (isAbortedRef.current) break;

                  try {
                      if (attempt > 0) {
                          console.log(`[TTS] 씬 ${i + 1} 재시도 중... (${attempt}/${MAX_TTS_RETRIES})`);
                          await wait(3000); // 재시도 시 3초 대기
                      }

                      // ElevenLabs에서 오디오 + 자막 타임스탬프 동시 획득
                      const elResult = await generateAudioWithElevenLabs(
                        assetsRef.current[i].narration
                      );
                      if (isAbortedRef.current) break;

                      if (elResult.audioData) {
                        // ElevenLabs 성공: 오디오 + 자막 + 길이 데이터 저장
                        updateAssetAt(i, {
                          audioData: elResult.audioData,
                          subtitleData: elResult.subtitleData,
                          audioDuration: elResult.estimatedDuration
                        });
                        // TTS 비용 추가
                        const charCount = assetsRef.current[i].narration.length;
                        addCost('tts', charCount * PRICING.TTS.perCharacter, charCount);
                        success = true;
                        console.log(`[TTS] 씬 ${i + 1} 음성 생성 완료`);
                      } else {
                        throw new Error('ElevenLabs 응답 없음');
                      }
                  } catch (e: any) {
                      console.warn(`[TTS] 씬 ${i + 1} 실패 (시도 ${attempt + 1}):`, e.message);

                      // Rate Limit 에러인 경우 더 긴 대기
                      if (e.message?.includes('429') || e.message?.includes('rate')) {
                          await wait(5000); // 5초 대기 후 재시도
                      }
                  }
              }

              // 모든 재시도 실패 시 Gemini 폴백
              if (!success && !isAbortedRef.current) {
                  try {
                      console.log(`[TTS] 씬 ${i + 1} Gemini 폴백 시도...`);
                      const fallbackAudio = await generateAudioForScene(assetsRef.current[i].narration);
                      updateAssetAt(i, { audioData: fallbackAudio });
                  } catch (fallbackError) {
                      console.warn(`[TTS] 씬 ${i + 1} Gemini 폴백도 실패:`, fallbackError);
                  }
              }

              // 다음 씬 전에 딜레이 (Rate Limit 방지)
              if (i < initialAssets.length - 1 && !isAbortedRef.current) {
                  await wait(TTS_DELAY);
              }
          }
      };

      const runImages = async () => {
          const MAX_RETRIES = 2;
          const IMAGE_DELAY = 6000; // Gemini 이미지 RPM 제한 대응: 씬 간 6초 딜레이
          const imageModel = getSelectedImageModel();
          const imagePrice = PRICING.IMAGE[imageModel as keyof typeof PRICING.IMAGE] || 0.01;

          for (let i = 0; i < initialAssets.length; i++) {
              if (isAbortedRef.current) break;
              updateAssetAt(i, { status: 'generating' });

              let success = false;
              let lastError: any = null;

              for (let attempt = 0; attempt <= MAX_RETRIES && !success; attempt++) {
                  if (isAbortedRef.current) break;

                  try {
                      if (attempt > 0) {
                          setProgressMessage(`씬 ${i + 1} 이미지 재생성 시도 중... (${attempt}/${MAX_RETRIES})`);
                          await wait(10000); // 재시도 시 10초 대기 (할당량 회복)
                      }

                      const img = await generateImage(assetsRef.current[i], refImgs);
                      if (isAbortedRef.current) break;

                      if (img) {
                          updateAssetAt(i, { imageData: img, status: 'completed' });
                          addCost('image', imagePrice, 1);
                          success = true;
                      } else {
                          throw new Error('이미지 데이터가 비어있습니다');
                      }
                  } catch (e: any) {
                      lastError = e;
                      console.warn(`씬 ${i + 1} 이미지 생성 실패 (시도 ${attempt + 1}/${MAX_RETRIES + 1}):`, e.message);

                      // API 키 오류는 재시도하지 않음
                      if (e.message?.includes("API key not valid") || e.status === 400) {
                          setNeedsKey(true);
                          break;
                      }

                      // 할당량 초과 시 추가 대기
                      const isQuota = e.message?.includes('할당량') || e.message?.includes('quota') ||
                        e.message?.includes('RESOURCE_EXHAUSTED') || e.message?.includes('429');
                      if (isQuota && attempt < MAX_RETRIES) {
                          setProgressMessage(`씬 ${i + 1} API 할당량 초과 — 20초 대기 후 재시도...`);
                          await wait(20000);
                      }
                  }
              }

              if (!success && !isAbortedRef.current) {
                  updateAssetAt(i, { status: 'error' });
                  console.warn(`씬 ${i + 1} 이미지 생성 최종 실패:`, lastError?.message);
              }

              // 다음 씬 전에 딜레이 (Gemini 이미지 RPM 제한 방지)
              if (i < initialAssets.length - 1 && !isAbortedRef.current) {
                  await wait(IMAGE_DELAY);
              }
          }
      };

      // 앞 N개 씬을 애니메이션으로 변환하는 함수
      const runAnimations = async () => {
        const animationCount = Math.min(CONFIG.ANIMATION.ENABLED_SCENES, initialAssets.length);
        setProgressMessage(`앞 ${animationCount}개 씬 애니메이션 변환 중...`);

        for (let i = 0; i < animationCount; i++) {
          if (isAbortedRef.current) break;

          // 이미지가 있어야 변환 가능
          if (!assetsRef.current[i]?.imageData) {
            console.log(`[Animation] 씬 ${i + 1} 이미지 없음, 건너뜀`);
            continue;
          }

          try {
            setProgressMessage(`씬 ${i + 1}/${animationCount} 애니메이션 생성 중...`);

            // 시각적 프롬프트에서 움직임 힌트 추출
            const motionPrompt = `Gentle subtle motion: ${assetsRef.current[i].visualPrompt.slice(0, 200)}`;

            const videoUrl = await generateVideoFromImage(
              assetsRef.current[i].imageData!,
              motionPrompt
            );

            if (videoUrl && !isAbortedRef.current) {
              updateAssetAt(i, {
                videoData: videoUrl,
                videoDuration: CONFIG.ANIMATION.VIDEO_DURATION
              });
              console.log(`[Animation] 씬 ${i + 1} 영상 변환 완료`);
            }
          } catch (e: any) {
            console.warn(`[Animation] 씬 ${i + 1} 변환 실패:`, e.message);
          }

          // API rate limit 방지
          if (i < animationCount - 1) {
            await wait(1500);
          }
        }
      };

      setProgressMessage(`시각 에셋 및 오디오 합성 중...`);
      // 이미지와 오디오 먼저 병렬 생성
      await Promise.all([runAudio(), runImages()]);

      // 애니메이션 변환은 이제 수동으로 (이미지 호버 시 버튼 클릭)
      // 자동 변환 비활성화 - 사용자가 원하는 이미지만 선택적으로 변환 가능
      
      if (isAbortedRef.current) return;
      setStep(GenerationStep.COMPLETED);

      // 비용 요약 메시지 (원화)
      const cost = costRef.current;
      const costMsg = `이미지 ${cost.imageCount}장 ${formatKRW(cost.images)} + TTS ${cost.ttsCharacters}자 ${formatKRW(cost.tts)} = 총 ${formatKRW(cost.total)}`;
      setProgressMessage(`생성 완료! ${costMsg}`);

      // 자동 저장 (비용 정보 포함)
      try {
        const savedProject = await saveProject(targetTopic, assetsRef.current, undefined, costRef.current);
        refreshProjects();
        setProgressMessage(`"${savedProject.name}" 저장됨 | ${costMsg}`);
      } catch (e) {
        console.warn('프로젝트 자동 저장 실패:', e);
      }

    } catch (error: any) {
      if (!isAbortedRef.current) {
        setStep(GenerationStep.ERROR);
        setProgressMessage(`❌ ${cleanErrorMessage(error)}`);
      }
    } finally {
      isProcessingRef.current = false;
    }
  }, [checkApiKeyStatus, refreshProjects]);

  // 이미지 재생성 핸들러 (useCallback으로 메모이제이션)
  const handleRegenerateImage = useCallback(async (idx: number) => {
    if (isProcessingRef.current) return;

    const MAX_RETRIES = 2;
    updateAssetAt(idx, { status: 'generating' });
    setProgressMessage(`씬 ${idx + 1} 이미지 재생성 중...`);

    let success = false;

    for (let attempt = 0; attempt <= MAX_RETRIES && !success; attempt++) {
      if (isAbortedRef.current) break;

      try {
        if (attempt > 0) {
          setProgressMessage(`씬 ${idx + 1} 이미지 재생성 재시도 중... (${attempt}/${MAX_RETRIES})`);
          await wait(2000);
        }

        const img = await generateImage(assetsRef.current[idx], currentReferenceImages);

        if (img && !isAbortedRef.current) {
          updateAssetAt(idx, { imageData: img, status: 'completed' });
          // 이미지 비용 추가
          const imageModel = getSelectedImageModel();
          const imagePrice = PRICING.IMAGE[imageModel as keyof typeof PRICING.IMAGE] || 0.01;
          addCost('image', imagePrice, 1);
          setProgressMessage(`씬 ${idx + 1} 이미지 재생성 완료! (+${formatKRW(imagePrice)})`);
          success = true;
        } else if (!img) {
          throw new Error('이미지 데이터가 비어있습니다');
        }
      } catch (e: any) {
        console.warn(`씬 ${idx + 1} 재생성 실패 (시도 ${attempt + 1}/${MAX_RETRIES + 1}):`, e.message);

        if (e.message?.includes("API key not valid") || e.status === 400) {
          setNeedsKey(true);
          break;
        }
      }
    }

    if (!success && !isAbortedRef.current) {
      updateAssetAt(idx, { status: 'error' });
      setProgressMessage(`씬 ${idx + 1} 이미지 생성 실패. 다시 시도해주세요.`);
    }
  }, [currentReferenceImages]);

  // 애니메이션 생성 핸들러 (useCallback으로 메모이제이션)
  const handleGenerateAnimation = useCallback(async (idx: number) => {
    if (animatingIndices.has(idx)) return; // 이 씬은 이미 변환 중
    if (!assetsRef.current[idx]?.imageData) {
      alert('이미지가 먼저 생성되어야 합니다.');
      return;
    }

    try {
      // Set에 현재 인덱스 추가
      setAnimatingIndices(prev => new Set(prev).add(idx));
      setProgressMessage(`씬 ${idx + 1} 움직임 분석 중...`);

      // AI가 대본과 이미지를 분석해서 움직임 프롬프트 생성
      const motionPrompt = await generateMotionPrompt(
        assetsRef.current[idx].narration,
        assetsRef.current[idx].visualPrompt
      );

      setProgressMessage(`씬 ${idx + 1} 영상 변환 중...`);
      const videoUrl = await generateVideoFromImage(
        assetsRef.current[idx].imageData!,
        motionPrompt
      );

      if (videoUrl) {
        updateAssetAt(idx, {
          videoData: videoUrl,
          videoDuration: CONFIG.ANIMATION.VIDEO_DURATION
        });
        // 영상 비용 추가
        addCost('video', PRICING.VIDEO.perVideo, 1);
        setProgressMessage(`씬 ${idx + 1} 영상 변환 완료! (+${formatKRW(PRICING.VIDEO.perVideo)})`);
      } else {
        setProgressMessage(`씬 ${idx + 1} 영상 변환 실패`);
      }
    } catch (e: any) {
      console.warn('영상 변환 실패:', e);
      setProgressMessage(`❌ 씬 ${idx + 1} 오류: ${cleanErrorMessage(e)}`);
    } finally {
      // Set에서 현재 인덱스 제거
      setAnimatingIndices(prev => {
        const next = new Set(prev);
        next.delete(idx);
        return next;
      });
    }
  }, [animatingIndices]);

  const triggerVideoExport = async (enableSubtitles: boolean = true) => {
    if (isVideoGenerating) return;
    try {
      setIsVideoGenerating(true);
      const suffix = enableSubtitles ? 'sub' : 'nosub';
      const timestamp = Date.now();

      const result = await generateVideo(
        assetsRef.current,
        (msg) => setProgressMessage(`[Render] ${msg}`),
        isAbortedRef,
        { enableSubtitles }
      );

      if (result) {
        // 영상 저장 (자막은 영상에 하드코딩됨)
        saveAs(result.videoBlob, `tubegen_v92_${suffix}_${timestamp}.mp4`);
        setProgressMessage(`✨ MP4 렌더링 완료! (${enableSubtitles ? '자막 O' : '자막 X'})`);
      }
    } catch (error: any) {
      setProgressMessage(`❌ 렌더링 실패: ${cleanErrorMessage(error)}`);
    } finally {
      setIsVideoGenerating(false);
    }
  };

  // 프로젝트 삭제 핸들러
  const handleDeleteProject = async (id: string) => {
    await deleteProject(id);
    await refreshProjects();
  };

  // 프로젝트 불러오기 핸들러
  const handleLoadProject = (project: SavedProject) => {
    // 저장된 에셋을 현재 상태로 로드
    assetsRef.current = project.assets;
    setGeneratedData([...project.assets]);
    setCurrentTopic(project.topic);
    setStep(GenerationStep.COMPLETED);
    setProgressMessage(`"${project.name}" 프로젝트 불러옴`);
    setViewMode('main'); // 메인 뷰로 전환
  };

  /* ── Glassmorphism — palette constants ────────────────────────────────── */
  const GL = {
    purple:      '#8B5CF6',
    violet:      '#7C3AED',
    blue:        '#3B82F6',
    cyan:        '#06B6D4',
    pink:        '#EC4899',
    rose:        '#F43F5E',
    teal:        '#14B8A6',
    glass:       'rgba(255,255,255,0.18)',
    glassBorder: 'rgba(255,255,255,0.35)',
    shadow:      '0px 4px 24px rgba(0,0,0,0.20)',
    innerGlow:   'inset 0px 0px 12px rgba(255,255,255,0.15)',
  } as const;

  const glassPanel = {
    background:           GL.glass,
    backdropFilter:       'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border:               `1px solid ${GL.glassBorder}`,
    borderRadius:         20,
    boxShadow:            `${GL.innerGlow}, ${GL.shadow}`,
  } as const;

  return (
    <div
      className="min-h-screen"
      style={{
        /* Multi-tone abstract gradient backdrop — required for glass depth */
        background: '#0f0728',
        backgroundImage: [
          'radial-gradient(ellipse at 20% 15%, rgba(124,58,237,0.60) 0%, transparent 48%)',
          'radial-gradient(ellipse at 78% 22%, rgba(59,130,246,0.50) 0%, transparent 48%)',
          'radial-gradient(ellipse at 50% 88%, rgba(236,72,153,0.38) 0%, transparent 45%)',
          'radial-gradient(ellipse at 85% 65%, rgba(20,184,166,0.30) 0%, transparent 40%)',
        ].join(','),
        color: '#fff',
        position: 'relative',
      }}
    >
      <Header />

      {/* YouTube Skill Studio 모달 */}
      {showYoutubeSkills && (
        <YouTubeSkillChat onClose={() => setShowYoutubeSkills(false)} />
      )}

      {/* Remotion 영상 미리보기 모달 */}
      {showRemotionPreview && (
        <RemotionPreview
          assets={generatedData}
          onClose={() => setShowRemotionPreview(false)}
        />
      )}

      {/* YouTube Clipper 모달 */}
      {showClipper && (
        <YouTubeClipperChat onClose={() => setShowClipper(false)} />
      )}

      {/* 네비게이션 탭 — glass surface */}
      <div style={{
        background:           'rgba(255,255,255,0.10)',
        backdropFilter:       'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom:         '1px solid rgba(255,255,255,0.20)',
        position: 'relative', zIndex: 10,
      }}>
        <div className="max-w-7xl mx-auto px-4 flex items-center gap-1">
          <button
            onClick={() => setViewMode('main')}
            style={{
              padding: '12px 16px', fontSize: 14, fontWeight: 600,
              background: 'none', border: 'none', cursor: 'pointer',
              position: 'relative', transition: 'color 0.2s',
              color: viewMode === 'main' ? '#fff' : 'rgba(255,255,255,0.45)',
              textShadow: viewMode === 'main' ? '0px 1px 3px rgba(0,0,0,0.25)' : 'none',
              letterSpacing: '0.02em',
            }}
          >
            스토리보드 생성
            {viewMode === 'main' && (
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, height: 2,
                background: `linear-gradient(90deg, ${GL.cyan}, ${GL.purple})`,
                borderRadius: 2,
              }} />
            )}
          </button>

          <button
            onClick={() => setViewMode('gallery')}
            style={{
              padding: '12px 16px', fontSize: 14, fontWeight: 600,
              background: 'none', border: 'none', cursor: 'pointer',
              position: 'relative', display: 'flex', alignItems: 'center', gap: 8,
              transition: 'color 0.2s',
              color: viewMode === 'gallery' ? '#fff' : 'rgba(255,255,255,0.45)',
              textShadow: viewMode === 'gallery' ? '0px 1px 3px rgba(0,0,0,0.25)' : 'none',
              letterSpacing: '0.02em',
            }}
          >
            저장된 프로젝트
            {savedProjects.length > 0 && (
              <span style={{
                padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                background: 'rgba(255,255,255,0.18)',
                border: '1px solid rgba(255,255,255,0.35)',
                color: '#fff',
                textShadow: '0px 1px 3px rgba(0,0,0,0.25)',
              }}>
                {savedProjects.length}
              </span>
            )}
            {viewMode === 'gallery' && (
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, height: 2,
                background: `linear-gradient(90deg, ${GL.pink}, ${GL.purple})`,
                borderRadius: 2,
              }} />
            )}
          </button>

          {/* 버튼 그룹 */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', marginRight: 4, marginTop: 6, marginBottom: 6 }}>
            {/* Clipper 버튼 */}
            <button
              onClick={() => setShowClipper(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '8px 18px', borderRadius: 12,
                background: 'linear-gradient(135deg, rgba(20,184,166,0.65) 0%, rgba(59,130,246,0.55) 100%)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,255,255,0.35)',
                color: '#fff', fontSize: 13, fontWeight: 600,
                boxShadow: '0px 4px 24px rgba(0,0,0,0.20), inset 0px 0px 12px rgba(255,255,255,0.12)',
                letterSpacing: '0.02em',
                cursor: 'pointer', transition: 'opacity 0.2s',
                textShadow: '0px 1px 3px rgba(0,0,0,0.25)',
              }}
            >
              ✂️ Clipper
            </button>

            {/* YouTube Skill Studio 버튼 */}
            <button
              onClick={() => setShowYoutubeSkills(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 20px', borderRadius: 12,
                background: 'linear-gradient(135deg, rgba(139,92,246,0.65) 0%, rgba(236,72,153,0.55) 100%)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,255,255,0.35)',
                color: '#fff', fontSize: 14, fontWeight: 600,
                boxShadow: '0px 4px 24px rgba(0,0,0,0.20), inset 0px 0px 12px rgba(255,255,255,0.12)',
                letterSpacing: '0.03em',
                cursor: 'pointer', transition: 'box-shadow 0.2s',
                textShadow: '0px 1px 3px rgba(0,0,0,0.25)',
              }}
            >
              <span style={{ fontSize: 15 }}>▶</span>
              YouTube 스킬
            </button>
          </div>
        </div>
      </div>

      {needsKey && (
        <div style={{
          background:           'rgba(244,63,94,0.18)',
          backdropFilter:       'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom:         '1px solid rgba(255,255,255,0.25)',
          padding: '10px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
          position: 'relative', zIndex: 10,
        }}>
          <span style={{
            color: '#fda4af', fontSize: 13, fontWeight: 600,
            textShadow: '0px 1px 3px rgba(0,0,0,0.25)',
          }}>
            Gemini 3 Pro 엔진을 위해 API 키 설정이 필요합니다.
          </span>
          <button
            onClick={handleOpenKeySelector}
            style={{
              padding: '5px 14px', borderRadius: 10,
              background: 'rgba(255,255,255,0.22)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.40)',
              color: '#fff', fontSize: 10, fontWeight: 800,
              cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 3,
              boxShadow: `0px 4px 24px rgba(0,0,0,0.20)`,
              textShadow: '0px 1px 3px rgba(0,0,0,0.25)',
            }}
          >
            API 키 설정
          </button>
        </div>
      )}

      {/* 갤러리 뷰 */}
      {viewMode === 'gallery' && (
        <ProjectGallery
          projects={savedProjects}
          onBack={() => setViewMode('main')}
          onDelete={handleDeleteProject}
          onRefresh={refreshProjects}
          onLoad={handleLoadProject}
        />
      )}

      {/* 메인 뷰 */}
      {viewMode === 'main' && (
        <main style={{ paddingTop: 32, paddingBottom: 48, position: 'relative', zIndex: 1 }}>
          <MainStudio step={step} onStartFullGeneration={handleGenerate} />

          {step !== GenerationStep.IDLE && (
            <div style={{ maxWidth: 1280, margin: '0 auto 48px', padding: '0 16px', textAlign: 'center' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 16,
                padding: '12px 28px',
                ...glassPanel,
                borderRadius: 16,
              }}>
                {step === GenerationStep.SCRIPTING || step === GenerationStep.ASSETS ? (
                  <div style={{
                    width: 15, height: 15,
                    border: `2px solid rgba(255,255,255,0.80)`,
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'glSpin 0.75s linear infinite',
                  }} />
                ) : (
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: step === GenerationStep.ERROR
                      ? GL.rose
                      : GL.teal,
                    boxShadow: step === GenerationStep.ERROR
                      ? '0 0 10px rgba(244,63,94,0.7)'
                      : '0 0 10px rgba(20,184,166,0.7)',
                  }} />
                )}
                <span style={{
                  fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.92)',
                  letterSpacing: '0.02em',
                  textShadow: '0px 1px 3px rgba(0,0,0,0.25)',
                }}>
                  {progressMessage}
                </span>
                {(step === GenerationStep.SCRIPTING || step === GenerationStep.ASSETS) && (
                  <button
                    onClick={handleAbort}
                    style={{
                      marginLeft: 8, padding: '4px 14px', borderRadius: 10,
                      background: 'rgba(255,255,255,0.15)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      border: '1px solid rgba(255,255,255,0.35)',
                      color: '#fff', fontSize: 10, fontWeight: 800,
                      cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 3,
                      boxShadow: '0px 4px 24px rgba(0,0,0,0.20)',
                      textShadow: '0px 1px 3px rgba(0,0,0,0.25)',
                    }}
                  >
                    Stop
                  </button>
                )}
              </div>
            </div>
          )}

          <ResultTable
            data={generatedData}
            onRegenerateImage={handleRegenerateImage}
            onExportVideo={triggerVideoExport}
            onRemotionPreview={() => setShowRemotionPreview(true)}
            isExporting={isVideoGenerating}
            animatingIndices={animatingIndices}
            onGenerateAnimation={handleGenerateAnimation}
          />
        </main>
      )}

      <style>{`@keyframes glSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default App;
