export type OCLayerRole = "background" | "hair-back" | "body" | "head" | "eyes" | "mouth" | "hair-front" | "accessory" | "foreground" | "static";
export type OCExpressionVariant = "idle" | "blink" | "happy" | "annoyed" | "surprised";

export interface OCLayer {
  id: string;
  name: string;
  role: OCLayerRole;
  zIndex: number;
  anchorX: number;
  anchorY: number;
  dataUrl: string;
  variant?: OCExpressionVariant;
}

export interface OCAnimationPack {
  version: 1;
  name: string;
  canvas: { width: number; height: number };
  layers: OCLayer[];
  importedAt: number;
  source: "manifest" | "inferred" | "psd";
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
  if (/accessory|饰品|飾品|装饰|裝飾|发饰|髮飾|头饰|頭飾|服饰|服飾|眼镜|眼鏡/.test(value)) return "accessory";
  if (/head|face|头|頭|脸|臉/.test(value)) return "head";
  if (/body|身体|身體|torso|人物主体|人物主體|躯干|軀幹/.test(value)) return "body";
  if (/foreground|前景/.test(value)) return "foreground";
  return "static";
}

function expressionVariantFromName(name: string): OCExpressionVariant | null {
  const value = name.toLowerCase();
  if (/(睁眼|开眼|開眼|open.?eye|neutral|default|待机|待機|idle)/.test(value)) return "idle";
  if (/(闭眼|閉眼|close.?eye|blink)/.test(value)) return "blink";
  if (/(微笑|开心|開心|笑|happy|smile)/.test(value)) return "happy";
  if (/(无语|無語|生气|生氣|angry|annoy|speechless)/.test(value)) return "annoyed";
  if (/(呆住|惊讶|驚訝|震惊|surprise|stun)/.test(value)) return "surprised";
  return null;
}

const PSD_MAX_FILE_BYTES = 160 * 1024 * 1024;
const PSD_MAX_MEMORY_BYTES = 512 * 1024 * 1024;
const PSD_MAX_CANVAS_PIXELS = 32_000_000;
const PSD_MAX_LAYERS = 64;

type PsdLayer = import("ag-psd").Layer;
type PsdLeaf = { layer: PsdLayer; path: string; opacity: number };

function normalizedPsdOpacity(value: number | undefined) {
  if (value === undefined) return 1;
  return Math.max(0, Math.min(1, value > 1 ? value / 255 : value));
}

function visiblePsdLeaves(layers: PsdLayer[], parentPath = "", parentVisible = true, parentOpacity = 1): PsdLeaf[] {
  const leaves: PsdLeaf[] = [];
  for (const layer of layers) {
    const name = layer.name?.trim() || "未命名图层";
    const path = parentPath ? `${parentPath}/${name}` : name;
    const opacity = parentOpacity * normalizedPsdOpacity(layer.opacity);
    const visible = parentVisible && layer.hidden !== true && opacity > 0;
    if (layer.children?.length) leaves.push(...visiblePsdLeaves(layer.children, path, visible, opacity));
    else if (visible) leaves.push({ layer, path, opacity });
  }
  return leaves;
}

function canvasHasVisiblePixels(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return false;
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 3; index < pixels.length; index += 4) if (pixels[index]! > 4) return true;
  return false;
}

function canvasToPngDataUrl(canvas: HTMLCanvasElement) {
  return new Promise<string>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error("PSD 图层无法转换为 PNG。")); return; }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error("PSD 图层读取失败。"));
      reader.readAsDataURL(blob);
    }, "image/png");
  });
}

async function renderPsdLeaves(
  leaves: PsdLeaf[],
  width: number,
  height: number,
  getLayerCanvas: typeof import("ag-psd").getLayerCanvas,
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前系统无法创建 PSD 图层画布。");
  let painted = false;
  for (const item of leaves) {
    const source = getLayerCanvas(item.layer) ?? item.layer.canvas;
    if (!source?.width || !source.height || !canvasHasVisiblePixels(source)) { item.layer.rawData = undefined; continue; }
    context.globalAlpha = item.opacity;
    const fullCanvasLayer = source.width === width && source.height === height;
    context.drawImage(source, fullCanvasLayer ? 0 : (item.layer.left ?? 0), fullCanvasLayer ? 0 : (item.layer.top ?? 0));
    item.layer.rawData = undefined;
    painted = true;
  }
  return painted ? canvasToPngDataUrl(canvas) : null;
}

function readablePsdError(error: unknown) {
  const message = error instanceof Error ? error.message.trim() : "";
  if (/^(PSD |这个 PSD|当前系统)/.test(message)) return message;
  if (/memory|allocation|array buffer/i.test(message)) return "PSD 解析时内存不足，请关闭大型应用后重试，或在 Photoshop 中合并无需动画的图层。";
  if (/signature|invalid file|unexpected end|offset/i.test(message)) return "PSD 文件结构无法读取，请在 Photoshop 中另存为标准 PSD 后重试。";
  if (/color mode|bitsperchannel|channel not supported/i.test(message)) return "PSD 的颜色模式或位深不受支持，请转换为 RGB、8 位/通道后重试。";
  return message ? `PSD 解析失败：${message.slice(0, 96)}。请在 Photoshop 中重新保存后再试。` : "PSD 没有解析成功，请确认它是未损坏的 RGB 分层 PSD。";
}

