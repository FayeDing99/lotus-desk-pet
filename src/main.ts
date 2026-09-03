import petImageUrl from "../assets/plates/character.png";
import speechBubbleUrl from "../assets/plates/speech-sheet.png";
import packageInfo from "../package.json";
import "@fontsource/noto-sans-sc/chinese-simplified-400.css";
import "@fontsource/noto-sans-sc/chinese-simplified-500.css";
import "@fontsource/noto-serif-sc/chinese-simplified-400.css";
import "@fontsource/noto-serif-sc/chinese-simplified-600.css";
import "@phosphor-icons/web/regular";
import type dialogueShape from "../public/dialogue.json";
import { loadAnimationPack, packSummary, parseAnimationFolder, saveAnimationPack, type OCAnimationPack } from "./animation-pack";
import {
  defaultOCProfile,
  fileToDataUrl,
  loadOCImage,
  loadOCProfile,
  saveOCImage,
  saveOCProfile,
  type OCPack,
  type OCProfile,
} from "./oc";
import { generateOCLine, providerDefaults } from "./llm";
import { DAILY_POINT_CAP, affectionLabel, applyElapsedDecay, awardInteractionPoint, loadPetState, savePetState, type PetState } from "./state";
import { fetchWeather, type WeatherContext } from "./weather";
import { findAppUpdate, installAppUpdate, isDesktopRuntime, type DownloadEvent, type Update } from "./updater";
import "./styles.css";

type PanelName = "dialogue" | "status" | "wallet" | "story" | null;
type FoodKey = keyof PetState["inventory"];
type DialogueLibrary = typeof dialogueShape;

const library = await fetch("/dialogue.json").then(async (response) => {
  if (!response.ok) throw new Error("无法读取本地话库 dialogue.json");
  return response.json() as Promise<DialogueLibrary>;
});

const app = document.querySelector<HTMLDivElement>("#app")!;
if (!app) throw new Error("找不到桌宠挂载点");

const icon = (name: string) => `<i class="ph ph-${name}" aria-hidden="true"></i>`;
const icons = {
  chat: icon("chat-circle-dots"), status: icon("heartbeat"), wallet: icon("basket"), story: icon("notebook"),
  apple: icon("plant"), cookie: icon("cookie"), parfait: icon("ice-cream"), heart: icon("heart"),
  satiety: icon("bowl-food"), energy: icon("sparkle"), affection: icon("flower-lotus"), points: icon("seal-check"),
  close: icon("x"), send: icon("paper-plane-tilt"), upload: icon("upload-simple"), reset: icon("arrow-counter-clockwise"),
  export: icon("download-simple"), import: icon("file-arrow-up"),
  cloud: icon("cloud-sun"), key: icon("key"), test: icon("plugs-connected"),
  layers: icon("stack"), folder: icon("folder-open"),
  update: icon("arrows-clockwise"),
};

