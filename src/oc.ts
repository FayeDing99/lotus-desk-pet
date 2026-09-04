import type { OCAnimationPack } from "./animation-pack";

export const OC_PROFILE_KEY = "lotus-desk-pet/oc-profile/v1";

export const SNACK_ITEM_KEYS = ["apple", "cookie", "parfait"] as const;
export const PROP_ITEM_KEYS = ["umbrella", "charm", "sword"] as const;
export const INVENTORY_ITEM_KEYS = [...SNACK_ITEM_KEYS, ...PROP_ITEM_KEYS] as const;
export type InventoryItemKey = typeof INVENTORY_ITEM_KEYS[number];
export type InventoryItemKind = "snack" | "prop";

export interface InventoryItemDefinition {
  kind: InventoryItemKind;
  name: string;
  satiety: number;
  mood: number;
  energy: number;
  affection: number;
  lines: string[];
}

export type InventoryCatalog = Record<InventoryItemKey, InventoryItemDefinition>;

export const defaultInventoryCatalog = (): InventoryCatalog => ({
  apple: { kind: "snack", name: "青苹果", satiety: 12, mood: 2, energy: 0, affection: 1, lines: ["青苹果脆脆的，谢谢你。"] },
  cookie: { kind: "snack", name: "莲花酥", satiety: 8, mood: 5, energy: 0, affection: 1, lines: ["莲花酥好香，要不要也分你一小块？"] },
  parfait: { kind: "snack", name: "草莓芭菲", satiety: 18, mood: 12, energy: 0, affection: 1, lines: ["草莓甜甜的，今天的心情也变好啦。"] },
  umbrella: { kind: "prop", name: "荷叶伞", satiety: 0, mood: 3, energy: 0, affection: 1, lines: ["荷叶伞撑开啦，雨水就落不到这里了。"] },
  charm: { kind: "prop", name: "莲纹香囊", satiety: 0, mood: 4, energy: 2, affection: 1, lines: ["香囊里有很淡的莲香，闻起来很安心。"] },
  sword: { kind: "prop", name: "小木剑", satiety: 0, mood: 2, energy: 3, affection: 1, lines: ["别担心，小木剑也会认真保护你的。"] },
});

export interface OCProfile {
  id: string;
  name: string;
  addressName: string;
  selfReference: string;
  persona: string;
  catchphrases: string[];
  dialogueScripts: Record<string, string[]>;
  proactiveMinutes: number;
  sedentaryEnabled: boolean;
  sedentaryMinutes: number;
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
  inventoryCatalog: InventoryCatalog;
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
  selfReference: "我",
  persona: "温柔安静，偶尔有一点俏皮。喜欢荷花、清茶和安静的陪伴；关心人但不会频繁催促，说话自然、轻柔而简短。",
  catchphrases: ["慢慢来，我在这里。", "要一起喝杯茶吗？"],
  dialogueScripts: {},
  proactiveMinutes: 30,
  sedentaryEnabled: true,
  sedentaryMinutes: 60,
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
  inventoryCatalog: defaultInventoryCatalog(),
});

export function normalizeInventoryCatalog(input: Partial<InventoryCatalog> | undefined, fallback: InventoryCatalog): InventoryCatalog {
  return Object.fromEntries(INVENTORY_ITEM_KEYS.map((key) => {
    const item = input?.[key];
    const base = fallback[key];
    return [key, {
      kind: base.kind,
      name: typeof item?.name === "string" && item.name.trim() ? item.name.trim().slice(0, 20) : base.name,
      satiety: typeof item?.satiety === "number" && Number.isFinite(item.satiety) ? item.satiety : base.satiety,
      mood: typeof item?.mood === "number" && Number.isFinite(item.mood) ? item.mood : base.mood,
      energy: typeof item?.energy === "number" && Number.isFinite(item.energy) ? item.energy : base.energy,
      affection: typeof item?.affection === "number" && Number.isFinite(item.affection) ? item.affection : base.affection,
      lines: Array.isArray(item?.lines) ? item.lines.filter((line): line is string => typeof line === "string" && Boolean(line.trim())).map((line) => line.trim()).slice(0, 12) : base.lines,
    }];
  })) as InventoryCatalog;
}

export function loadOCProfile(): OCProfile {
  const fallback = defaultOCProfile();
  try {
    const parsed = JSON.parse(localStorage.getItem(OC_PROFILE_KEY) ?? "null") as (Partial<OCProfile> & {
      personality?: string[];
      tone?: string;
    }) | null;
    if (!parsed || typeof parsed !== "object") return fallback;
    const legacyPersona = [
      Array.isArray(parsed.personality) ? parsed.personality.filter((item): item is string => typeof item === "string").join("、") : "",
      typeof parsed.tone === "string" ? parsed.tone : "",
    ].filter(Boolean).join("；");
    return {
      ...fallback,
      ...parsed,
      selfReference: typeof parsed.selfReference === "string" ? parsed.selfReference : fallback.selfReference,
      persona: typeof parsed.persona === "string" && parsed.persona.trim() ? parsed.persona : legacyPersona || fallback.persona,
      catchphrases: Array.isArray(parsed.catchphrases) ? parsed.catchphrases.filter((item): item is string => typeof item === "string") : fallback.catchphrases,
      dialogueScripts: parsed.dialogueScripts && typeof parsed.dialogueScripts === "object" ? parsed.dialogueScripts : fallback.dialogueScripts,
      inventoryCatalog: normalizeInventoryCatalog(parsed.inventoryCatalog, fallback.inventoryCatalog),
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