export async function parsePsdFile(file: File): Promise<OCAnimationPack> {
  if (!/\.psd$/i.test(file.name) && file.type !== "image/vnd.adobe.photoshop") throw new Error("请选择 .psd 分层文件。");
  if (!file.size) throw new Error("这个 PSD 是空文件。");
  if (file.size > PSD_MAX_FILE_BYTES) throw new Error("PSD 超过 160 MB，请先删除无用图层或缩小画布。");

  try {
    const [{ readPsd, getLayerCanvas }, buffer] = await Promise.all([import("ag-psd"), file.arrayBuffer()]);
    const psd = readPsd(buffer, {
      skipCompositeImageData: true,
      skipThumbnail: true,
      skipLinkedFilesData: true,
      useRawData: true,
      totalMemoryLimit: PSD_MAX_MEMORY_BYTES,
    });
    const width = Math.round(psd.width);
    const height = Math.round(psd.height);
    if (!width || !height) throw new Error("PSD 没有有效的画布尺寸。");
    if (width * height > PSD_MAX_CANVAS_PIXELS) throw new Error("PSD 画布过大，请将总像素控制在 3200 万以内。");

    // Photoshop stores siblings from top to bottom. Reverse them so increasing
    // z-index paints the document from its bottom layer to its top layer.
    const rootLayers = psd.children ?? [];
    const expressionGroups = rootLayers.flatMap((layer) => {
      const variant = layer.children?.length ? expressionVariantFromName(layer.name ?? "") : null;
      return variant && layer.hidden !== true ? [{ layer, variant }] : [];
    });
    const hasExpressionGroups = new Set(expressionGroups.map(({ variant }) => variant)).size >= 2;
    const leaves = visiblePsdLeaves(rootLayers).reverse();
    if (!leaves.length) throw new Error("PSD 中没有找到可见图层。");
    if (!hasExpressionGroups && leaves.length > PSD_MAX_LAYERS) throw new Error(`PSD 有 ${leaves.length} 个可见图层，基础版最多支持 ${PSD_MAX_LAYERS} 个。`);
    if (hasExpressionGroups && leaves.length > 160) throw new Error(`PSD 有 ${leaves.length} 个表情源图层，请先合并到 160 个以内。`);

    const layers: OCLayer[] = [];
    let encodedCharacters = 0;
    if (hasExpressionGroups) {
      const selectedGroups = new Map<OCExpressionVariant, PsdLayer>();
      for (const item of expressionGroups) if (!selectedGroups.has(item.variant)) selectedGroups.set(item.variant, item.layer);
      if (!selectedGroups.has("idle")) {
        const first = selectedGroups.entries().next().value as [OCExpressionVariant, PsdLayer] | undefined;
        if (first) { selectedGroups.delete(first[0]); selectedGroups.set("idle", first[1]); }
      }
      const expressionRoots = new Set(expressionGroups.map(({ layer }) => layer));
      const commonLeaves = visiblePsdLeaves(rootLayers.filter((layer) => !expressionRoots.has(layer))).reverse();
      if (commonLeaves.length) {
        const dataUrl = await renderPsdLeaves(commonLeaves, width, height, getLayerCanvas);
        if (dataUrl) {
          encodedCharacters += dataUrl.length;
          layers.push({ id: "psd-common", name: "公用图层", role: "static", zIndex: -1, anchorX: 50, anchorY: 72, dataUrl });
        }
      }
      const priority: OCExpressionVariant[] = ["idle", "blink", "happy", "surprised", "annoyed"];
      for (const [index, variant] of priority.entries()) {
        const group = selectedGroups.get(variant);
        if (!group) continue;
        const dataUrl = await renderPsdLeaves(visiblePsdLeaves([group]).reverse(), width, height, getLayerCanvas);
        if (!dataUrl) continue;
        encodedCharacters += dataUrl.length;
        layers.push({ id: `psd-expression-${variant}`, name: group.name?.trim() || variant, role: "static", variant, zIndex: index, anchorX: 50, anchorY: 72, dataUrl });
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
    } else {
      for (const [index, item] of leaves.entries()) {
        const dataUrl = await renderPsdLeaves([item], width, height, getLayerCanvas);
        if (!dataUrl) continue;
        encodedCharacters += dataUrl.length;
        const role = roleFromName(item.path);
        layers.push({
          id: `psd-layer-${index + 1}`,
          name: item.layer.name?.trim() || `图层 ${index + 1}`,
          role,
          zIndex: index,
          anchorX: 50,
          anchorY: role === "eyes" || role === "mouth" || role === "head" ? 42 : 72,
          dataUrl,
        });
        if ((index + 1) % 4 === 0) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
    }
    if (encodedCharacters > 120 * 1024 * 1024) throw new Error("PSD 解析后的图层过大，请合并无需动画的图层后再导入。");
    if (!layers.length) throw new Error("PSD 的可见图层里没有可读取的像素内容。");

    return {
      version: 1,
      name: file.name.replace(/\.psd$/i, ""),
      canvas: { width, height },
      layers,
      importedAt: Date.now(),
      source: "psd",
    };
  } catch (error) {
    throw new Error(readablePsdError(error));
  }
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
  const expressions = new Set(pack.layers.map((layer) => layer.variant).filter(Boolean));
  if (expressions.size) return `${pack.layers.length} 个合成图层 · ${expressions.size} 组表情动作`;
  return `${pack.layers.length} 个图层 · ${animated.size} 类基础动效`;
}