app.innerHTML = `
  <main class="pet-window" aria-label="荷间小主人桌宠" data-pet-window>
    <section class="speech-sheet is-visible" data-bubble aria-live="polite">
      <img class="speech-plate" src="${speechBubbleUrl}" alt="" aria-hidden="true" />
      <p class="speech-text" data-bubble-text>要一起喝杯茶吗？</p>
    </section>

    <div class="pet-layer" data-pet-layer>
      <button class="pet-hit-area" type="button" data-pet aria-label="桌宠；左键戳一戳，右键打开功能轮盘，拖动可移动">
        <span class="pet-motion" data-pet-motion>
          <span class="character-stage" data-character-stage>
            <img class="character-plate" data-character src="${petImageUrl}" alt="坐在荷叶下喝茶的荷间小主人" draggable="false" />
          </span>
        </span>
      </button>
      <span class="click-bloom" data-click-bloom aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
      <span class="point-pop" data-point-pop aria-hidden="true">+1</span>
    </div>

    <nav class="action-wheel" data-wheel aria-label="桌宠功能" hidden>
      <span class="wheel-ripple" aria-hidden="true"></span>
      <button type="button" data-action="dialogue" data-direction="top">${icons.chat}<span>聊天</span></button>
      <button type="button" data-action="status" data-direction="right">${icons.status}<span>状态</span></button>
      <button type="button" data-action="wallet" data-direction="bottom">${icons.wallet}<span>荷包</span></button>
      <button type="button" data-action="story" data-direction="left">${icons.story}<span>话本</span></button>
    </nav>

    <section class="status-cluster floating-panel" data-status-panel aria-label="桌宠状态" hidden>
      <header><h2 data-level-heading>Lv.1 陌生</h2><button type="button" class="panel-close" data-close-panel aria-label="关闭状态">${icons.close}</button></header>
      <div class="status-values">
        <div>${icons.heart}<span>心情</span><output data-value="mood">82</output></div>
        <div>${icons.satiety}<span>饱腹</span><output data-value="satiety">68</output></div>
        <div>${icons.energy}<span>精力</span><output data-value="energy">74</output></div>
        <div>${icons.affection}<span>亲密</span><output data-affection>0</output></div>
      </div>
      <footer>${icons.points}<span>今日 <b data-daily-points>0</b>/${DAILY_POINT_CAP}</span><span>荷露 <b data-points>0</b></span></footer>
    </section>

    <form class="chat-dock floating-panel" data-dialogue-form aria-label="和桌宠聊天" hidden>
      <label class="sr-only" for="pet-message">输入想说的话</label>
      <input id="pet-message" maxlength="80" autocomplete="off" placeholder="和她说点什么…" />
      <button type="submit" aria-label="发送">${icons.send}</button>
    </form>

    <section class="wallet-panel floating-panel" data-wallet-panel aria-label="荷包与点心" hidden>
      <header><div><h2>荷包</h2><p data-wallet-note>点心可以购买，也可以直接投喂。</p></div><button type="button" class="panel-close" data-close-panel aria-label="关闭荷包">${icons.close}</button></header>
      <div class="wallet-balance">${icons.points}<span>荷露</span><strong data-wallet-points>0</strong></div>
      <div class="food-list">
        <article>${icons.apple}<div><strong>青苹果</strong><span>清甜 · 饱腹 +12</span></div><b>×<span data-food-count="apple">0</span></b><div class="food-actions"><button type="button" data-food="apple" data-operation="feed">喂食</button><button type="button" data-food="apple" data-operation="buy">5 荷露</button></div></article>
        <article>${icons.cookie}<div><strong>莲花酥</strong><span>酥香 · 心情 +5</span></div><b>×<span data-food-count="cookie">0</span></b><div class="food-actions"><button type="button" data-food="cookie" data-operation="feed">喂食</button><button type="button" data-food="cookie" data-operation="buy">8 荷露</button></div></article>
        <article>${icons.parfait}<div><strong>草莓芭菲</strong><span>特别奖励 · 心情 +12</span></div><b>×<span data-food-count="parfait">0</span></b><div class="food-actions"><button type="button" data-food="parfait" data-operation="feed">喂食</button><button type="button" data-food="parfait" data-operation="buy">15 荷露</button></div></article>
      </div>
    </section>

    <section class="story-panel floating-panel" data-story-panel aria-label="OC 性格话本" hidden>
      <header><div><h2>OC 话本</h2><p>形象、性格和说话方式都收在这里。</p></div><button type="button" class="panel-close" data-close-panel aria-label="关闭话本">${icons.close}</button></header>
      <form data-story-form>
        <div class="story-scroll">
          <label class="image-drop" data-image-drop tabindex="0">${icons.upload}<span><strong>更换 OC 图片</strong><small>PNG / WebP，可拖入</small></span><input type="file" accept="image/png,image/webp" data-character-file hidden /></label>
          <div class="animation-import-row">
            <label class="animation-drop" data-animation-drop tabindex="0">${icons.layers}<span><strong>导入 OC 动画包</strong><small data-animation-status>选择包含分层图片的文件夹</small></span>${icons.folder}<input type="file" accept="image/png,image/webp,application/json" multiple webkitdirectory data-animation-files hidden /></label>
            <button type="button" class="clear-animation" data-clear-animation hidden>改用单图</button>
          </div>
          <div class="field-pair"><label>OC 名字<input name="name" maxlength="24" /></label><label>如何称呼你<input name="addressName" maxlength="16" /></label></div>
          <label>性格标签<input name="personality" maxlength="80" placeholder="温柔、安静、有一点俏皮" /></label>
          <label>说话语气<input name="tone" maxlength="120" /></label>
          <label>口头禅<textarea name="catchphrases" rows="2" placeholder="一行一句"></textarea></label>
          <label>关键词回复<textarea name="keywordReplies" rows="3" placeholder="关键词 = 回复一 | 回复二"></textarea></label>
          <div class="range-grid">
            <label>大小 <output data-range-output="imageScale">100%</output><input type="range" name="imageScale" min="70" max="135" step="1" /></label>
            <label>左右 <output data-range-output="imageX">0</output><input type="range" name="imageX" min="-20" max="20" step="1" /></label>
            <label>上下 <output data-range-output="imageY">0</output><input type="range" name="imageY" min="-20" max="20" step="1" /></label>
          </div>
          <label class="frequency-field">主动说话间隔 <span><input type="number" name="proactiveMinutes" min="10" max="120" step="5" /> 分钟</span></label>
          <details class="model-settings" data-model-settings>
            <summary>${icons.cloud}<span>大模型与实时内容</span><small data-connection-badge>未启用</small></summary>
            <div class="model-settings-body">
              <label class="toggle-row"><span><strong>启用大模型</strong><small>聊天优先使用模型，失败自动回退话本</small></span><input type="checkbox" name="aiEnabled" /></label>
              <div class="field-pair">
                <label>服务商<select name="llmProvider"><option value="openai">OpenAI</option><option value="anthropic">Claude</option><option value="deepseek">DeepSeek</option><option value="compatible">兼容接口</option></select></label>
                <label>模型名称<input name="llmModel" autocomplete="off" /></label>
              </div>
              <label>接口地址<input name="llmBaseUrl" inputmode="url" autocomplete="off" /></label>
              <label>API Key（仅本次运行）<span class="secret-field">${icons.key}<input type="password" data-api-key autocomplete="off" placeholder="留空则读取系统环境变量" /></span></label>
              <label class="ratio-field">待机内容 <span><input type="range" name="aiIdleRatio" min="0" max="100" step="10" /><output data-range-output="aiIdleRatio">50% 模型</output></span></label>
              <label class="toggle-row"><span><strong>实时天气</strong><small>用于天气提醒和模型上下文</small></span><input type="checkbox" name="weatherEnabled" /></label>
              <label>天气城市<input name="weatherCity" autocomplete="off" placeholder="例如：杭州、西安、New York" /></label>
              <div class="connection-row"><button type="button" data-test-api>${icons.test}<span>测试连接</span></button><p data-connection-status>密钥不会写入话本或导出文件。</p></div>
            </div>
          </details>
          <div class="app-update-row">
            ${icons.update}<span><strong>应用更新</strong><small data-update-status>当前版本 v${packageInfo.version}</small></span>
            <button type="button" data-check-update>检查更新</button>
          </div>
        </div>
        <footer class="story-actions">
          <button type="button" data-reset-image>${icons.reset}<span>原图</span></button>
          <button type="button" data-export-oc>${icons.export}<span>导出</span></button>
          <label>${icons.import}<span>导入</span><input type="file" accept="application/json" data-import-oc hidden /></label>
          <button class="primary-action" type="submit">保存话本</button>
        </footer>
      </form>
    </section>
  </main>`;

