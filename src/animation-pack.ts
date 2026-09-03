export type OCLayerRole = "background" | "hair-back" | "body" | "head" | "eyes" | "mouth" | "hair-front" | "accessory" | "foreground" | "static";

export interface OCLayer {
  id: string;
  name: string;
  role: OCLayerRole;
  zIndex: number;
  anchorX: number;
  anchorY: number;
  dataUrl: string;
}

export interface OCAnimationPack {
  version: 1;
  name: string;
  canvas: { width: number; height: number };
  layers: OCLayer[];
  importedAt: number;
  source: "manifest" | "inferred";
}

interface ManifestLayer {
  id?: string;
  name?: string;
  file: string;
  role?: OCLayerRole;
  zIndex?: number;
  anchorX?: number;
  anchorY?: number;
}

interface PackManifest {
  version?: number;
  name?: string;
  canvas?: { width?: number; height?: number };
  layers?: ManifestLayer[];
}

const DB_NAME = "lotus-desk-pet";
const STORE_NAME = "oc-assets";
const PACK_KEY = "active-animation-pack";

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

export async function loadAnimationPack(): Promise<OCAnimationPack | null> {
  try {
    const database = await openAssetDatabase();
    return await new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(PACK_KEY);
      request.onsuccess = () => resolve(request.result && typeof request.result === "object" ? request.result as OCAnimationPack : null);
      request.onerror = () => reject(request.error);
    });
  } catch { return null; }
}

export async function saveAnimationPack(pack: OCAnimationPack | null): Promise<void> {
  const database = await openAssetDatabase();
  await new Promise<void>((resolve, reject) => {
    const store = database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME);
    const request = pack ? store.put(pack, PACK_KEY) : store.delete(PACK_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

const readAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

function roleFromName(name: string): OCLayerRole {
  const value = name.toLowerCase();
  if (/background|背景|bg/.test(value)) return "background";
  if (/back.?hair|后发|后髮/.test(value)) return "hair-back";
  if (/front.?hair|前发|前髮|bang/.test(value)) return "hair-front";
  if (/eye|眼/.test(value)) return "eyes";
  if (/mouth|嘴|口/.test(value)) return "mouth";
  if (/head|face|头|頭|脸|臉/.test(value)) return "head";
  if (/body|身体|身體|torso/.test(value)) return "body";
  if (/foreground|前景/.test(value)) return "foreground";
  if (/accessory|饰品|飾品|装饰|裝飾/.test(value)) return "accessory";
  return "static";
}

const defaultZ: Record<OCLayerRole, number> = {
  background: 0, "hair-back": 10, body: 20, head: 30, eyes: 40, mouth: 42, "hair-front": 50, accessory: 60, foreground: 70, static: 25,
};

function isLayerRole(value: unknown): value is OCLayerRole {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(defaultZ, value);
}

function normalizePath(value: string) { return value.replaceAll("\\", "/").replace(/^\.\//, "").toLowerCase(); }

export async function parseAnimationFolder(files: FileList | File[]): Promise<OCAnimationPack> {
  const allFiles = Array.from(files);
  const imageFiles = allFiles.filter((file) => /^image\/(png|webp)$/.test(file.type) || /\.(png|webp)$/i.test(file.name));
  if (!imageFiles.length) throw new Error("动画包里没有找到 PNG 或 WebP 图层。");
  if (imageFiles.length > 64) throw new Error("基础版单个动画包最多支持 64 个图层。");
  if (imageFiles.reduce((total, file) => total + file.size, 0) > 80 * 1024 * 1024) throw new Error("动画包超过 80 MB，请先压缩图层图片。");
  const manifestFile = allFiles.find((file) => /(^|\/)oc-package\.json$/i.test(file.webkitRelativePath || file.name));
  const imageMap = new Map<string, File>();
  imageFiles.forEach((file) => {
    const relative = normalizePath(file.webkitRelativePath || file.name);
    imageMap.set(relative, file);
    imageMap.set(normalizePath(file.name), file);
    const parts = relative.split("/");
    if (parts.length > 1) imageMap.set(parts.slice(1).join("/"), file);
  });

  let manifest: PackManifest | null = null;
  if (manifestFile) {
    try { manifest = JSON.parse(await manifestFile.text()) as PackManifest; }
    catch { throw new Error("oc-package.json 不是有效的 JSON。"); }
  }

  const manifestLayers: ManifestLayer[] = manifest?.layers?.length
    ? manifest.layers
    : imageFiles.map((file, index) => ({ file: file.webkitRelativePath || file.name, zIndex: index }));
  const layers: OCLayer[] = [];
  for (const [index, item] of manifestLayers.entries()) {
    const requested = normalizePath(item.file);
    const file = imageMap.get(requested) || imageMap.get(requested.split("/").pop() || requested);
    if (!file) throw new Error(`缺少图层文件：${item.file}`);
    const inferredRole = roleFromName(item.name || item.file);
    const role = isLayerRole(item.role) ? item.role : inferredRole;
    layers.push({
      id: item.id || `layer-${index + 1}`,
      name: item.name || file.name.replace(/\.[^.]+$/, ""),
      role,
      zIndex: Number.isFinite(item.zIndex) ? Number(item.zIndex) : defaultZ[role] + index,
      anchorX: Math.max(0, Math.min(100, Number.isFinite(item.anchorX) ? Number(item.anchorX) : 50)),
      anchorY: Math.max(0, Math.min(100, Number.isFinite(item.anchorY) ? Number(item.anchorY) : role === "eyes" || role === "mouth" || role === "head" ? 42 : 72)),
      dataUrl: await readAsDataUrl(file),
    });
  }

  return {
    version: 1,
    name: manifest?.name || (allFiles[0]?.webkitRelativePath.split("/")[0] || "未命名 OC 动画包"),
    canvas: { width: Number(manifest?.canvas?.width) || 1200, height: Number(manifest?.canvas?.height) || 1500 },
    layers: layers.sort((a, b) => a.zIndex - b.zIndex),
    importedAt: Date.now(),
    source: manifest ? "manifest" : "inferred",
  };
}

export function packSummary(pack: OCAnimationPack) {
  const animated = new Set(pack.layers.map((layer) => layer.role).filter((role) => role !== "static" && role !== "background" && role !== "foreground"));
  return `${pack.layers.length} 个图层 · ${animated.size} 类基础动效`;
}
