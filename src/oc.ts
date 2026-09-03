import type { OCAnimationPack } from "./animation-pack";

export const OC_PROFILE_KEY = "lotus-desk-pet/oc-profile/v1";

export interface OCProfile {
  id: string;
  name: string;
  addressName: string;
  personality: string[];
  tone: string;
  catchphrases: string[];
  keywordReplies: Record<string, string[]>;
  proactiveMinutes: number;
  imageScale: number;
  imageX: number;
  imageY: number;
  aiEnabled: boolean;
  llmProvider: "openai" | "anthropic" | "deepseek" | "compatible";
  llmModel: string;
  llmBaseUrl: string;
  aiIdleRatio: number;
  weatherEnabled: boolean;
  weatherCity: string;
}

export interface OCPack {
  version: 1;
  profile: OCProfile;
  imageDataUrl?: string;
  animationPack?: OCAnimationPack;
}

export const defaultOCProfile = (): OCProfile => ({
  id: "lotus-host",
  name: "荷间小主人",
  addressName: "你",
  personality: ["温柔", "安静", "有一点俏皮"],
  tone: "轻柔、简短，像陪在身边喝茶的朋友",
  catchphrases: ["慢慢来，我在这里。", "要一起喝杯茶吗？"],
  keywordReplies: {
    辛苦: ["辛苦啦。先松一松肩膀，我替你看一会儿荷花。"],
    想你: ["我一直坐在这里呀，只是刚刚看云去了。"],
  },
  proactiveMinutes: 30,
  imageScale: 1,
  imageX: 0,
  imageY: 0,
  aiEnabled: false,
  llmProvider: "openai",
  llmModel: "gpt-5.6-luna",
  llmBaseUrl: "https://api.openai.com/v1/responses",
  aiIdleRatio: 0.5,
  weatherEnabled: false,
  weatherCity: "",
});

export function loadOCProfile(): OCProfile {
  const fallback = defaultOCProfile();
  try {
    const parsed = JSON.parse(localStorage.getItem(OC_PROFILE_KEY) ?? "null") as Partial<OCProfile> | null;
    if (!parsed || typeof parsed !== "object") return fallback;
    return {
      ...fallback,
      ...parsed,
      personality: Array.isArray(parsed.personality) ? parsed.personality.filter((item): item is string => typeof item === "string") : fallback.personality,
      catchphrases: Array.isArray(parsed.catchphrases) ? parsed.catchphrases.filter((item): item is string => typeof item === "string") : fallback.catchphrases,
      keywordReplies: parsed.keywordReplies && typeof parsed.keywordReplies === "object" ? parsed.keywordReplies : fallback.keywordReplies,
    };
  } catch {
    return fallback;
  }
}

export function saveOCProfile(profile: OCProfile) {
  localStorage.setItem(OC_PROFILE_KEY, JSON.stringify(profile));
}

const DB_NAME = "lotus-desk-pet";
const STORE_NAME = "oc-assets";
const IMAGE_KEY = "active-character";

function openAssetDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadOCImage(): Promise<string | null> {
  try {
    const database = await openAssetDatabase();
    return await new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(IMAGE_KEY);
      request.onsuccess = () => resolve(typeof request.result === "string" ? request.result : null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

export async function saveOCImage(dataUrl: string | null): Promise<void> {
  const database = await openAssetDatabase();
  await new Promise<void>((resolve, reject) => {
    const store = database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME);
    const request = dataUrl ? store.put(dataUrl, IMAGE_KEY) : store.delete(IMAGE_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