let state: PetState = applyElapsedDecay(loadPetState());
let profile: OCProfile = loadOCProfile();
let activePanel: PanelName = null;
let bubbleTimer: number | undefined;
let ambientTimer: number | undefined;
let livingTimer: number | undefined;
let weatherTimer: number | undefined;
let dragStart: { x: number; y: number; left: number; top: number } | null = null;
let dragged = false;
let nativeDragStarted = false;
let customImageDataUrl: string | null = await loadOCImage();
let animationPack: OCAnimationPack | null = await loadAnimationPack();
let currentWeather: WeatherContext | null = null;
let llmInFlight = false;
let availableUpdate: Update | null = null;
let updateInFlight = false;

const petWindow = app.querySelector<HTMLElement>("[data-pet-window]")!;
const bubbleText = app.querySelector<HTMLElement>("[data-bubble-text]")!;
const pet = app.querySelector<HTMLButtonElement>("[data-pet]")!;
const petLayer = app.querySelector<HTMLElement>("[data-pet-layer]")!;
const petMotion = app.querySelector<HTMLElement>("[data-pet-motion]")!;
const characterStage = app.querySelector<HTMLElement>("[data-character-stage]")!;
const character = app.querySelector<HTMLImageElement>("[data-character]")!;
const wheel = app.querySelector<HTMLElement>("[data-wheel]")!;
const statusPanel = app.querySelector<HTMLElement>("[data-status-panel]")!;
const dialogueForm = app.querySelector<HTMLFormElement>("[data-dialogue-form]")!;
const messageInput = dialogueForm.querySelector<HTMLInputElement>("input")!;
const walletPanel = app.querySelector<HTMLElement>("[data-wallet-panel]")!;
const storyPanel = app.querySelector<HTMLElement>("[data-story-panel]")!;
const storyForm = app.querySelector<HTMLFormElement>("[data-story-form]")!;
const pointPop = app.querySelector<HTMLElement>("[data-point-pop]")!;
const clickBloom = app.querySelector<HTMLElement>("[data-click-bloom]")!;
const apiKeyInput = app.querySelector<HTMLInputElement>("[data-api-key]")!;
const connectionStatus = app.querySelector<HTMLElement>("[data-connection-status]")!;
const connectionBadge = app.querySelector<HTMLElement>("[data-connection-badge]")!;
const animationFilesInput = app.querySelector<HTMLInputElement>("[data-animation-files]")!;
const animationDrop = app.querySelector<HTMLElement>("[data-animation-drop]")!;
const animationStatus = app.querySelector<HTMLElement>("[data-animation-status]")!;
const clearAnimationButton = app.querySelector<HTMLButtonElement>("[data-clear-animation]")!;
const updateStatus = app.querySelector<HTMLElement>("[data-update-status]")!;
const updateButton = app.querySelector<HTMLButtonElement>("[data-check-update]")!;

const foodDetails: Record<FoodKey, { name: string; satiety: number; mood: number; price: number }> = {
  apple: { name: "青苹果", satiety: 12, mood: 2, price: 5 },
  cookie: { name: "莲花酥", satiety: 8, mood: 5, price: 8 },
  parfait: { name: "草莓芭菲", satiety: 18, mood: 12, price: 15 },
};

const randomFrom = (items: readonly string[]) => items[Math.floor(Math.random() * items.length)]!;
const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const clampBetween = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function replayClass(element: HTMLElement, className: string, duration: number) {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  window.setTimeout(() => element.classList.remove(className), duration);
}

function setConnectionState(kind: "idle" | "loading" | "success" | "error", message: string) {
  connectionStatus.dataset.state = kind;
  connectionStatus.textContent = message;
  connectionBadge.dataset.state = kind;
  connectionBadge.textContent = kind === "success" ? "已连接" : kind === "loading" ? "连接中" : kind === "error" ? "需检查" : profile.aiEnabled ? "待连接" : "未启用";
}

function updateDownloadStatus(event: DownloadEvent, progress: { received: number; total: number }) {
  if (event.event === "Started") {
    progress.received = 0;
    progress.total = event.data.contentLength || 0;
    updateStatus.textContent = "正在下载更新…";
  } else if (event.event === "Progress") {
    progress.received += event.data.chunkLength;
    updateStatus.textContent = progress.total
      ? `正在下载 ${Math.min(100, Math.round(progress.received / progress.total * 100))}%`
      : "正在下载更新…";
  } else updateStatus.textContent = "正在安装并重新启动…";
}

