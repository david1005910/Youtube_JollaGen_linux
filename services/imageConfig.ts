/**
 * 클라이언트 안전 이미지 설정 유틸리티
 * - localStorage에서 모델/스타일 설정을 읽는 순수 클라이언트 함수
 * - AI API 호출 없음, 서버 사이드 코드 없음
 */

import { CONFIG, GEMINI_STYLE_CATEGORIES, GeminiStyleId, ImageModelId } from '@/config';

const safeLocalStorage = {
  getItem: (key: string): string | null => {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  },
  setItem: (key: string, value: string): void => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, value);
  },
};

export function getSelectedImageModel(): ImageModelId {
  const saved = safeLocalStorage.getItem(CONFIG.STORAGE_KEYS.IMAGE_MODEL);
  return (saved as ImageModelId) || CONFIG.DEFAULT_IMAGE_MODEL;
}

export function setSelectedImageModel(modelId: ImageModelId): void {
  safeLocalStorage.setItem(CONFIG.STORAGE_KEYS.IMAGE_MODEL, modelId);
}

export function getSelectedGeminiStyle(): GeminiStyleId {
  const saved = safeLocalStorage.getItem(CONFIG.STORAGE_KEYS.GEMINI_STYLE);
  return (saved as GeminiStyleId) || 'gemini-none';
}

export function setSelectedGeminiStyle(styleId: GeminiStyleId): void {
  safeLocalStorage.setItem(CONFIG.STORAGE_KEYS.GEMINI_STYLE, styleId);
}

export function getGeminiCustomStylePrompt(): string {
  return safeLocalStorage.getItem(CONFIG.STORAGE_KEYS.GEMINI_CUSTOM_STYLE) || '';
}

export function setGeminiCustomStylePrompt(prompt: string): void {
  safeLocalStorage.setItem(CONFIG.STORAGE_KEYS.GEMINI_CUSTOM_STYLE, prompt);
}

export function getGeminiStylePrompt(): string {
  const styleId = getSelectedGeminiStyle();

  if (styleId === 'gemini-none') return '';

  if (styleId === 'gemini-custom') {
    return getGeminiCustomStylePrompt().trim();
  }

  for (const category of GEMINI_STYLE_CATEGORIES) {
    const style = category.styles.find(s => s.id === styleId);
    if (style) return style.prompt;
  }

  return '';
}
