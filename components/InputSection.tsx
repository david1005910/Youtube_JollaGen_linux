'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { GenerationStep, ProjectSettings, ReferenceImages, DEFAULT_REFERENCE_IMAGES } from '../types';
import { CONFIG, ELEVENLABS_MODELS, ElevenLabsModelId, IMAGE_MODELS, ImageModelId, GEMINI_STYLE_CATEGORIES, GeminiStyleId, ELEVENLABS_DEFAULT_VOICES, VoiceGender } from '../config';
import { getElevenLabsModelId, setElevenLabsModelId, ElevenLabsVoice } from '../services/elevenLabsService';
import { fetchElevenLabsVoices } from '../services/apiClient';

// Gemini 스타일 맵
const GEMINI_STYLE_MAP = new Map<string, { id: string; name: string; category: string; prompt: string }>();
GEMINI_STYLE_CATEGORIES.forEach(category => {
  category.styles.forEach(style => {
    GEMINI_STYLE_MAP.set(style.id, { ...style, category: category.name });
  });
});

interface InputSectionProps {
  onGenerate: (topic: string, referenceImages: ReferenceImages, sourceText: string | null) => void;
  step: GenerationStep;
}

const InputSection: React.FC<InputSectionProps> = ({ onGenerate, step }) => {
  const [activeTab, setActiveTab] = useState<'auto' | 'manual'>('auto');
  const [topic, setTopic] = useState('');
  const [manualScript, setManualScript] = useState('');

  // 참조 이미지 상태 분리 (캐릭터/스타일)
  const [characterRefImages, setCharacterRefImages] = useState<string[]>([]);
  const [styleRefImages, setStyleRefImages] = useState<string[]>([]);
  // 참조 강도 상태 (0~100)
  const [characterStrength, setCharacterStrength] = useState(DEFAULT_REFERENCE_IMAGES.characterStrength);
  const [styleStrength, setStyleStrength] = useState(DEFAULT_REFERENCE_IMAGES.styleStrength);

  // 이미지 모델 설정
  const [imageModelId, setImageModelId] = useState<ImageModelId>('gemini-2.0-flash-image');
  // Gemini 스타일 설정
  const [geminiStyleId, setGeminiStyleId] = useState<GeminiStyleId>('gemini-none');
  const [geminiCustomStylePrompt, setGeminiCustomStylePrompt] = useState('');

  // 프로젝트 관리
  const [projects, setProjects] = useState<ProjectSettings[]>([]);
  const [showProjectManager, setShowProjectManager] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  // ElevenLabs 설정 상태
  const [showElevenLabsSettings, setShowElevenLabsSettings] = useState(false);
  const [showPaidKeyModal, setShowPaidKeyModal] = useState(false);
  const [paidKeyInput, setPaidKeyInput] = useState('');
  const [paidKeyStatus, setPaidKeyStatus] = useState<'unknown'|'saving'|'saved'|'error'>('unknown');
  const [paidKeyMasked, setPaidKeyMasked] = useState('');
  // API 키는 서버 환경변수에서 관리 (클라이언트 노출 없음)
  const [elVoiceId, setElVoiceId] = useState('');
  const [elModelId, setElModelId] = useState<ElevenLabsModelId>('eleven_multilingual_v2');
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [showVoiceDropdown, setShowVoiceDropdown] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  // 성별 필터 상태 (null = 전체)
  const [genderFilter, setGenderFilter] = useState<VoiceGender | null>(null);

  // 파일 입력 ref 분리 (캐릭터/스타일)
  const characterFileInputRef = useRef<HTMLInputElement>(null);
  const styleFileInputRef = useRef<HTMLInputElement>(null);
  const voiceDropdownRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 컴포넌트 마운트 시 저장된 설정 로드
  useEffect(() => {
    // API 키는 환경변수에서 읽음 (elApiKey 상수로 이미 설정됨)
    const savedVoiceId = localStorage.getItem(CONFIG.STORAGE_KEYS.ELEVENLABS_VOICE_ID) || '';
    const savedModelId = getElevenLabsModelId();
    const savedImageModel = localStorage.getItem(CONFIG.STORAGE_KEYS.IMAGE_MODEL) as ImageModelId || CONFIG.DEFAULT_IMAGE_MODEL;

    // Gemini 스타일 설정 로드
    const savedGeminiStyle = localStorage.getItem(CONFIG.STORAGE_KEYS.GEMINI_STYLE) as GeminiStyleId || 'gemini-none';
    const savedGeminiCustomStyle = localStorage.getItem(CONFIG.STORAGE_KEYS.GEMINI_CUSTOM_STYLE) || '';

    setElVoiceId(savedVoiceId);
    setElModelId(savedModelId);
    setImageModelId(savedImageModel);
    setGeminiStyleId(savedGeminiStyle);
    setGeminiCustomStylePrompt(savedGeminiCustomStyle);

    // 저장된 프로젝트 목록 로드
    const savedProjects = localStorage.getItem(CONFIG.STORAGE_KEYS.PROJECTS);
    if (savedProjects) {
      try {
        setProjects(JSON.parse(savedProjects));
      } catch (e) {
        console.warn('프로젝트 로드 실패:', e);
      }
    }

    // 서버 API를 통해 음성 목록 자동 로드
    loadVoices();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (voiceDropdownRef.current && !voiceDropdownRef.current.contains(event.target as Node)) {
        setShowVoiceDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 컴포넌트 언마운트 시 오디오 정리
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // 음성 목록 불러오기 - 서버 API 사용 (API 키 불필요)
  const loadVoices = useCallback(async () => {
    setIsLoadingVoices(true);
    try {
      const voiceList = await fetchElevenLabsVoices();
      setVoices(voiceList);
    } catch (e) {
      console.warn('음성 목록 로드 실패:', e);
    } finally {
      setIsLoadingVoices(false);
    }
  }, []);

  // Voice 선택 (useCallback으로 메모이제이션)
  const selectVoice = useCallback((voice: ElevenLabsVoice) => {
    setElVoiceId(voice.voice_id);
    setShowVoiceDropdown(false);
  }, []);

  // 미리듣기 테스트 문구
  const PREVIEW_TEXT = "테스트 목소리입니다";

  // API를 사용한 음성 미리듣기 (통일된 테스트 문구 사용)
  const playVoicePreviewWithApi = async (voiceId: string, voiceName: string) => {
    // 이미 재생 중인 음성이면 정지
    if (playingVoiceId === voiceId) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingVoiceId(null);
      return;
    }

    // 기존 재생 중지
    if (audioRef.current) {
      audioRef.current.pause();
    }

    setPlayingVoiceId(voiceId);

    try {
      // 서버 API를 통해 TTS 미리듣기 생성
      const response = await fetch('/api/elevenlabs/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: PREVIEW_TEXT,
          voiceId,
          modelId: elModelId,
        }),
      });

      if (!response.ok) {
        throw new Error(`API 오류: ${response.status}`);
      }

      const data = await response.json();
      if (!data.audioData) throw new Error('오디오 데이터 없음');

      // base64 → blob → 재생
      const binaryStr = atob(data.audioData);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      const audioBlob = new Blob([bytes], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(audioBlob);

      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.play().catch(err => {
        console.warn('음성 재생 실패:', err);
        setPlayingVoiceId(null);
      });

      audio.onended = () => {
        setPlayingVoiceId(null);
        audioRef.current = null;
        URL.revokeObjectURL(audioUrl);
      };

    } catch (error) {
      console.warn('미리듣기 생성 실패:', error);
      alert(`"${voiceName}" 미리듣기 생성에 실패했습니다.`);
      setPlayingVoiceId(null);
    }
  };

  // 음성 미리듣기 (API 음성용)
  const playVoicePreview = (e: React.MouseEvent, voice: ElevenLabsVoice) => {
    e.stopPropagation();
    playVoicePreviewWithApi(voice.voice_id, voice.name);
  };

  // 기본 음성 미리듣기 (기본 음성 목록용)
  const playDefaultVoicePreview = (e: React.MouseEvent, voice: typeof ELEVENLABS_DEFAULT_VOICES[number]) => {
    e.stopPropagation();
    playVoicePreviewWithApi(voice.id, voice.name);
  };

  // 선택된 Voice 이름 가져오기
  const getSelectedVoiceName = () => {
    if (!elVoiceId) return '기본값 사용';
    const voice = voices.find(v => v.voice_id === elVoiceId);
    return voice ? voice.name : elVoiceId.slice(0, 12) + '...';
  };

  // ElevenLabs 설정 저장 (API 키는 환경변수에서 읽으므로 저장하지 않음)
  const saveElevenLabsSettings = () => {
    if (elVoiceId) {
      localStorage.setItem(CONFIG.STORAGE_KEYS.ELEVENLABS_VOICE_ID, elVoiceId);
    }
    setElevenLabsModelId(elModelId);
    setShowElevenLabsSettings(false);
  };

  // 이미지 모델 선택 (useCallback으로 메모이제이션)
  const selectImageModel = useCallback((modelId: ImageModelId) => {
    setImageModelId(modelId);
    localStorage.setItem(CONFIG.STORAGE_KEYS.IMAGE_MODEL, modelId);
  }, []);

  // Gemini 스타일 선택 (useCallback으로 메모이제이션)
  const selectGeminiStyle = useCallback((styleId: GeminiStyleId) => {
    setGeminiStyleId(styleId);
    localStorage.setItem(CONFIG.STORAGE_KEYS.GEMINI_STYLE, styleId);
  }, []);

  // Gemini 커스텀 스타일 저장 (useCallback으로 메모이제이션)
  const saveGeminiCustomStyle = useCallback((prompt: string) => {
    setGeminiCustomStylePrompt(prompt);
    localStorage.setItem(CONFIG.STORAGE_KEYS.GEMINI_CUSTOM_STYLE, prompt);
  }, []);

  // 프로젝트 저장
  const saveProject = () => {
    if (!newProjectName.trim()) return;

    const newProject: ProjectSettings = {
      id: Date.now().toString(),
      name: newProjectName.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      imageModel: imageModelId,
      elevenLabsVoiceId: elVoiceId,
      elevenLabsModel: elModelId,
    };

    const updatedProjects = [...projects, newProject];
    setProjects(updatedProjects);
    localStorage.setItem(CONFIG.STORAGE_KEYS.PROJECTS, JSON.stringify(updatedProjects));
    setNewProjectName('');
    alert(`프로젝트 "${newProject.name}" 저장 완료!`);
  };

  // 프로젝트 불러오기
  const loadProject = (project: ProjectSettings) => {
    setImageModelId(project.imageModel as ImageModelId);
    setElVoiceId(project.elevenLabsVoiceId);
    setElModelId(project.elevenLabsModel as ElevenLabsModelId);

    // localStorage에도 저장
    localStorage.setItem(CONFIG.STORAGE_KEYS.IMAGE_MODEL, project.imageModel);
    localStorage.setItem(CONFIG.STORAGE_KEYS.ELEVENLABS_VOICE_ID, project.elevenLabsVoiceId);
    setElevenLabsModelId(project.elevenLabsModel as ElevenLabsModelId);

    setShowProjectManager(false);
    alert(`프로젝트 "${project.name}" 불러오기 완료!`);
  };

  // 프로젝트 삭제
  const deleteProject = (projectId: string) => {
    if (!confirm('이 프로젝트를 삭제하시겠습니까?')) return;

    const updatedProjects = projects.filter(p => p.id !== projectId);
    setProjects(updatedProjects);
    localStorage.setItem(CONFIG.STORAGE_KEYS.PROJECTS, JSON.stringify(updatedProjects));
  };

  // 프로젝트 업데이트 (덮어쓰기)
  const updateProject = (project: ProjectSettings) => {
    const updatedProject: ProjectSettings = {
      ...project,
      updatedAt: Date.now(),
      imageModel: imageModelId,
      elevenLabsVoiceId: elVoiceId,
      elevenLabsModel: elModelId,
    };

    const updatedProjects = projects.map(p => p.id === project.id ? updatedProject : p);
    setProjects(updatedProjects);
    localStorage.setItem(CONFIG.STORAGE_KEYS.PROJECTS, JSON.stringify(updatedProjects));
    alert(`프로젝트 "${project.name}" 업데이트 완료!`);
  };

  // 선택된 Gemini 스타일 정보 가져오기 (useMemo로 캐싱 - O(1) 조회)
  const selectedGeminiStyle = useMemo(() => {
    if (geminiStyleId === 'gemini-none') {
      return { id: 'gemini-none', name: '없음', category: '기본', prompt: '' };
    }
    if (geminiStyleId === 'gemini-custom') {
      return { id: 'gemini-custom', name: '커스텀', category: '직접 입력', prompt: geminiCustomStylePrompt };
    }
    return GEMINI_STYLE_MAP.get(geminiStyleId) || null;
  }, [geminiStyleId, geminiCustomStylePrompt]);

  // 성별 필터링된 기본 음성 목록
  const filteredDefaultVoices = useMemo(() => {
    if (!genderFilter) return ELEVENLABS_DEFAULT_VOICES;
    return ELEVENLABS_DEFAULT_VOICES.filter(v => v.gender === genderFilter);
  }, [genderFilter]);

  // 성별 필터링된 API 음성 목록
  const filteredApiVoices = useMemo(() => {
    if (!genderFilter) return voices;
    return voices.filter(v => v.labels?.gender?.toLowerCase() === genderFilter);
  }, [voices, genderFilter]);

  // 선택된 음성의 이름 가져오기 (기본 음성 목록도 확인)
  const getSelectedVoiceInfo = useCallback(() => {
    if (!elVoiceId) return { name: '기본값 사용', description: '시스템 기본 음성' };

    // 기본 음성 목록에서 찾기
    const defaultVoice = ELEVENLABS_DEFAULT_VOICES.find(v => v.id === elVoiceId);
    if (defaultVoice) {
      return { name: defaultVoice.name, description: defaultVoice.description };
    }

    // API 음성 목록에서 찾기
    const apiVoice = voices.find(v => v.voice_id === elVoiceId);
    if (apiVoice) {
      return { name: apiVoice.name, description: apiVoice.labels?.description || apiVoice.category };
    }

    return { name: elVoiceId.slice(0, 12) + '...', description: '직접 입력한 ID' };
  }, [elVoiceId, voices]);

  const isProcessing = step !== GenerationStep.IDLE && step !== GenerationStep.COMPLETED && step !== GenerationStep.ERROR;

  // 폼 제출 핸들러 (useCallback으로 메모이제이션)
  const openPaidKeyModal = useCallback(async () => {
    setShowPaidKeyModal(true);
    try {
      const res = await fetch('/api/settings/apikey');
      const data = await res.json();
      if (data.paidKeyMasked) setPaidKeyMasked(data.paidKeyMasked);
    } catch {}
  }, []);

  const savePaidKey = useCallback(async () => {
    if (!paidKeyInput.trim()) return;
    setPaidKeyStatus('saving');
    try {
      const res = await fetch('/api/settings/apikey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paidKey: paidKeyInput.trim() }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setPaidKeyMasked(data.masked);
      setPaidKeyInput('');
      setPaidKeyStatus('saved');
    } catch (e: any) {
      setPaidKeyStatus('error');
    }
  }, [paidKeyInput]);

  const deletePaidKey = useCallback(async () => {
    await fetch('/api/settings/apikey', { method: 'DELETE' });
    setPaidKeyMasked('');
    setPaidKeyStatus('unknown');
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (isProcessing) return;

    // ReferenceImages 타입으로 전달 (강도 포함)
    const refImages: ReferenceImages = {
      character: characterRefImages,
      style: styleRefImages,
      characterStrength,
      styleStrength
    };

    if (activeTab === 'auto') {
      if (topic.trim()) onGenerate(topic, refImages, null);
    } else {
      if (manualScript.trim()) onGenerate("Manual Script Input", refImages, manualScript);
    }
  }, [isProcessing, activeTab, topic, characterRefImages, styleRefImages, characterStrength, styleStrength, manualScript, onGenerate]);

  // 캐릭터 참조 이미지 업로드 핸들러
  const handleCharacterImageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const remainingSlots = 2 - characterRefImages.length; // 최대 2장
      const filesToProcess = (Array.from(files) as File[]).slice(0, remainingSlots);
      filesToProcess.forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => setCharacterRefImages(prev => [...prev, reader.result as string].slice(0, 2));
        reader.readAsDataURL(file);
      });
    }
    if (characterFileInputRef.current) characterFileInputRef.current.value = '';
  }, [characterRefImages.length]);

  // 스타일 참조 이미지 업로드 핸들러
  const handleStyleImageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const remainingSlots = 2 - styleRefImages.length; // 최대 2장
      const filesToProcess = (Array.from(files) as File[]).slice(0, remainingSlots);
      filesToProcess.forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => setStyleRefImages(prev => [...prev, reader.result as string].slice(0, 2));
        reader.readAsDataURL(file);
      });
    }
    if (styleFileInputRef.current) styleFileInputRef.current.value = '';
  }, [styleRefImages.length]);

  // 캐릭터 이미지 제거 핸들러
  const removeCharacterImage = useCallback((index: number) => setCharacterRefImages(prev => prev.filter((_, i) => i !== index)), []);

  // 스타일 이미지 제거 핸들러
  const removeStyleImage = useCallback((index: number) => setStyleRefImages(prev => prev.filter((_, i) => i !== index)), []);

  return (
    <div className="w-full max-w-4xl mx-auto my-8 px-4">
      <div className="text-center mb-10">
        <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-2 text-white">
          TubeGen <span className="text-brand-500">Studio</span>
        </h1>
        <p className="text-slate-400 text-sm font-medium uppercase tracking-widest">졸라맨 V10.0 Concept-Based Engine</p>
      </div>

      <div className="mb-4 flex flex-col gap-4">
        {/* 프로젝트 관리 */}
        <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-2xl backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setShowProjectManager(!showProjectManager)}
            className="w-full flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-bold text-sm">프로젝트 관리</h3>
                <p className="text-slate-500 text-xs">
                  {projects.length > 0 ? `${projects.length}개 저장됨` : '설정을 프로젝트로 저장'}
                </p>
              </div>
            </div>
            <svg className={`w-5 h-5 text-slate-500 transition-transform ${showProjectManager ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showProjectManager && (
            <div className="mt-4 pt-4 border-t border-slate-800 space-y-4">
              {/* 새 프로젝트 저장 */}
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2">새 프로젝트 저장</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="프로젝트 이름 입력..."
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:border-amber-500 focus:outline-none"
                    onKeyDown={(e) => e.key === 'Enter' && saveProject()}
                  />
                  <button
                    type="button"
                    onClick={saveProject}
                    disabled={!newProjectName.trim()}
                    className="px-4 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors whitespace-nowrap"
                  >
                    저장
                  </button>
                </div>
              </div>

              {/* 저장된 프로젝트 목록 */}
              {projects.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-2">저장된 프로젝트</label>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {projects.map((project) => (
                      <div
                        key={project.id}
                        className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl border border-slate-700"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm text-white truncate">{project.name}</div>
                          <div className="text-[10px] text-slate-500">
                            {new Date(project.updatedAt).toLocaleDateString('ko-KR')} • Gemini
                          </div>
                        </div>
                        <div className="flex gap-1 ml-2">
                          <button
                            type="button"
                            onClick={() => loadProject(project)}
                            className="px-2 py-1 text-[10px] bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                          >
                            불러오기
                          </button>
                          <button
                            type="button"
                            onClick={() => updateProject(project)}
                            className="px-2 py-1 text-[10px] bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors"
                          >
                            덮어쓰기
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteProject(project.id)}
                            className="px-2 py-1 text-[10px] bg-red-600/50 hover:bg-red-500 text-white rounded-lg transition-colors"
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {projects.length === 0 && (
                <p className="text-center text-slate-500 text-xs py-4">
                  저장된 프로젝트가 없습니다.<br />
                  현재 설정을 프로젝트로 저장해보세요.
                </p>
              )}
            </div>
          )}
        </div>

        {/* 참조 이미지 설정 (캐릭터/스타일 분리) */}
        <div className="p-6 bg-slate-900/50 border border-slate-800 rounded-3xl backdrop-blur-sm shadow-xl">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-fuchsia-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-white font-bold text-lg">참조 이미지 설정</h3>
              <p className="text-slate-500 text-xs">참조 이미지가 있으면 고정 프롬프트보다 우선 적용됩니다</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 캐릭터 참조 영역 */}
            <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">🧑</span>
                <div>
                  <h4 className="text-white font-bold text-sm">캐릭터 참조</h4>
                  <p className="text-slate-500 text-[10px]">캐릭터의 외모/스타일 참조 (최대 2장)</p>
                </div>
              </div>

              {/* 캐릭터 참조 이미지가 있을 때 안내 메시지 */}
              {characterRefImages.length > 0 && (
                <div className="mb-3 px-2 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <p className="text-amber-400 text-[10px] font-medium">
                    ⚠️ 캐릭터 참조 이미지 우선 → 고정 캐릭터 프롬프트 제외
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2 items-center mb-3">
                {characterRefImages.map((img, idx) => (
                  <div key={idx} className="relative group">
                    <div className="w-20 h-14 rounded-lg overflow-hidden border border-violet-500/50">
                      <img src={img} alt={`Character Ref ${idx}`} className="w-full h-full object-cover" />
                    </div>
                    <button
                      onClick={() => removeCharacterImage(idx)}
                      className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
                {characterRefImages.length < 2 && (
                  <button
                    type="button"
                    onClick={() => characterFileInputRef.current?.click()}
                    className="w-20 h-14 border-2 border-dashed border-slate-600 rounded-lg flex items-center justify-center text-slate-500 hover:border-violet-500 hover:text-violet-400 transition-all"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                )}
                <input
                  type="file"
                  ref={characterFileInputRef}
                  onChange={handleCharacterImageChange}
                  accept="image/*"
                  className="hidden"
                  multiple
                />
              </div>

              {/* 캐릭터 참조 강도 슬라이더 */}
              {characterRefImages.length > 0 && (
                <div className="pt-3 border-t border-slate-700">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-slate-400">참조 강도</span>
                    <span className="text-[10px] font-bold text-violet-400">{characterStrength}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={characterStrength}
                    onChange={(e) => setCharacterStrength(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-violet-500"
                  />
                  <div className="flex justify-between text-[9px] text-slate-500 mt-1">
                    <span>약하게 (참고만)</span>
                    <span>강하게 (정확히)</span>
                  </div>
                </div>
              )}
            </div>

            {/* 스타일 참조 영역 */}
            <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">🎨</span>
                <div>
                  <h4 className="text-white font-bold text-sm">화풍/스타일 참조</h4>
                  <p className="text-slate-500 text-[10px]">전체적인 화풍과 분위기 참조 (최대 2장)</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 items-center mb-3">
                {styleRefImages.map((img, idx) => (
                  <div key={idx} className="relative group">
                    <div className="w-20 h-14 rounded-lg overflow-hidden border border-fuchsia-500/50">
                      <img src={img} alt={`Style Ref ${idx}`} className="w-full h-full object-cover" />
                    </div>
                    <button
                      onClick={() => removeStyleImage(idx)}
                      className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
                {styleRefImages.length < 2 && (
                  <button
                    type="button"
                    onClick={() => styleFileInputRef.current?.click()}
                    className="w-20 h-14 border-2 border-dashed border-slate-600 rounded-lg flex items-center justify-center text-slate-500 hover:border-fuchsia-500 hover:text-fuchsia-400 transition-all"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                )}
                <input
                  type="file"
                  ref={styleFileInputRef}
                  onChange={handleStyleImageChange}
                  accept="image/*"
                  className="hidden"
                  multiple
                />
              </div>

              {/* 스타일 참조 강도 슬라이더 */}
              {styleRefImages.length > 0 && (
                <div className="pt-3 border-t border-slate-700">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-slate-400">참조 강도</span>
                    <span className="text-[10px] font-bold text-fuchsia-400">{styleStrength}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={styleStrength}
                    onChange={(e) => setStyleStrength(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-fuchsia-500"
                  />
                  <div className="flex justify-between text-[9px] text-slate-500 mt-1">
                    <span>약하게 (참고만)</span>
                    <span>강하게 (정확히)</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 🎤 ElevenLabs 음성 설정 (참조 이미지 바로 아래) */}
        <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-2xl backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setShowElevenLabsSettings(!showElevenLabsSettings)}
            className="w-full flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-bold text-sm">🎤 나레이션 음성 설정</h3>
                <p className="text-slate-500 text-xs">
                  {voices.length > 0 ? `✅ ${getSelectedVoiceInfo().name}` : '⚙️ 서버 설정 확인 중...'}
                </p>
              </div>
            </div>
            <svg className={`w-5 h-5 text-slate-500 transition-transform ${showElevenLabsSettings ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showElevenLabsSettings && (
            <div className="mt-4 pt-4 border-t border-slate-800 space-y-4">
              {/* API Key 상태 표시 (서버 환경변수 관리) */}
              <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-blue-400">🔒</span>
                    <span className="text-sm text-slate-300">API 키는 서버에서 안전하게 관리됩니다</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => loadVoices()}
                    disabled={isLoadingVoices}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors whitespace-nowrap"
                  >
                    {isLoadingVoices ? '로딩...' : '음성 목록 새로고침'}
                  </button>
                </div>
              </div>

              {/* Voice Selection - 간소화된 UI */}
              <div ref={voiceDropdownRef} className="relative">
                <label className="block text-xs font-bold text-slate-400 mb-2">
                  음성 선택
                  <span className="text-purple-400 ml-2 font-normal">
                    (안정적인 음성 {ELEVENLABS_DEFAULT_VOICES.length}개)
                  </span>
                </label>

                {/* 선택된 음성 표시 버튼 */}
                <button
                  type="button"
                  onClick={() => setShowVoiceDropdown(!showVoiceDropdown)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-left flex items-center justify-between hover:border-purple-500/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-bold text-sm text-white">{getSelectedVoiceInfo().name}</div>
                      <div className="text-xs text-slate-500 line-clamp-1">{getSelectedVoiceInfo().description}</div>
                    </div>
                  </div>
                  <svg className={`w-5 h-5 text-slate-500 transition-transform ${showVoiceDropdown ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* 드롭다운 목록 */}
                {showVoiceDropdown && (
                  <div className="absolute z-50 w-full mt-2 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-h-[24rem] overflow-hidden flex flex-col">
                    {/* 성별 필터 탭 */}
                    <div className="flex gap-1 p-2 bg-slate-800/80 border-b border-slate-700">
                      <button
                        type="button"
                        onClick={() => setGenderFilter(null)}
                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                          genderFilter === null ? 'bg-purple-600 text-white' : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        전체
                      </button>
                      <button
                        type="button"
                        onClick={() => setGenderFilter('female')}
                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                          genderFilter === 'female' ? 'bg-pink-600 text-white' : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        👩 여성
                      </button>
                      <button
                        type="button"
                        onClick={() => setGenderFilter('male')}
                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                          genderFilter === 'male' ? 'bg-blue-600 text-white' : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        👨 남성
                      </button>
                    </div>

                    {/* 음성 목록 */}
                    <div className="overflow-y-auto flex-1">
                      {/* 기본값 옵션 */}
                      <button
                        type="button"
                        onClick={() => { setElVoiceId(''); setShowVoiceDropdown(false); }}
                        className={`w-full px-4 py-3 text-left hover:bg-slate-800 transition-colors border-b border-slate-800 ${!elVoiceId ? 'bg-purple-600/20' : ''}`}
                      >
                        <div className="font-bold text-sm text-slate-300">🔄 기본값 (Rachel)</div>
                        <div className="text-xs text-slate-500">가장 안정적인 여성 음성</div>
                      </button>

                      {/* 안정적인 음성 섹션 헤더 */}
                      <div className="px-3 py-2 bg-slate-800/50 border-b border-slate-800">
                        <div className="text-[10px] font-bold text-green-400 uppercase tracking-wider">
                          ✅ 안정적인 음성 (긴 텍스트 OK)
                        </div>
                      </div>

                      {filteredDefaultVoices.map((voice) => (
                        <div
                          key={voice.id}
                          className={`flex items-center gap-3 px-4 py-3 hover:bg-slate-800 transition-colors border-b border-slate-800/50 ${elVoiceId === voice.id ? 'bg-purple-600/20' : ''}`}
                        >
                          {/* 미리듣기 버튼 */}
                          <button
                            type="button"
                            onClick={(e) => playDefaultVoicePreview(e, voice)}
                            className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                              playingVoiceId === voice.id
                                ? 'bg-purple-500 text-white animate-pulse'
                                : 'bg-slate-700 text-slate-400 hover:bg-purple-600 hover:text-white'
                            }`}
                            title="미리듣기"
                          >
                            {playingVoiceId === voice.id ? (
                              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                <rect x="6" y="5" width="4" height="14" rx="1" />
                                <rect x="14" y="5" width="4" height="14" rx="1" />
                              </svg>
                            ) : (
                              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            )}
                          </button>

                          {/* 음성 정보 */}
                          <button
                            type="button"
                            onClick={() => { setElVoiceId(voice.id); setShowVoiceDropdown(false); }}
                            className="flex-1 text-left"
                          >
                            <div className="flex items-center gap-2">
                              <div className="font-bold text-sm text-white">{voice.name}</div>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                voice.gender === 'female' ? 'bg-pink-500/20 text-pink-400' : 'bg-blue-500/20 text-blue-400'
                              }`}>
                                {voice.gender === 'female' ? '여성' : '남성'}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 mt-1 line-clamp-1">{voice.description}</div>
                          </button>

                          {/* 선택됨 표시 */}
                          {elVoiceId === voice.id && (
                            <div className="text-purple-400">
                              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                              </svg>
                            </div>
                          )}
                        </div>
                      ))}

                      {/* 내 음성 라이브러리 (API 음성) */}
                      {filteredApiVoices.length > 0 && (
                        <>
                          <div className="px-3 py-2 bg-slate-800/50 border-b border-slate-800">
                            <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                              📂 내 음성 라이브러리
                            </div>
                          </div>
                          {filteredApiVoices.map((voice) => (
                            <div
                              key={voice.voice_id}
                              className={`flex items-center gap-3 px-4 py-3 hover:bg-slate-800 transition-colors border-b border-slate-800/50 ${elVoiceId === voice.voice_id ? 'bg-purple-600/20' : ''}`}
                            >
                              <button
                                type="button"
                                onClick={(e) => playVoicePreview(e, voice)}
                                className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                                  playingVoiceId === voice.voice_id ? 'bg-amber-500 text-white animate-pulse' : 'bg-slate-700 text-slate-400 hover:bg-amber-600 hover:text-white'
                                }`}
                              >
                                {playingVoiceId === voice.voice_id ? (
                                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                                ) : (
                                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                )}
                              </button>
                              <button type="button" onClick={() => selectVoice(voice)} className="flex-1 text-left">
                                <div className="flex items-center gap-2">
                                  <div className="font-bold text-sm text-white">{voice.name}</div>
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-400">{voice.category}</span>
                                </div>
                              </button>
                              {elVoiceId === voice.voice_id && (
                                <div className="text-purple-400"><svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg></div>
                              )}
                            </div>
                          ))}
                        </>
                      )}
                    </div>

                    {/* 직접 입력 */}
                    <div className="p-3 bg-slate-800/80 border-t border-slate-700">
                      <input
                        type="text"
                        value={elVoiceId}
                        onChange={(e) => setElVoiceId(e.target.value)}
                        placeholder="Voice ID 직접 입력..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:border-purple-500 focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* TTS 모델 선택 - 자막 지원 모델만 */}
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2">
                  TTS 모델 <span className="text-green-400 font-normal">(✅ 자막 지원만)</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {ELEVENLABS_MODELS.filter(m => m.supportsTimestamp).map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => setElModelId(model.id)}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        elModelId === model.id
                          ? 'bg-purple-600/20 border-purple-500 text-white'
                          : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs">{model.name}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 font-bold">자막OK</span>
                      </div>
                      <div className="text-[10px] opacity-70 mt-0.5">{model.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 저장 버튼 */}
              <button
                type="button"
                onClick={saveElevenLabsSettings}
                className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-2.5 rounded-xl transition-colors text-sm"
              >
                설정 저장
              </button>
            </div>
          )}
        </div>

        {/* 이미지 생성 모델 선택 */}
        <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-2xl backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-white font-bold text-sm">이미지 생성 모델</h3>
              <p className="text-slate-500 text-xs">모델별 품질과 가격 비교</p>
            </div>
          </div>

          {/* ── Gemini 모델 섹션 (강조) */}
          <div className="mb-3">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
              <span>🤖</span> Google Gemini
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {IMAGE_MODELS.filter(m => m.provider === 'Google').map((model) => {
                const isSelected = imageModelId === model.id;
                const isFree = (model as any).tier === 'free';
                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => selectImageModel(model.id)}
                    className={`p-4 rounded-xl border text-left transition-all relative ${
                      isSelected
                        ? 'border-blue-400 text-white'
                        : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600'
                    }`}
                    style={isSelected ? { background: 'rgba(59,130,246,0.15)' } : {}}
                  >
                    {isFree && (
                      <span className="absolute top-2 right-2 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-emerald-600/80 text-white tracking-widest">
                        무료
                      </span>
                    )}
                    {!isFree && (
                      <span className="absolute top-2 right-2 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-amber-600/70 text-white tracking-widest">
                        유료키
                      </span>
                    )}
                    <div className="flex items-center gap-2 mb-1 pr-10">
                      <span className="font-bold text-sm">{model.name}</span>
                    </div>
                    <div className="text-xs opacity-70 mb-1">{model.description}</div>
                    <div className="flex items-center justify-between text-xs">
                      <span className={isFree ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                        {isFree ? '무료' : `$${model.pricePerImage.toFixed(4)}/장`}
                      </span>
                      <span className="text-slate-500">{model.speed}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── 기타 모델 섹션 */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">기타 모델</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {IMAGE_MODELS.filter(m => m.provider !== 'Google').map((model) => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => selectImageModel(model.id)}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    imageModelId === model.id
                      ? 'bg-blue-600/20 border-blue-500 text-white'
                      : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-sm">{model.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
                      {model.provider}
                    </span>
                  </div>
                  <div className="text-xs opacity-70 mb-2">{model.description}</div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-amber-400 font-bold">${model.pricePerImage.toFixed(4)}/장</span>
                    <span className="text-slate-500">{model.speed}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Gemini 화풍 선택 */}
          {(imageModelId === 'gemini-2.5-flash-image' || imageModelId === 'gemini-2.0-flash-image' || imageModelId === 'gemini-3-pro-image') && (
            <div className="mt-4 pt-4 border-t border-slate-700">
              {/* 화풍 선택 헤더 */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🎨</span>
                  <label className="text-xs font-bold text-slate-400">Gemini 화풍 선택</label>
                </div>
                {selectedGeminiStyle && selectedGeminiStyle.id !== 'gemini-none' && (
                  <span className="text-xs text-emerald-400">
                    {selectedGeminiStyle?.category} &gt; {selectedGeminiStyle?.name}
                  </span>
                )}
              </div>

              {/* 화풍 없음 옵션 */}
              <div className="mb-4">
                <button
                  type="button"
                  onClick={() => selectGeminiStyle('gemini-none')}
                  className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                    geminiStyleId === 'gemini-none'
                      ? 'bg-slate-600 text-white ring-2 ring-slate-400'
                      : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  🚫 화풍 없음 (기본)
                </button>
                <span className="text-[10px] text-slate-500 ml-2">프롬프트에만 의존</span>
              </div>

              {/* 카테고리별 스타일 버튼 */}
              {GEMINI_STYLE_CATEGORIES.map((category) => (
                <div key={category.id} className="mb-4">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                    {category.name}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {category.styles.map((style) => (
                      <button
                        key={style.id}
                        type="button"
                        onClick={() => selectGeminiStyle(style.id as GeminiStyleId)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          geminiStyleId === style.id
                            ? 'bg-emerald-500 text-white'
                            : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-white'
                        }`}
                      >
                        {style.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {/* 커스텀 스타일 (직접 입력) */}
              <div className="mt-4 pt-3 border-t border-slate-700">
                <div className="flex items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => selectGeminiStyle('gemini-custom')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      geminiStyleId === 'gemini-custom'
                        ? 'bg-teal-500 text-white'
                        : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    ✏️ 커스텀 화풍
                  </button>
                  <span className="text-[10px] text-slate-500">직접 화풍 설명 입력</span>
                </div>

                {geminiStyleId === 'gemini-custom' && (
                  <div className="mt-2">
                    <textarea
                      value={geminiCustomStylePrompt}
                      onChange={(e) => saveGeminiCustomStyle(e.target.value)}
                      placeholder="예: Watercolor painting style with soft edges, pastel colors, dreamy atmosphere..."
                      className="w-full h-24 bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none resize-none"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      영어로 화풍을 상세히 설명하세요. 이 설명이 Gemini 이미지 생성에 적용됩니다.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs and Submit */}
      <div className="flex justify-center mb-6">
        <div className="bg-slate-900 p-1.5 rounded-2xl border border-slate-800 flex gap-1">
          <button type="button" onClick={() => setActiveTab('auto')} className={`px-8 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'auto' ? 'bg-brand-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>자동 트렌드</button>
          <button type="button" onClick={() => setActiveTab('manual')} className={`px-8 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'manual' ? 'bg-brand-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>수동 대본</button>
        </div>
      </div>

      {/* 유료 키 설정 모달 */}
      {showPaidKeyModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          background: 'rgba(9,11,26,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(6px)',
        }} onClick={() => setShowPaidKeyModal(false)}>
          <div style={{
            background: 'rgba(255,255,255,0.14)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.30)',
            borderRadius: 20,
            boxShadow: 'inset 0 0 12px rgba(255,255,255,0.10), 0 8px 40px rgba(0,0,0,0.35)',
            padding: 28, width: '90%', maxWidth: 480,
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.25)' }}>
              💳 유료 Gemini API 키 설정
            </h3>
            <p style={{ margin: '0 0 18px', fontSize: 12, color: 'rgba(255,255,255,0.50)', lineHeight: 1.6 }}>
              할당량 초과 시 유료 키로 자동 전환됩니다.<br/>
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer"
                style={{ color: '#a78bfa', textDecoration: 'underline' }}>
                Google AI Studio → 유료 프로젝트에서 발급
              </a>
            </p>

            {paidKeyMasked && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.30)',
                borderRadius: 10, padding: '8px 14px', marginBottom: 14,
              }}>
                <span style={{ fontSize: 13, color: '#34d399' }}>
                  ✅ 유료 키 등록됨: {paidKeyMasked}
                </span>
                <button onClick={deletePaidKey} style={{
                  background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
                  cursor: 'pointer', fontSize: 12,
                }}>삭제</button>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="password"
                value={paidKeyInput}
                onChange={e => { setPaidKeyInput(e.target.value); setPaidKeyStatus('unknown'); }}
                placeholder="AIzaSy..."
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.10)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(255,255,255,0.25)',
                  borderRadius: 10, padding: '9px 12px',
                  color: '#fff', fontSize: 13, outline: 'none',
                }}
              />
              <button
                onClick={savePaidKey}
                disabled={!paidKeyInput.trim() || paidKeyStatus === 'saving'}
                style={{
                  background: 'linear-gradient(135deg, rgba(139,92,246,0.75), rgba(59,130,246,0.65))',
                  border: '1px solid rgba(255,255,255,0.30)',
                  borderRadius: 10, padding: '9px 18px',
                  color: '#fff', fontWeight: 700, fontSize: 13,
                  cursor: 'pointer', opacity: !paidKeyInput.trim() ? 0.5 : 1,
                  textShadow: '0 1px 3px rgba(0,0,0,0.25)',
                }}
              >
                {paidKeyStatus === 'saving' ? '저장 중...' : '저장'}
              </button>
            </div>
            {paidKeyStatus === 'saved' && <p style={{ margin: '8px 0 0', fontSize: 12, color: '#34d399' }}>✅ 저장됨 — 다음 요청부터 적용됩니다.</p>}
            {paidKeyStatus === 'error' && <p style={{ margin: '8px 0 0', fontSize: 12, color: '#f87171' }}>❌ 저장 실패 — 키 형식을 확인하세요 (AIzaSy...).</p>}

            <button onClick={() => setShowPaidKeyModal(false)} style={{
              width: '100%', marginTop: 16,
              background: 'rgba(255,255,255,0.10)',
              border: '1px solid rgba(255,255,255,0.20)',
              borderRadius: 10, padding: '9px',
              color: 'rgba(255,255,255,0.60)', fontSize: 13,
              cursor: 'pointer',
            }}>닫기</button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
        {activeTab === 'auto' ? (
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-brand-600 to-blue-600 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
            <div className="relative flex items-center bg-slate-900 rounded-2xl border border-slate-700 overflow-hidden pr-2">
              <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} disabled={isProcessing} placeholder="경제 트렌드 키워드 입력 (예: 비트코인, 금리)..." className="block w-full bg-transparent text-slate-100 py-5 px-6 focus:ring-0 focus:outline-none placeholder-slate-600 text-lg disabled:opacity-50" />
              <button type="submit" disabled={isProcessing || !topic.trim()} className="bg-brand-600 hover:bg-brand-500 text-white font-black py-3 px-8 rounded-xl transition-all disabled:opacity-50 whitespace-nowrap">{isProcessing ? '생성 중' : '시작'}</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="bg-slate-900 border border-slate-700 rounded-3xl overflow-hidden">
              <textarea value={manualScript} onChange={(e) => setManualScript(e.target.value)} placeholder="직접 작성한 대본을 입력하세요. AI가 시각적 연출안을 생성합니다." className="w-full h-80 bg-transparent text-slate-100 p-8 focus:ring-0 focus:outline-none placeholder-slate-600 resize-none" disabled={isProcessing} />

              {/* 글자 수 카운터 및 청크 분할 안내 */}
              <div className="px-8 pb-4 flex items-center justify-between border-t border-slate-800 pt-3">
                <div className="flex items-center gap-3">
                  {/* 글자 수 표시 */}
                  <span className={`text-xs font-mono ${
                    manualScript.length > 10000 ? 'text-amber-400' :
                    manualScript.length > 3000 ? 'text-blue-400' :
                    'text-slate-500'
                  }`}>
                    {manualScript.length.toLocaleString()}자
                  </span>

                  {/* 예상 씬 개수 (100자당 약 1씬) */}
                  {manualScript.length > 100 && (
                    <span className="text-[10px] text-slate-600">
                      (예상 씬: ~{Math.max(5, Math.ceil(manualScript.length / 100))}개)
                    </span>
                  )}
                </div>

                {/* 청크 분할 안내 */}
                <div className="text-[10px]">
                  {manualScript.length > 10000 ? (
                    <span className="text-amber-400 font-medium">
                      ⚡ 대용량 모드: 자동 청크 분할 (최대 15,000자)
                    </span>
                  ) : manualScript.length > 3000 ? (
                    <span className="text-blue-400 font-medium">
                      📦 청크 분할 처리됨 (3,000자+)
                    </span>
                  ) : (
                    <span className="text-slate-600">
                      일반 처리 (~3,000자)
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button type="submit" disabled={isProcessing || !manualScript.trim()} className="w-full bg-slate-100 hover:bg-white text-slate-950 font-black py-5 rounded-2xl transition-all disabled:opacity-50 uppercase tracking-widest text-sm">스토리보드 생성</button>
          </div>
        )}
      </form>

      {/* 유료 키 설정 버튼 (할당량 초과 대비) */}
      <div className="max-w-2xl mx-auto mt-3 flex justify-end">
        <button
          type="button"
          onClick={openPaidKeyModal}
          style={{
            background: 'rgba(255,255,255,0.08)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: 8,
            padding: '5px 14px',
            color: 'rgba(255,255,255,0.45)',
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
            letterSpacing: '0.04em',
            textShadow: '0 1px 3px rgba(0,0,0,0.25)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          💳 API 할당량 초과 시 유료 키 설정
        </button>
      </div>
    </div>
  );
};

export default InputSection;