async function checkForUpdates(announce: boolean) {
  if (!isDesktopRuntime()) {
    updateStatus.textContent = `当前版本 v${packageInfo.version} · 桌面版可检查`;
    if (announce) showBubble("浏览器预览不会安装更新，请在桌面版中使用。", 6000);
    return;
  }
  if (updateInFlight) return;
  updateInFlight = true;
  updateButton.disabled = true;
  updateStatus.textContent = "正在检查新版本…";
  try {
    availableUpdate = await findAppUpdate();
    if (availableUpdate) {
      updateStatus.textContent = `发现新版本 v${availableUpdate.version}`;
      updateButton.textContent = "立即更新";
      if (announce) showBubble(`发现新版本 ${availableUpdate.version}，可以在话本里更新啦。`, 7000);
    } else {
      updateStatus.textContent = `当前已是最新版 v${packageInfo.version}`;
      updateButton.textContent = "再次检查";
      if (announce) showBubble("现在已经是最新版啦。", 5500);
    }
  } catch (error) {
    updateStatus.textContent = "暂时无法连接更新服务";
    if (announce) showBubble(error instanceof Error ? `检查更新失败：${error.message}` : "检查更新失败，请稍后再试。", 7500);
  } finally {
    updateInFlight = false;
    updateButton.disabled = false;
  }
}

async function applyAvailableUpdate() {
  if (!availableUpdate || updateInFlight) return;
  updateInFlight = true;
  updateButton.disabled = true;
  const progress = { received: 0, total: 0 };
  try {
    await installAppUpdate(availableUpdate, (event) => updateDownloadStatus(event, progress));
  } catch (error) {
    updateStatus.textContent = "更新安装失败，可稍后重试";
    updateButton.disabled = false;
    updateInFlight = false;
    showBubble(error instanceof Error ? `更新没有安装成功：${error.message}` : "更新没有安装成功。", 7500);
  }
}

async function requestModelLine(mode: "chat" | "idle" | "weather" | "test", userPrompt = "") {
  if (!profile.aiEnabled && mode !== "test") throw new Error("大模型尚未启用。");
  return generateOCLine({ profile, state, apiKey: apiKeyInput.value, userPrompt, weather: currentWeather, mode });
}

function playPetReaction(kind: "poke" | "happy") {
  replayClass(petMotion, kind === "poke" ? "is-poked" : "is-happy", kind === "poke" ? 980 : 900);
  replayClass(clickBloom, kind === "poke" ? "is-poke-blooming" : "is-blooming", 900);
}

function applyCharacterAppearance() {
  character.src = customImageDataUrl || petImageUrl;
  character.alt = `${profile.name}的桌宠形象`;
  characterStage.querySelectorAll(".oc-layer").forEach((layer) => layer.remove());
  character.hidden = Boolean(animationPack);
  characterStage.classList.toggle("is-layered", Boolean(animationPack));
  if (animationPack) {
    for (const layer of animationPack.layers) {
      const image = document.createElement("img");
      image.className = "oc-layer";
      image.src = layer.dataUrl;
      image.alt = "";
      image.draggable = false;
      image.dataset.role = layer.role;
      image.style.zIndex = String(layer.zIndex);
      image.style.setProperty("--layer-anchor-x", `${layer.anchorX}%`);
      image.style.setProperty("--layer-anchor-y", `${layer.anchorY}%`);
      characterStage.append(image);
    }
    animationStatus.textContent = `${animationPack.name} · ${packSummary(animationPack)}`;
  } else {
    animationStatus.textContent = "选择包含分层图片的文件夹";
  }
  clearAnimationButton.hidden = !animationPack;
  petLayer.style.setProperty("--oc-scale", String(profile.imageScale));
  petLayer.style.setProperty("--oc-x", `${profile.imageX}%`);
  petLayer.style.setProperty("--oc-y", `${profile.imageY}%`);
  petWindow.setAttribute("aria-label", `${profile.name}桌宠`);
  document.title = profile.name;
}

function renderState() {
  state.mood = clamp(state.mood); state.satiety = clamp(state.satiety); state.energy = clamp(state.energy);
  (["mood", "satiety", "energy"] as const).forEach((key) => {
    app.querySelector<HTMLOutputElement>(`[data-value="${key}"]`)!.value = String(state[key]);
  });
  app.querySelector<HTMLElement>("[data-affection]")!.textContent = String(state.affection);
  app.querySelector<HTMLElement>("[data-points]")!.textContent = String(state.points);
  app.querySelector<HTMLElement>("[data-wallet-points]")!.textContent = String(state.points);
  app.querySelector<HTMLElement>("[data-daily-points]")!.textContent = String(state.dailyPoints);
  app.querySelector<HTMLElement>("[data-level-heading]")!.textContent = affectionLabel(state.affection);
  (Object.keys(state.inventory) as FoodKey[]).forEach((key) => {
    app.querySelector<HTMLElement>(`[data-food-count="${key}"]`)!.textContent = String(state.inventory[key]);
    app.querySelector<HTMLButtonElement>(`[data-food="${key}"][data-operation="feed"]`)!.disabled = state.inventory[key] <= 0;
  });
  savePetState(state);
}

function showBubble(text: string, duration = 8500) {
  window.clearTimeout(bubbleTimer);
  bubbleText.textContent = text;
  replayClass(bubbleText, "is-changing", 420);
  bubbleTimer = window.setTimeout(() => {
    bubbleText.textContent = randomFrom(profile.catchphrases.length ? profile.catchphrases : defaultOCProfile().catchphrases);
  }, duration);
}

function closeWheel() { wheel.hidden = true; wheel.classList.remove("is-open"); }
function hidePanels() {
  activePanel = null; statusPanel.hidden = true; dialogueForm.hidden = true; walletPanel.hidden = true; storyPanel.hidden = true;
}

function openPanel(panel: Exclude<PanelName, null>) {
  hidePanels(); activePanel = panel;
  if (panel === "dialogue") { dialogueForm.hidden = false; window.setTimeout(() => messageInput.focus(), 80); }
  if (panel === "status") statusPanel.hidden = false;
  if (panel === "wallet") walletPanel.hidden = false;
  if (panel === "story") { fillStoryForm(); storyPanel.hidden = false; }
}

function openWheel(clientX: number, clientY: number) {
  hidePanels();
  const rect = petWindow.getBoundingClientRect();
  const radius = Math.min(88, rect.width * 0.19);
  let x = clientX - rect.left; let y = clientY - rect.top;
  const isOverFace = x > rect.width * 0.18 && x < rect.width * 0.59 && y > rect.height * 0.28 && y < rect.height * 0.65;
  if (isOverFace) x = rect.width * 0.78;
  x = clampBetween(x, radius, rect.width - radius);
  y = clampBetween(y, radius + 12, rect.height - radius);
  wheel.style.setProperty("--wheel-x", `${x}px`); wheel.style.setProperty("--wheel-y", `${y}px`);
  wheel.hidden = false; requestAnimationFrame(() => wheel.classList.add("is-open"));
}

function timeGreeting() {
  const hour = new Date().getHours();
  if (hour < 6) return randomFrom(library.time.lateNight);
  if (hour < 11) return randomFrom(library.time.morning);
  if (hour < 17) return randomFrom(library.time.afternoon);
  if (hour < 23) return randomFrom(library.time.evening);
  return randomFrom(library.time.lateNight);
}

function ambientLine() {
  if (state.satiety < 25) return randomFrom(library.state.hungry);
  if (state.energy < 25) return randomFrom(library.state.tired);
  if (state.mood > 82) return randomFrom(library.state.happy);
  if (profile.catchphrases.length && Math.random() < 0.42) return randomFrom(profile.catchphrases);
  return Math.random() < 0.45 ? timeGreeting() : randomFrom(library.general);
}

function replyFor(message: string) {
  const normalized = message.trim().toLowerCase();
  const customMatch = Object.entries(profile.keywordReplies).find(([keywords]) => keywords.split(/[,，/]/).some((keyword) => normalized.includes(keyword.trim().toLowerCase())));
  if (customMatch?.[1]?.length) return randomFrom(customMatch[1]);
  const match = library.keywords.find((entry) => entry.keywords.some((keyword) => normalized.includes(keyword.toLowerCase())));
  return match ? randomFrom(match.replies) : randomFrom(library.fallback);
}

function doPoke() {
  const result = awardInteractionPoint(state); state = result.state; state.mood = clamp(state.mood + 1); state.affection += 1;
  playPetReaction("poke"); pointPop.textContent = result.awarded ? "+1" : "今日已满"; replayClass(pointPop, "is-showing", 1000);
  showBubble(result.awarded ? randomFrom(library.poke) : randomFrom(library.pointCap)); renderState();
}

function scheduleAmbient() {
  window.clearTimeout(ambientTimer);
  const delay = clampBetween(profile.proactiveMinutes, 10, 120) * 60_000 * (0.8 + Math.random() * 0.4);
  ambientTimer = window.setTimeout(async () => {
    if (!activePanel && wheel.hidden) {
      const useAI = profile.aiEnabled && Math.random() < profile.aiIdleRatio;
      if (useAI && !llmInFlight) {
        llmInFlight = true;
        try { showBubble(await requestModelLine("idle"), 10_000); }
        catch { showBubble(ambientLine()); }
        finally { llmInFlight = false; }
      } else showBubble(ambientLine());
    }
    scheduleAmbient();
  }, delay);
}

async function refreshWeather(announce = false) {
  window.clearTimeout(weatherTimer);
  if (!profile.weatherEnabled || !profile.weatherCity.trim()) {
    currentWeather = null;
    weatherTimer = window.setTimeout(() => void refreshWeather(), 30 * 60_000);
    return;
  }
  try {
    currentWeather = await fetchWeather(profile.weatherCity);
    if (announce) {
      if (profile.aiEnabled && !llmInFlight) {
        llmInFlight = true;
        try { showBubble(await requestModelLine("weather"), 10_000); }
        catch { showBubble(`${currentWeather.city}现在${currentWeather.description}，约 ${Math.round(currentWeather.temperature)}℃。`); }
        finally { llmInFlight = false; }
      } else showBubble(`${currentWeather.city}现在${currentWeather.description}，约 ${Math.round(currentWeather.temperature)}℃。`);
    }
  } catch (error) {
    currentWeather = null;
    if (announce) showBubble(error instanceof Error ? error.message : "天气暂时没有更新成功。");
  }
  weatherTimer = window.setTimeout(() => void refreshWeather(), 30 * 60_000);
}

function scheduleLivingMotion() {
  window.clearTimeout(livingTimer); const delay = 36_000 + Math.random() * 42_000;
  livingTimer = window.setTimeout(() => { if (!dragStart) { petMotion.classList.add("is-living"); window.setTimeout(() => petMotion.classList.remove("is-living"), 2600); } scheduleLivingMotion(); }, delay);
}

function parseKeywordReplies(value: string): Record<string, string[]> {
  return Object.fromEntries(value.split("\n").map((line) => {
    const [key, replies = ""] = line.split(/\s*[=＝]\s*/, 2);
    return [key?.trim(), replies.split("|").map((reply) => reply.trim()).filter(Boolean)] as const;
  }).filter(([key, replies]) => Boolean(key) && replies.length));
}

function keywordRepliesText(entries: Record<string, string[]>) { return Object.entries(entries).map(([key, replies]) => `${key} = ${replies.join(" | ")}`).join("\n"); }

function fillStoryForm() {
  const fields = storyForm.elements;
  (fields.namedItem("name") as HTMLInputElement).value = profile.name;
  (fields.namedItem("addressName") as HTMLInputElement).value = profile.addressName;
  (fields.namedItem("personality") as HTMLInputElement).value = profile.personality.join("、");
  (fields.namedItem("tone") as HTMLInputElement).value = profile.tone;
  (fields.namedItem("catchphrases") as HTMLTextAreaElement).value = profile.catchphrases.join("\n");
  (fields.namedItem("keywordReplies") as HTMLTextAreaElement).value = keywordRepliesText(profile.keywordReplies);
  (fields.namedItem("proactiveMinutes") as HTMLInputElement).value = String(profile.proactiveMinutes);
  (fields.namedItem("imageScale") as HTMLInputElement).value = String(Math.round(profile.imageScale * 100));
  (fields.namedItem("imageX") as HTMLInputElement).value = String(profile.imageX);
  (fields.namedItem("imageY") as HTMLInputElement).value = String(profile.imageY);
  (fields.namedItem("aiEnabled") as HTMLInputElement).checked = profile.aiEnabled;
  (fields.namedItem("llmProvider") as HTMLSelectElement).value = profile.llmProvider;
  (fields.namedItem("llmModel") as HTMLInputElement).value = profile.llmModel;
  (fields.namedItem("llmBaseUrl") as HTMLInputElement).value = profile.llmBaseUrl;
  (fields.namedItem("aiIdleRatio") as HTMLInputElement).value = String(Math.round(profile.aiIdleRatio * 100));
  (fields.namedItem("weatherEnabled") as HTMLInputElement).checked = profile.weatherEnabled;
  (fields.namedItem("weatherCity") as HTMLInputElement).value = profile.weatherCity;
  connectionBadge.textContent = profile.aiEnabled ? "待连接" : "未启用";
  connectionBadge.dataset.state = "idle";
  updateRangeOutputs();
}

function readStoryForm(): OCProfile {
  const data = new FormData(storyForm);
  return {
    ...profile,
    name: String(data.get("name") || profile.name).trim(), addressName: String(data.get("addressName") || profile.addressName).trim(),
    personality: String(data.get("personality") || "").split(/[、,，]/).map((item) => item.trim()).filter(Boolean),
    tone: String(data.get("tone") || "").trim(),
    catchphrases: String(data.get("catchphrases") || "").split("\n").map((item) => item.trim()).filter(Boolean),
    keywordReplies: parseKeywordReplies(String(data.get("keywordReplies") || "")),
    proactiveMinutes: clampBetween(Number(data.get("proactiveMinutes")) || 30, 10, 120),
    imageScale: clampBetween((Number(data.get("imageScale")) || 100) / 100, 0.7, 1.35),
    imageX: clampBetween(Number(data.get("imageX")) || 0, -20, 20), imageY: clampBetween(Number(data.get("imageY")) || 0, -20, 20),
    aiEnabled: data.get("aiEnabled") === "on",
    llmProvider: String(data.get("llmProvider") || "openai") as OCProfile["llmProvider"],
    llmModel: String(data.get("llmModel") || "").trim(),
    llmBaseUrl: String(data.get("llmBaseUrl") || "").trim(),
    aiIdleRatio: clampBetween((Number(data.get("aiIdleRatio")) || 0) / 100, 0, 1),
    weatherEnabled: data.get("weatherEnabled") === "on",
    weatherCity: String(data.get("weatherCity") || "").trim(),
  };
}

function updateRangeOutputs() {
  const scale = storyForm.elements.namedItem("imageScale") as HTMLInputElement;
  const x = storyForm.elements.namedItem("imageX") as HTMLInputElement;
  const y = storyForm.elements.namedItem("imageY") as HTMLInputElement;
  app.querySelector<HTMLOutputElement>('[data-range-output="imageScale"]')!.value = `${scale.value}%`;
  app.querySelector<HTMLOutputElement>('[data-range-output="imageX"]')!.value = x.value;
  app.querySelector<HTMLOutputElement>('[data-range-output="imageY"]')!.value = y.value;
  const aiRatio = storyForm.elements.namedItem("aiIdleRatio") as HTMLInputElement;
  app.querySelector<HTMLOutputElement>('[data-range-output="aiIdleRatio"]')!.value = `${aiRatio.value}% 模型`;
}

async function useCharacterFile(file: File) {
  if (!/^image\/(png|webp)$/.test(file.type)) { showBubble("请给我一张 PNG 或 WebP 图片吧。"); return; }
  try {
    customImageDataUrl = await fileToDataUrl(file);
    animationPack = null;
    await Promise.all([saveOCImage(customImageDataUrl), saveAnimationPack(null)]);
    applyCharacterAppearance(); showBubble("新形象换好啦，很适合我。", 6000);
  } catch { showBubble("这张图片没有保存成功，再试一次好吗？"); }
}

async function useAnimationFolder(files: FileList | File[]) {
  const previous = animationPack;
  animationDrop.classList.add("is-loading");
  animationStatus.textContent = "正在识别并组装图层…";
  try {
    const parsed = await parseAnimationFolder(files);
    await saveAnimationPack(parsed);
    animationPack = parsed;
    applyCharacterAppearance();
    const sourceNote = parsed.source === "manifest" ? "已按清单读取" : "已根据文件名自动识别";
    showBubble(`${sourceNote} ${parsed.layers.length} 个图层，基础动作装好啦。`, 7500);
  } catch (error) {
    animationPack = previous;
    applyCharacterAppearance();
    showBubble(error instanceof Error ? error.message : "这个动画包没有解析成功。", 7500);
  } finally {
    animationDrop.classList.remove("is-loading", "is-dragging-over");
    animationFilesInput.value = "";
  }
}

wheel.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
  if (!button) return;
  replayClass(button, "is-selected", 360);
  const panel = button.dataset.action as Exclude<PanelName, null>;
  window.setTimeout(() => { closeWheel(); openPanel(panel); }, 120);
});

app.querySelectorAll<HTMLButtonElement>("[data-close-panel]").forEach((button) => button.addEventListener("click", hidePanels));

walletPanel.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-food]");
  if (!button) return;
  const key = button.dataset.food as FoodKey; const operation = button.dataset.operation; const food = foodDetails[key];
  if (operation === "buy") {
    if (state.points < food.price) { showBubble(`还差 ${food.price - state.points} 荷露，再陪我玩一会儿吧。`); replayClass(button, "is-denied", 420); return; }
    state.points -= food.price; state.inventory[key] += 1; replayClass(button, "is-used", 420); showBubble(`${food.name}已经放进荷包啦。`);
  } else {
    if (state.inventory[key] <= 0) return;
    state.inventory[key] -= 1; state.satiety = clamp(state.satiety + food.satiety); state.mood = clamp(state.mood + food.mood); state.affection += 1;
    state = awardInteractionPoint(state).state; replayClass(button, "is-used", 420); playPetReaction("happy"); showBubble(`${food.name}很好吃，谢谢你。`);
  }
  renderState();
});

dialogueForm.addEventListener("submit", async (event) => {
  event.preventDefault(); const message = messageInput.value.trim(); if (!message || llmInFlight) return messageInput.focus();
  messageInput.value = ""; state.mood = clamp(state.mood + 1); state.affection += 1; hidePanels();
  if (profile.aiEnabled) {
    llmInFlight = true; dialogueForm.classList.add("is-loading"); showBubble("让我想一想…", 45_000);
    try { showBubble(await requestModelLine("chat", message), 12_000); }
    catch { showBubble(replyFor(message), 10_000); }
    finally { llmInFlight = false; dialogueForm.classList.remove("is-loading"); }
  } else showBubble(replyFor(message), 10_000);
  replayClass(petMotion, "is-talking", 1900); renderState();
});

storyForm.addEventListener("input", (event) => {
  if (!(event.target instanceof HTMLInputElement) || event.target.type !== "range") return;
  updateRangeOutputs(); const preview = readStoryForm();
  petLayer.style.setProperty("--oc-scale", String(preview.imageScale)); petLayer.style.setProperty("--oc-x", `${preview.imageX}%`); petLayer.style.setProperty("--oc-y", `${preview.imageY}%`);
});

storyForm.addEventListener("submit", (event) => {
  event.preventDefault(); profile = readStoryForm(); saveOCProfile(profile); applyCharacterAppearance(); scheduleAmbient(); hidePanels();
  void refreshWeather(profile.weatherEnabled);
  showBubble(`话本收好啦。以后就叫我${profile.name}吧。`, 7000);
});

const providerSelect = storyForm.elements.namedItem("llmProvider") as HTMLSelectElement;
providerSelect.addEventListener("change", () => {
  const defaults = providerDefaults(providerSelect.value as OCProfile["llmProvider"]);
  (storyForm.elements.namedItem("llmModel") as HTMLInputElement).value = defaults.model;
  (storyForm.elements.namedItem("llmBaseUrl") as HTMLInputElement).value = defaults.baseUrl;
  setConnectionState("idle", "服务商已切换，请保存话本后测试连接。");
});

app.querySelector("[data-test-api]")?.addEventListener("click", async () => {
  if (llmInFlight) return;
  const draftProfile = readStoryForm();
  llmInFlight = true;
  setConnectionState("loading", "正在验证模型和密钥…");
  try {
    const line = await generateOCLine({ profile: draftProfile, state, apiKey: apiKeyInput.value, userPrompt: "", weather: currentWeather, mode: "test" });
    setConnectionState("success", `连接成功：${line}`);
    showBubble(line, 8500);
  } catch (error) {
    setConnectionState("error", error instanceof Error ? error.message : "连接失败，请检查设置。");
  } finally { llmInFlight = false; }
});

updateButton.addEventListener("click", () => {
  if (availableUpdate) void applyAvailableUpdate();
  else void checkForUpdates(true);
});

const characterFileInput = app.querySelector<HTMLInputElement>("[data-character-file]")!;
characterFileInput.addEventListener("change", () => { const file = characterFileInput.files?.[0]; if (file) void useCharacterFile(file); });
const imageDrop = app.querySelector<HTMLElement>("[data-image-drop]")!;
imageDrop.addEventListener("dragover", (event) => { event.preventDefault(); imageDrop.classList.add("is-dragging-over"); });
imageDrop.addEventListener("dragleave", () => imageDrop.classList.remove("is-dragging-over"));
imageDrop.addEventListener("drop", (event) => { event.preventDefault(); imageDrop.classList.remove("is-dragging-over"); const file = event.dataTransfer?.files[0]; if (file) void useCharacterFile(file); });
imageDrop.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") characterFileInput.click(); });

animationFilesInput.addEventListener("change", () => {
  if (animationFilesInput.files?.length) void useAnimationFolder(animationFilesInput.files);
});
animationDrop.addEventListener("dragover", (event) => { event.preventDefault(); animationDrop.classList.add("is-dragging-over"); });
animationDrop.addEventListener("dragleave", () => animationDrop.classList.remove("is-dragging-over"));
animationDrop.addEventListener("drop", (event) => {
  event.preventDefault();
  const files = event.dataTransfer?.files;
  if (files?.length) void useAnimationFolder(files);
});
animationDrop.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); animationFilesInput.click(); }
});

clearAnimationButton.addEventListener("click", async () => {
  animationPack = null;
  await saveAnimationPack(null);
  applyCharacterAppearance();
  showBubble("已经换回单图模式啦。", 5500);
});

app.querySelector("[data-reset-image]")?.addEventListener("click", async () => {
  customImageDataUrl = null; animationPack = null;
  await Promise.all([saveOCImage(null), saveAnimationPack(null)]);
  profile = { ...profile, imageScale: 1, imageX: 0, imageY: 0 }; saveOCProfile(profile);
  fillStoryForm(); applyCharacterAppearance(); showBubble("换回最初的样子啦。", 5500);
});

app.querySelector("[data-export-oc]")?.addEventListener("click", () => {
  const pack: OCPack = {
    version: 1,
    profile: readStoryForm(),
    ...(customImageDataUrl ? { imageDataUrl: customImageDataUrl } : {}),
    ...(animationPack ? { animationPack } : {}),
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = `${pack.profile.name || "oc"}-话本.json`; link.click(); URL.revokeObjectURL(url);
});

const importInput = app.querySelector<HTMLInputElement>("[data-import-oc]")!;
importInput.addEventListener("change", async () => {
  const file = importInput.files?.[0]; if (!file) return;
  try {
    const pack = JSON.parse(await file.text()) as OCPack; if (pack.version !== 1 || !pack.profile?.name) throw new Error("invalid pack");
    profile = { ...defaultOCProfile(), ...pack.profile };
    customImageDataUrl = pack.imageDataUrl || null;
    animationPack = pack.animationPack?.version === 1 ? pack.animationPack : null;
    saveOCProfile(profile);
    await Promise.all([saveOCImage(customImageDataUrl), saveAnimationPack(animationPack)]);
    fillStoryForm(); applyCharacterAppearance(); showBubble("话本和形象都导入好啦。", 6500);
  } catch { showBubble("这个话本文件读不懂，请换一个有效的 JSON 配置包。"); }
});

pet.addEventListener("contextmenu", (event) => { event.preventDefault(); petMotion.classList.remove("is-pressed"); dragStart = null; openWheel(event.clientX, event.clientY); });
pet.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  pet.setPointerCapture(event.pointerId); dragStart = { x: event.clientX, y: event.clientY, left: state.position.x, top: state.position.y };
  dragged = false; nativeDragStarted = false; petMotion.classList.add("is-pressed");
});
pet.addEventListener("pointermove", (event) => {
  if (!dragStart) return;
  const dx = event.clientX - dragStart.x; const dy = event.clientY - dragStart.y;
  if (!dragged && Math.hypot(dx, dy) > 6) { dragged = true; petMotion.classList.remove("is-pressed"); petMotion.classList.add("is-dragging"); }
  if (!dragged) return;
  if ("__TAURI_INTERNALS__" in window) {
    if (nativeDragStarted) return; nativeDragStarted = true;
    void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().startDragging()).catch(() => { nativeDragStarted = false; petMotion.classList.remove("is-dragging"); });
    return;
  }
  state.position.x = clampBetween(dragStart.left + dx, -90, 90); state.position.y = clampBetween(dragStart.top + dy, -80, 70);
  petLayer.style.setProperty("--drag-x", `${state.position.x}px`); petLayer.style.setProperty("--drag-y", `${state.position.y}px`);
});
pet.addEventListener("pointerup", (event) => {
  if (event.button !== 0 || !dragStart) return;
  petMotion.classList.remove("is-pressed", "is-dragging"); dragStart = null;
  if (dragged) savePetState(state); else { closeWheel(); doPoke(); }
});
pet.addEventListener("pointercancel", () => { petMotion.classList.remove("is-pressed", "is-dragging"); dragStart = null; dragged = false; });

document.addEventListener("pointerdown", (event) => {
  if (!wheel.hidden && !(event.target as HTMLElement).closest("[data-wheel]") && !(event.target as HTMLElement).closest("[data-pet]")) closeWheel();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") { if (!wheel.hidden) closeWheel(); else hidePanels(); }
});

window.setInterval(() => { state = applyElapsedDecay(state); renderState(); }, 60_000);
petLayer.style.setProperty("--drag-x", `${state.position.x}px`); petLayer.style.setProperty("--drag-y", `${state.position.y}px`);
applyCharacterAppearance(); renderState(); showBubble(profile.catchphrases[1] || profile.catchphrases[0] || "要一起喝杯茶吗？", 9000); scheduleAmbient(); scheduleLivingMotion(); void refreshWeather();
window.setTimeout(() => void checkForUpdates(false), 8000);
