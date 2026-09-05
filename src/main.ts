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
  INVENTORY_ITEM_KEYS,
  PROP_ITEM_KEYS,
  SNACK_ITEM_KEYS,
  defaultOCProfile,
  fileToDataUrl,
  loadOCImage,
  loadOCProfile,
  normalizeInventoryCatalog,
  saveOCImage,
  saveOCProfile,
  type InventoryCatalog,
  type InventoryItemKey,
  type OCPack,
  type OCProfile,
} from "./oc";
import { describeLLMError, generateOCLine, providerDefaults } from "./llm";
import { affectionLabel, applyElapsedDecay, loadPetState, savePetState, type PetState } from "./state";
import { fetchWeather, type WeatherContext } from "./weather";
import { findAppUpdate, installAppUpdate, isDesktopRuntime, type DownloadEvent, type Update } from "./updater";
import "./styles.css";

type PanelKey = "dialogue" | "status" | "wallet" | "story";
type PanelName = PanelKey | null;
type PanelLayout = { left: number; top: number; width: number; height: number };
type ItemKey = InventoryItemKey;
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
  tease: icon("smiley-wink"),
  apple: icon("plant"), cookie: icon("cookie"), parfait: icon("ice-cream"), heart: icon("heart"),
  satiety: icon("bowl-food"), energy: icon("sparkle"), affection: icon("flower-lotus"),
  close: icon("x"), send: icon("paper-plane-tilt"), upload: icon("upload-simple"), reset: icon("arrow-counter-clockwise"),
  export: icon("download-simple"), import: icon("file-arrow-up"),
  cloud: icon("cloud-sun"), key: icon("key"), test: icon("plugs-connected"),
  layers: icon("stack"), folder: icon("folder-open"),
  update: icon("arrows-clockwise"),
  edit: icon("sliders-horizontal"),
  download: icon("download-simple"),
  clock: icon("clock"),
  skip: icon("arrow-line-right"),
};

const scriptEditorMarkup = library.scenarios.map((scenario) => `
  <details class="script-row" data-script-row="${scenario.key}">
    <summary><span>${icon("leaf")}<b>${scenario.label}</b></span><small>${scenario.hint}</small></summary>
    <label><span class="sr-only">${scenario.label}会说的话，每行一句</span><textarea data-script-key="${scenario.key}" rows="3" placeholder="每行一句；留空时使用内置话本"></textarea></label>
  </details>`).join("");

const itemIcons: Record<ItemKey, string> = {
  apple: icons.apple,
  cookie: icons.cookie,
  parfait: icons.parfait,
  umbrella: icon("umbrella-simple"),
  charm: icon("flower-lotus"),
  sword: icon("sword"),
};

const inventoryCardMarkup = (key: ItemKey) => `
  <article class="inventory-card" data-item-card="${key}">
    ${itemIcons[key]}
    <div class="inventory-card-copy"><strong data-item-name="${key}"></strong><span data-item-effects="${key}"></span></div>
    <button class="inventory-use-button" type="button" data-item-use="${key}"></button>
  </article>`;

const inventoryEditorRow = (key: ItemKey, fallbackLabel: string) => `
  <details class="inventory-editor-row" data-item-editor="${key}">
    <summary><span>${icon("leaf")}<b data-item-editor-name="${key}">${fallbackLabel}</b></span>${icon("caret-down")}</summary>
    <div class="inventory-editor-fields">
      <label>名称<input data-item-field="name" maxlength="20" /></label>
      <fieldset><legend>使用后的属性变化</legend><div class="inventory-effect-grid">
        <label>饱腹<input type="number" data-item-field="satiety" min="-100" max="100" step="1" /></label>
        <label>心情<input type="number" data-item-field="mood" min="-100" max="100" step="1" /></label>
        <label>精力<input type="number" data-item-field="energy" min="-100" max="100" step="1" /></label>
        <label>亲密<input type="number" data-item-field="affection" min="-100" max="100" step="1" /></label>
      </div></fieldset>
      <label class="inventory-lines-field">使用后可能会说的话<textarea data-item-field="lines" rows="3" maxlength="600" placeholder="每行一句；使用时随机选一句"></textarea></label>
    </div>
  </details>`;

const inventoryEditorMarkup = `
  <section class="inventory-editor-group"><h3>${icon("bowl-food")}点心栏</h3>${SNACK_ITEM_KEYS.map((key, index) => inventoryEditorRow(key, `点心 ${index + 1}`)).join("")}</section>
  <section class="inventory-editor-group"><h3>${icon("backpack")}道具栏</h3>${PROP_ITEM_KEYS.map((key, index) => inventoryEditorRow(key, `道具 ${index + 1}`)).join("")}</section>`;

app.innerHTML = `
  <main class="pet-window" aria-label="DeskPet 桌宠" data-pet-window>
    <section class="speech-sheet" data-bubble aria-live="polite" hidden>
      <img class="speech-plate" src="${speechBubbleUrl}" alt="" aria-hidden="true" />
      <p class="speech-text" data-bubble-text>要一起喝杯茶吗？</p>
    </section>

    <div class="pet-layer" data-pet-layer>
      <button class="pet-hit-area" type="button" data-pet aria-label="桌宠；左键戳一戳，右键打开功能轮盘，拖动可移动">
        <span class="pet-motion" data-pet-motion>
          <span class="character-stage" data-character-stage>
            <img class="character-plate" data-character src="${petImageUrl}" alt="DeskPet 桌宠角色" draggable="false" />
          </span>
        </span>
      </button>
      <span class="click-bloom" data-click-bloom aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
    </div>

    <nav class="action-wheel" data-wheel aria-label="桌宠功能" hidden>
      <span class="wheel-ripple" aria-hidden="true"></span>
      <button type="button" data-action="dialogue" data-direction="top">${icons.chat}<span>聊天</span></button>
      <button type="button" data-action="status" data-direction="upper-right">${icons.status}<span>状态</span></button>
      <button type="button" data-action="wallet" data-direction="lower-right">${icons.wallet}<span>荷包</span></button>
      <button type="button" data-action="story" data-direction="lower-left">${icons.story}<span>话本</span></button>
      <button type="button" data-action="tease" data-direction="upper-left">${icons.tease}<span>调戏</span></button>
    </nav>

    <section class="update-dialog-layer" data-update-dialog-layer hidden>
      <article class="update-dialog" role="dialog" aria-modal="true" aria-labelledby="update-dialog-title" aria-describedby="update-dialog-summary">
        <header class="update-dialog-header">
          <span class="update-dialog-mark" aria-hidden="true">${icon("flower-lotus")}</span>
          <span class="update-dialog-heading">
            <small>DeskPet 更新</small>
            <strong id="update-dialog-title">发现新版本啦</strong>
            <span id="update-dialog-summary" data-update-version-summary>当前版本正在检查中…</span>
          </span>
          <button type="button" class="update-dialog-close" data-update-remind aria-label="稍后提醒">${icons.close}</button>
        </header>

        <section class="update-release-notes" aria-labelledby="update-notes-title">
          <strong id="update-notes-title">这次带来了什么</strong>
          <p data-update-notes>新的功能与稳定性改进。</p>
        </section>

        <section class="update-progress" data-update-progress aria-live="polite" hidden>
          <span><strong data-update-progress-label>准备下载…</strong><output data-update-progress-value></output></span>
          <progress max="100" value="0" data-update-progress-bar aria-label="更新下载进度"></progress>
        </section>

        <label class="update-auto-choice">
          <input type="checkbox" data-update-auto />
          <span><strong>以后自动下载并安装</strong><small>发现新版时自动完成，安装前仍会显示进度</small></span>
        </label>

        <footer class="update-dialog-actions">
          <button type="button" class="update-secondary-action" data-update-skip>${icons.skip}<span>跳过此版本</span></button>
          <button type="button" class="update-secondary-action" data-update-remind>${icons.clock}<span>稍后提醒</span></button>
          <button type="button" class="update-primary-action" data-update-install>${icons.download}<span>立即安装</span></button>
        </footer>
      </article>
    </section>

    <section class="status-cluster floating-panel" data-status-panel data-panel-key="status" aria-label="桌宠状态" hidden>
      <header data-panel-drag-handle title="拖动弹框"><h2 data-level-heading>Lv.1 陌生</h2><button type="button" class="panel-close" data-close-panel aria-label="关闭状态">${icons.close}</button></header>
      <div class="status-values">
        <div>${icons.heart}<span>心情</span><output data-value="mood">82</output></div>
        <div>${icons.satiety}<span>饱腹</span><output data-value="satiety">68</output></div>
        <div>${icons.energy}<span>精力</span><output data-value="energy">74</output></div>
        <div>${icons.affection}<span>亲密</span><output data-affection>0</output></div>
      </div>
    </section>

    <form class="chat-dock floating-panel" data-dialogue-form data-panel-key="dialogue" aria-label="和桌宠聊天" hidden>
      <span class="panel-drag-grip" data-panel-drag-handle title="拖动聊天框">${icon("dots-six-vertical")}</span>
      <label class="sr-only" for="pet-message">输入想说的话</label>
      <input id="pet-message" maxlength="80" autocomplete="off" placeholder="和 TA 说点什么…" />
      <button type="submit" aria-label="发送">${icons.send}</button>
    </form>

    <section class="wallet-panel floating-panel" data-wallet-panel data-panel-key="wallet" aria-label="荷包与点心道具" hidden>
      <header data-panel-drag-handle title="拖动弹框"><div><h2>荷包</h2></div><div class="wallet-header-actions"><button type="button" class="wallet-edit-button" data-edit-inventory aria-expanded="false">${icons.edit}<span>编辑</span></button><button type="button" class="panel-close" data-close-panel aria-label="关闭荷包">${icons.close}</button></div></header>
      <div class="inventory-tabs" role="tablist" aria-label="荷包分类">
        <button type="button" role="tab" data-inventory-tab="snack" aria-selected="true">${icon("bowl-food")}点心栏</button>
        <button type="button" role="tab" data-inventory-tab="prop" aria-selected="false">${icon("backpack")}道具栏</button>
      </div>
      <div class="inventory-sections">
        <section class="inventory-group" data-inventory-section="snack"><div class="food-list">${SNACK_ITEM_KEYS.map(inventoryCardMarkup).join("")}</div></section>
        <section class="inventory-group" data-inventory-section="prop" hidden><div class="food-list">${PROP_ITEM_KEYS.map(inventoryCardMarkup).join("")}</div></section>
      </div>
      <form class="inventory-editor" data-inventory-editor hidden>
        <div class="inventory-editor-heading"><strong>自定义点心、道具与台词</strong><small>保存后会跟随 OC 话本一起导出。</small></div>
        <div class="inventory-editor-list">${inventoryEditorMarkup}</div>
        <button class="inventory-save-button" type="submit">保存荷包设定</button>
      </form>
    </section>

    <section class="story-panel floating-panel" data-story-panel data-panel-key="story" aria-label="OC 性格话本" hidden>
      <header data-panel-drag-handle title="拖动弹框"><div><h2>OC 话本</h2><p>形象、性格和说话方式都收在这里。</p></div><button type="button" class="panel-close" data-close-panel aria-label="关闭话本">${icons.close}</button></header>
      <form data-story-form>
        <div class="story-scroll">
          <label class="image-drop" data-image-drop tabindex="0">${icons.upload}<span><strong>更换 OC 图片</strong><small>PNG / WebP，可拖入</small></span><input type="file" accept="image/png,image/webp" data-character-file hidden /></label>
          <div class="animation-import-row">
            <label class="animation-drop" data-animation-drop tabindex="0">${icons.layers}<span><strong>导入 OC 动画包</strong><small data-animation-status>选择包含分层图片的文件夹</small></span>${icons.folder}<input type="file" accept="image/png,image/webp,application/json" multiple webkitdirectory data-animation-files hidden /></label>
            <button type="button" class="clear-animation" data-clear-animation hidden>改用单图</button>
          </div>
          <div class="field-pair"><label>OC 名字<input name="name" maxlength="24" /></label><label>如何称呼你<input name="addressName" maxlength="16" /></label></div>
          <label>OC 人设<textarea name="persona" rows="5" maxlength="1600" placeholder="写下身份、经历、性格、喜好、关系和表达习惯。启用大模型后，会与用户消息一起作为回答依据。"></textarea></label>
          <div class="field-pair"><label>自称<input name="selfReference" maxlength="16" placeholder="例如：我、本小姐、在下" /></label><label>口头禅<textarea name="catchphrases" rows="2" placeholder="每行一句"></textarea></label></div>
          <div class="range-grid">
            <label>大小 <output data-range-output="imageScale">100%</output><input type="range" name="imageScale" min="40" max="135" step="1" /></label>
            <label>左右 <output data-range-output="imageX">0</output><input type="range" name="imageX" min="-20" max="20" step="1" /></label>
            <label>上下 <output data-range-output="imageY">0</output><input type="range" name="imageY" min="-20" max="20" step="1" /></label>
          </div>
          <section class="rhythm-settings" aria-labelledby="rhythm-title">
            <h3 id="rhythm-title">陪伴节奏</h3>
            <label class="frequency-field">主动说话间隔 <span><input type="number" name="proactiveMinutes" min="10" max="120" step="5" /> 分钟</span></label>
            <label class="reminder-row"><span><strong>久坐提醒</strong><small>连续一段时间没有互动时提醒活动</small></span><span class="reminder-controls"><input type="number" name="sedentaryMinutes" min="20" max="240" step="10" /><em>分钟</em><input type="checkbox" name="sedentaryEnabled" aria-label="启用久坐提醒" /></span></label>
          </section>
          <details class="script-settings">
            <summary>${icon("book-open-text")}<span><strong>话本 · TA 可能说的话</strong><small>按场景编辑，每行一句</small></span>${icon("caret-down")}</summary>
            <div class="script-list">${scriptEditorMarkup}</div>
          </details>
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
              <section class="weather-settings" aria-labelledby="weather-title">
                <h3 id="weather-title">天气</h3>
                <label class="weather-toggle"><input type="checkbox" name="weatherEnabled" /><span>根据天气说话、更新实时内容</span></label>
                <label>城市 <small>填一次就好，例如「杭州」「New York」</small><span class="weather-query-row"><input name="weatherCity" autocomplete="off" placeholder="未设置" /><button type="button" data-query-weather>查询并保存</button></span></label>
                <p class="weather-status" data-weather-status>还没有天气数据。</p>
              </section>
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
          <button type="button" data-reset-panels>${icons.reset}<span>还原位置</span></button>
          <button type="button" data-export-oc>${icons.export}<span>导出</span></button>
          <label>${icons.import}<span>导入</span><input type="file" accept="application/json" data-import-oc hidden /></label>
          <button class="primary-action" type="submit">保存话本</button>
        </footer>
      </form>
    </section>
  </main>`;

let state: PetState = applyElapsedDecay(loadPetState());
let profile: OCProfile = loadOCProfile();
let attachedUiScale = profile.imageScale;
let activePanel: PanelName = null;
let bubbleTimer: number | undefined;
let attachedUiTimer: number | undefined;
let panelGesture: {
  key: PanelKey;
  pointerId: number;
  mode: "move" | "resize";
  edges: { top: boolean; right: boolean; bottom: boolean; left: boolean };
  startX: number;
  startY: number;
  layout: PanelLayout;
} | null = null;
let ambientTimer: number | undefined;
let sedentaryTimer: number | undefined;
let livingTimer: number | undefined;
let weatherTimer: number | undefined;
let dragStart: { x: number; y: number; left: number; top: number; dialogueLayout?: PanelLayout } | null = null;
let dragged = false;
let nativeDragStarted = false;
let customImageDataUrl: string | null = await loadOCImage();
let animationPack: OCAnimationPack | null = await loadAnimationPack();
let currentWeather: WeatherContext | null = null;
let llmInFlight = false;
let availableUpdate: Update | null = null;
let updateInFlight = false;
let updateInstalling = false;
let updateAutoStartTimer: number | undefined;
let updateDialogPreviousFocus: HTMLElement | null = null;
let lastInteractionAt = Date.now();
let teaseStreak = 0;
let lastTeaseAt = 0;

const petWindow = app.querySelector<HTMLElement>("[data-pet-window]")!;
const bubble = app.querySelector<HTMLElement>("[data-bubble]")!;
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
const inventoryEditor = app.querySelector<HTMLFormElement>("[data-inventory-editor]")!;
const inventoryEditButton = app.querySelector<HTMLButtonElement>("[data-edit-inventory]")!;
const storyPanel = app.querySelector<HTMLElement>("[data-story-panel]")!;
const storyForm = app.querySelector<HTMLFormElement>("[data-story-form]")!;
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
const updateDialogLayer = app.querySelector<HTMLElement>("[data-update-dialog-layer]")!;
const updateVersionSummary = app.querySelector<HTMLElement>("[data-update-version-summary]")!;
const updateNotes = app.querySelector<HTMLElement>("[data-update-notes]")!;
const updateProgress = app.querySelector<HTMLElement>("[data-update-progress]")!;
const updateProgressLabel = app.querySelector<HTMLElement>("[data-update-progress-label]")!;
const updateProgressValue = app.querySelector<HTMLOutputElement>("[data-update-progress-value]")!;
const updateProgressBar = app.querySelector<HTMLProgressElement>("[data-update-progress-bar]")!;
const updateInstallButton = app.querySelector<HTMLButtonElement>("[data-update-install]")!;
const updateSkipButton = app.querySelector<HTMLButtonElement>("[data-update-skip]")!;
const updateRemindButtons = Array.from(app.querySelectorAll<HTMLButtonElement>("[data-update-remind]"));
const updateAutoInput = app.querySelector<HTMLInputElement>("[data-update-auto]")!;
const weatherStatus = app.querySelector<HTMLElement>("[data-weather-status]")!;
const weatherButton = app.querySelector<HTMLButtonElement>("[data-query-weather]")!;
const panelElements: Record<PanelKey, HTMLElement> = {
  dialogue: dialogueForm,
  status: statusPanel,
  wallet: walletPanel,
  story: storyPanel,
};

const PANEL_LAYOUT_KEY = "lotus-desk-pet/panel-layouts/v1";
const UPDATE_PREFERENCES_KEY = "lotus-desk-pet/update-preferences/v1";
const UPDATE_REMIND_DELAY = 24 * 60 * 60 * 1000;
type UpdatePreferences = { skippedVersion: string; remindAfter: number; autoInstall: boolean };
type UpdatePresentation = Pick<Update, "currentVersion" | "version" | "body">;

function loadUpdatePreferences(): UpdatePreferences {
  try {
    const saved = JSON.parse(localStorage.getItem(UPDATE_PREFERENCES_KEY) ?? "null") as Partial<UpdatePreferences> | null;
    return {
      skippedVersion: typeof saved?.skippedVersion === "string" ? saved.skippedVersion : "",
      remindAfter: typeof saved?.remindAfter === "number" && Number.isFinite(saved.remindAfter) ? saved.remindAfter : 0,
      autoInstall: saved?.autoInstall === true,
    };
  } catch {
    return { skippedVersion: "", remindAfter: 0, autoInstall: false };
  }
}

let updatePreferences = loadUpdatePreferences();

function saveUpdatePreferences() {
  localStorage.setItem(UPDATE_PREFERENCES_KEY, JSON.stringify(updatePreferences));
}
const panelMinimums: Record<PanelKey, { width: number; height: number }> = {
  dialogue: { width: 260, height: 48 },
  status: { width: 220, height: 140 },
  wallet: { width: 260, height: 160 },
  story: { width: 320, height: 180 },
};

function loadPanelLayouts(): Partial<Record<PanelKey, PanelLayout>> {
  try {
    const value = JSON.parse(localStorage.getItem(PANEL_LAYOUT_KEY) ?? "null") as Partial<Record<PanelKey, Partial<PanelLayout>>> | null;
    if (!value || typeof value !== "object") return {};
    return Object.fromEntries((Object.keys(panelElements) as PanelKey[]).flatMap((key) => {
      const layout = value[key];
      return layout && [layout.left, layout.top, layout.width, layout.height].every((part) => typeof part === "number" && Number.isFinite(part))
        ? [[key, layout as PanelLayout]] : [];
    })) as Partial<Record<PanelKey, PanelLayout>>;
  } catch {
    return {};
  }
}

let panelLayouts = loadPanelLayouts();

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

function setUpdateDialogBusy(busy: boolean) {
  updateInstalling = busy;
  updateInstallButton.disabled = busy;
  updateSkipButton.disabled = busy;
  updateRemindButtons.forEach((button) => { button.disabled = busy; });
  updateAutoInput.disabled = busy;
  updateDialogLayer.dataset.installing = busy ? "true" : "false";
}

function formatReleaseNotes(body: string | undefined) {
  return (body || "这个版本包含新的功能、体验优化与稳定性改进。")
    .replace(/\r\n/g, "\n")
    .replace(/<!--[^]*?-->/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function showUpdateDialog(update: UpdatePresentation, autoStart = false) {
  updateDialogPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  closeWheel();
  hidePanels();
  hideBubble(true);
  updateVersionSummary.textContent = `v${update.currentVersion} → v${update.version}`;
  const notes = formatReleaseNotes(update.body);
  updateNotes.textContent = notes.length > 1200 ? `${notes.slice(0, 1200).trim()}…` : notes;
  updateProgress.hidden = true;
  updateProgressBar.value = 0;
  updateProgressLabel.textContent = "准备下载…";
  updateProgressValue.textContent = "";
  updateAutoInput.checked = updatePreferences.autoInstall;
  updateInstallButton.querySelector("span")!.textContent = "立即安装";
  setUpdateDialogBusy(false);
  updateDialogLayer.dataset.state = "ready";
  updateDialogLayer.hidden = false;
  requestAnimationFrame(() => updateInstallButton.focus());
  if (autoStart) updateAutoStartTimer = window.setTimeout(() => void applyAvailableUpdate(), 520);
}

function hideUpdateDialog(restoreFocus = true) {
  if (updateInstalling) return;
  if (updateAutoStartTimer) window.clearTimeout(updateAutoStartTimer);
  updateAutoStartTimer = undefined;
  updateDialogLayer.hidden = true;
  updateDialogLayer.dataset.state = "closed";
  if (restoreFocus) updateDialogPreviousFocus?.focus();
  updateDialogPreviousFocus = null;
}

function shouldPresentUpdate(version: string) {
  if (updatePreferences.skippedVersion === version) return false;
  return updatePreferences.remindAfter <= Date.now();
}

function updateDownloadStatus(event: DownloadEvent, progress: { received: number; total: number }) {
  updateProgress.hidden = false;
  if (event.event === "Started") {
    progress.received = 0;
    progress.total = event.data.contentLength || 0;
    updateStatus.textContent = "正在下载更新…";
    updateProgressLabel.textContent = "正在下载更新…";
    updateProgressValue.textContent = progress.total ? "0%" : "";
    if (progress.total) updateProgressBar.value = 0;
    else updateProgressBar.removeAttribute("value");
  } else if (event.event === "Progress") {
    progress.received += event.data.chunkLength;
    const percentage = progress.total ? Math.min(100, Math.round(progress.received / progress.total * 100)) : 0;
    updateStatus.textContent = progress.total ? `正在下载 ${percentage}%` : "正在下载更新…";
    updateProgressLabel.textContent = "正在下载更新…";
    updateProgressValue.textContent = progress.total ? `${percentage}%` : "";
    if (progress.total) updateProgressBar.value = percentage;
  } else {
    updateStatus.textContent = "正在安装并重新启动…";
    updateProgressLabel.textContent = "正在安装，马上回来…";
    updateProgressValue.textContent = "100%";
    updateProgressBar.value = 100;
  }
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
      updateButton.textContent = "查看更新";
      if (announce || shouldPresentUpdate(availableUpdate.version)) {
        const autoStart = !announce && updatePreferences.autoInstall;
        showUpdateDialog(availableUpdate, autoStart);
      }
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
  setUpdateDialogBusy(true);
  updateDialogLayer.dataset.state = "installing";
  updateInstallButton.querySelector("span")!.textContent = "正在安装";
  const progress = { received: 0, total: 0 };
  try {
    await installAppUpdate(availableUpdate, (event) => updateDownloadStatus(event, progress));
  } catch (error) {
    updateStatus.textContent = "更新安装失败，可稍后重试";
    updateButton.disabled = false;
    updateInFlight = false;
    setUpdateDialogBusy(false);
    updateDialogLayer.dataset.state = "error";
    updateInstallButton.querySelector("span")!.textContent = "重新安装";
    updateProgress.hidden = false;
    updateProgressLabel.textContent = "安装没有完成，请检查网络后重试。";
    updateProgressValue.textContent = "";
    updateProgressBar.value = 0;
    if (updateDialogLayer.hidden && availableUpdate) showUpdateDialog(availableUpdate);
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

function positionAttachedUi() {
  const windowRect = petWindow.getBoundingClientRect();
  const stageRect = characterStage.getBoundingClientRect();
  if (!windowRect.width || !windowRect.height || !stageRect.width || !stageRect.height) return;

  const stageLeft = stageRect.left - windowRect.left;
  const stageTop = stageRect.top - windowRect.top;
  const visibleLeft = stageLeft + stageRect.width * 0.07;
  const visibleRight = stageLeft + stageRect.width * 0.94;
  const visibleTop = stageTop + stageRect.height * 0.31;
  const visibleBottom = stageTop + stageRect.height * 0.91;

  // The speech plate's tail sits at roughly 31% of its width. Point it at the
  // top-left side of the character's head instead of positioning it by viewport.
  const bubbleWidth = clampBetween(windowRect.width * (0.35 + attachedUiScale * 0.045), 218, 286);
  const bubbleHeight = bubbleWidth / 2.72;
  const speechTargetX = stageLeft + stageRect.width * 0.34;
  const speechTargetY = visibleTop - 4;
  const bubbleLeft = clampBetween(speechTargetX - bubbleWidth * 0.31, 8, windowRect.width - bubbleWidth - 8);
  const bubbleTop = clampBetween(speechTargetY - bubbleHeight + 3, 8, windowRect.height - bubbleHeight - 8);
  petWindow.style.setProperty("--bubble-width", `${bubbleWidth}px`);
  petWindow.style.setProperty("--bubble-left", `${bubbleLeft}px`);
  petWindow.style.setProperty("--bubble-top", `${bubbleTop}px`);

  const visualCenter = (visibleLeft + visibleRight) / 2;
  const gap = 10;
  const belowSpace = windowRect.height - visibleBottom - gap - 8;
  const aboveSpace = visibleTop - gap - 8;
  const minimumSpace = activePanel === "dialogue" ? 58 : 176;
  const placeBelow = belowSpace >= minimumSpace || belowSpace >= aboveSpace;
  const activeElement = activePanel === "dialogue" ? dialogueForm
    : activePanel === "status" ? statusPanel
      : activePanel === "wallet" ? walletPanel
        : activePanel === "story" ? storyPanel : null;
  const halfPanelWidth = (activeElement?.offsetWidth || Math.min(windowRect.width * 0.72, 404)) / 2;
  const panelCenter = clampBetween(visualCenter, halfPanelWidth + 8, windowRect.width - halfPanelWidth - 8);
  const panelSpace = Math.max(96, placeBelow ? belowSpace : aboveSpace);

  petWindow.style.setProperty("--panel-center", `${panelCenter}px`);
  petWindow.style.setProperty("--panel-space", `${panelSpace}px`);
  petWindow.style.setProperty("--panel-top", placeBelow ? `${visibleBottom + gap}px` : "auto");
  petWindow.style.setProperty("--panel-bottom", placeBelow ? "auto" : `${windowRect.height - visibleTop + gap}px`);
  petWindow.style.setProperty("--panel-origin", placeBelow ? "50% 0%" : "50% 100%");
  if (activePanel && panelLayouts[activePanel] && !panelGesture) applyPanelLayout(activePanel);
}

function clearPanelLayout(element: HTMLElement) {
  element.classList.remove("is-user-positioned", "is-moving", "is-resizing");
  element.style.removeProperty("left");
  element.style.removeProperty("top");
  element.style.removeProperty("right");
  element.style.removeProperty("bottom");
  element.style.removeProperty("translate");
  element.style.removeProperty("width");
  element.style.removeProperty("height");
  element.style.removeProperty("--panel-space");
}

function clampPanelLayout(key: PanelKey, layout: PanelLayout): PanelLayout {
  const windowRect = petWindow.getBoundingClientRect();
  const maxWidth = Math.max(180, windowRect.width - 16);
  const maxHeight = Math.max(80, windowRect.height - 16);
  const minWidth = Math.min(panelMinimums[key].width, maxWidth);
  const minHeight = Math.min(panelMinimums[key].height, maxHeight);
  const width = clampBetween(layout.width, minWidth, maxWidth);
  const height = clampBetween(layout.height, minHeight, maxHeight);
  return {
    left: clampBetween(layout.left, 8, Math.max(8, windowRect.width - width - 8)),
    top: clampBetween(layout.top, 8, Math.max(8, windowRect.height - height - 8)),
    width,
    height,
  };
}

function applyPanelLayout(key: PanelKey, draft = panelLayouts[key]) {
  if (!draft) return;
  const panel = panelElements[key];
  const layout = clampPanelLayout(key, draft);
  panel.classList.add("is-user-positioned");
  panel.style.left = `${layout.left}px`;
  panel.style.top = `${layout.top}px`;
  panel.style.right = "auto";
  panel.style.bottom = "auto";
  panel.style.translate = "none";
  panel.style.width = `${layout.width}px`;
  panel.style.height = `${layout.height}px`;
  panel.style.setProperty("--panel-space", `${layout.height}px`);
}

function savePanelLayout(key: PanelKey, layout: PanelLayout) {
  panelLayouts[key] = clampPanelLayout(key, layout);
  try { localStorage.setItem(PANEL_LAYOUT_KEY, JSON.stringify(panelLayouts)); } catch { /* Layout persistence is optional. */ }
}

function resizeCursor(edges: { top: boolean; right: boolean; bottom: boolean; left: boolean }) {
  if ((edges.top && edges.left) || (edges.bottom && edges.right)) return "nwse-resize";
  if ((edges.top && edges.right) || (edges.bottom && edges.left)) return "nesw-resize";
  if (edges.left || edges.right) return "ew-resize";
  if (edges.top || edges.bottom) return "ns-resize";
  return "";
}

function panelEdges(panel: HTMLElement, event: PointerEvent) {
  const rect = panel.getBoundingClientRect();
  const reach = 8;
  return {
    top: Math.abs(event.clientY - rect.top) <= reach,
    right: Math.abs(event.clientX - rect.right) <= reach,
    bottom: Math.abs(event.clientY - rect.bottom) <= reach,
    left: Math.abs(event.clientX - rect.left) <= reach,
  };
}

function resetPanelLayouts() {
  panelLayouts = {};
  try { localStorage.removeItem(PANEL_LAYOUT_KEY); } catch { /* Layout persistence is optional. */ }
  Object.values(panelElements).forEach(clearPanelLayout);
  positionAttachedUi();
  showBubble("弹框的位置和大小已经还原啦。", 5500);
}

function applyAttachedUiLayout(target: OCProfile) {
  attachedUiScale = target.imageScale;
  const readableScale = clampBetween(0.84 + target.imageScale * 0.16, 0.9, 1.06);
  const chatWidth = clampBetween(petWindow.clientWidth * (0.54 + target.imageScale * 0.08), 260, 410);
  petWindow.style.setProperty("--bubble-font", `${clampBetween(14 * readableScale, 13, 16)}px`);
  petWindow.style.setProperty("--chat-width", `${chatWidth}px`);
  petWindow.style.setProperty("--chat-font", `${clampBetween(15 * readableScale, 14, 17)}px`);
  requestAnimationFrame(positionAttachedUi);
  window.clearTimeout(attachedUiTimer);
  attachedUiTimer = window.setTimeout(positionAttachedUi, 300);
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
  applyAttachedUiLayout(profile);
  petWindow.setAttribute("aria-label", `${profile.name}桌宠`);
  document.title = profile.name;
}

function renderState() {
  state.mood = clamp(state.mood); state.satiety = clamp(state.satiety); state.energy = clamp(state.energy);
  (["mood", "satiety", "energy"] as const).forEach((key) => {
    app.querySelector<HTMLOutputElement>(`[data-value="${key}"]`)!.value = String(state[key]);
  });
  app.querySelector<HTMLElement>("[data-affection]")!.textContent = String(state.affection);
  app.querySelector<HTMLElement>("[data-level-heading]")!.textContent = affectionLabel(state.affection);
  savePetState(state);
}

function signedValue(value: number) { return `${value >= 0 ? "+" : ""}${value}`; }

function inventoryEffectSummary(key: ItemKey) {
  const item = profile.inventoryCatalog[key];
  const effects = [
    item.satiety ? `饱腹 ${signedValue(item.satiety)}` : "",
    item.mood ? `心情 ${signedValue(item.mood)}` : "",
    item.energy ? `精力 ${signedValue(item.energy)}` : "",
    item.affection ? `亲密 ${signedValue(item.affection)}` : "",
  ].filter(Boolean);
  return effects.length ? effects.join(" · ") : "无属性变化";
}

function renderInventoryCatalog() {
  INVENTORY_ITEM_KEYS.forEach((key) => {
    const item = profile.inventoryCatalog[key];
    const card = walletPanel.querySelector<HTMLElement>(`[data-item-card="${key}"]`)!;
    card.classList.toggle("is-prop", item.kind === "prop");
    card.querySelector<HTMLElement>(`[data-item-name="${key}"]`)!.textContent = item.name;
    card.querySelector<HTMLElement>(`[data-item-effects="${key}"]`)!.textContent = inventoryEffectSummary(key);
    card.querySelector<HTMLButtonElement>(`[data-item-use="${key}"]`)!.textContent = "赠送";
  });
}

function fillInventoryEditor() {
  INVENTORY_ITEM_KEYS.forEach((key) => {
    const row = inventoryEditor.querySelector<HTMLElement>(`[data-item-editor="${key}"]`)!;
    const item = profile.inventoryCatalog[key];
    row.querySelector<HTMLElement>(`[data-item-editor-name="${key}"]`)!.textContent = item.name;
    (["name", "satiety", "mood", "energy", "affection"] as const).forEach((field) => {
      (row.querySelector(`[data-item-field="${field}"]`) as HTMLInputElement).value = String(item[field]);
    });
    (row.querySelector('[data-item-field="lines"]') as HTMLTextAreaElement).value = item.lines.join("\n");
  });
}

function readInventoryEditor(): InventoryCatalog {
  return Object.fromEntries(INVENTORY_ITEM_KEYS.map((key) => {
    const row = inventoryEditor.querySelector<HTMLElement>(`[data-item-editor="${key}"]`)!;
    const readNumber = (field: string, min: number, max: number) => {
      const value = Number((row.querySelector(`[data-item-field="${field}"]`) as HTMLInputElement).value);
      return Math.round(clampBetween(Number.isFinite(value) ? value : 0, min, max));
    };
    const name = (row.querySelector(`[data-item-field="name"]`) as HTMLInputElement).value.trim();
    return [key, {
      kind: profile.inventoryCatalog[key].kind,
      name: name || profile.inventoryCatalog[key].name,
      satiety: readNumber("satiety", -100, 100),
      mood: readNumber("mood", -100, 100),
      energy: readNumber("energy", -100, 100),
      affection: readNumber("affection", -100, 100),
      lines: (row.querySelector('[data-item-field="lines"]') as HTMLTextAreaElement).value.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 12),
    }];
  })) as InventoryCatalog;
}

function hideBubble(immediate = false) {
  window.clearTimeout(bubbleTimer);
  bubble.classList.remove("is-visible");
  if (immediate) bubble.hidden = true;
  else window.setTimeout(() => { if (!bubble.classList.contains("is-visible")) bubble.hidden = true; }, 220);
}

function showBubble(text: string, duration = 8500) {
  window.clearTimeout(bubbleTimer);
  bubbleText.textContent = text;
  bubble.hidden = false;
  requestAnimationFrame(() => { positionAttachedUi(); bubble.classList.add("is-visible"); });
  replayClass(bubbleText, "is-changing", 420);
  bubbleTimer = window.setTimeout(() => hideBubble(), duration);
}

function closeWheel() { wheel.hidden = true; wheel.classList.remove("is-open"); }
function hidePanels() {
  activePanel = null; statusPanel.hidden = true; dialogueForm.hidden = true; walletPanel.hidden = true; storyPanel.hidden = true;
  inventoryEditor.hidden = true;
  walletPanel.classList.remove("is-editing");
  inventoryEditButton.setAttribute("aria-expanded", "false");
  inventoryEditButton.querySelector("span")!.textContent = "编辑";
}

function openPanel(panel: Exclude<PanelName, null>) {
  hidePanels(); activePanel = panel;
  clearPanelLayout(panelElements[panel]);
  if (panel === "dialogue") { dialogueForm.hidden = false; window.setTimeout(() => messageInput.focus(), 80); }
  if (panel === "status") statusPanel.hidden = false;
  if (panel === "wallet") { fillInventoryEditor(); walletPanel.hidden = false; }
  if (panel === "story") { fillStoryForm(); storyPanel.hidden = false; }
  positionAttachedUi();
  if (panelLayouts[panel]) applyPanelLayout(panel);
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

function linesFor(key: string): string[] {
  const custom = profile.dialogueScripts[key]?.filter(Boolean);
  if (custom?.length) return custom;
  return library.scenarios.find((scenario) => scenario.key === key)?.lines ?? ["我在这里。"];
}

function timeGreeting() {
  const hour = new Date().getHours();
  if (hour < 6) return randomFrom(linesFor("lateNight"));
  if (hour < 11) return randomFrom(linesFor("morning"));
  if (hour < 14) return randomFrom(linesFor("noon"));
  if (hour < 17) return randomFrom(linesFor("afternoon"));
  if (hour < 23) return randomFrom(linesFor("evening"));
  return randomFrom(linesFor("lateNight"));
}

function ambientLine() {
  if (state.satiety < 25) return randomFrom(linesFor("hungry"));
  if (state.energy < 25) return randomFrom(linesFor("tired"));
  if (state.mood > 82) return randomFrom(linesFor("happy"));
  if (Date.now() - lastInteractionAt > 2 * 60 * 60_000) return randomFrom(linesFor("ignored"));
  if (profile.catchphrases.length && Math.random() < 0.42) return randomFrom(profile.catchphrases);
  return Math.random() < 0.45 ? timeGreeting() : randomFrom(linesFor("idle"));
}

function replyFor() { return randomFrom(linesFor("fallback")); }

function doPoke() {
  state.mood = clamp(state.mood + 1); state.affection += 1;
  playPetReaction("poke"); showBubble(randomFrom(linesFor("poke"))); renderState();
}

function doTease() {
  const now = Date.now();
  teaseStreak = now - lastTeaseAt < 2 * 60_000 ? teaseStreak + 1 : 1;
  lastTeaseAt = now;
  const annoyed = teaseStreak >= 3;
  state.mood = clamp(state.mood + (annoyed ? -1 : 1));
  state.affection += annoyed ? 0 : 1;
  playPetReaction(annoyed ? "poke" : "happy");
  showBubble(randomFrom(linesFor(annoyed ? "teaseAngry" : "teaseShy")), 9000);
  renderState();
}

function noteInteraction() {
  lastInteractionAt = Date.now();
  scheduleSedentary();
}

function scheduleSedentary() {
  window.clearTimeout(sedentaryTimer);
  if (!profile.sedentaryEnabled) return;
  const delay = clampBetween(profile.sedentaryMinutes, 20, 240) * 60_000;
  sedentaryTimer = window.setTimeout(() => {
    if (!state.quiet) showBubble(randomFrom(linesFor("sedentary")), 12_000);
    lastInteractionAt = Date.now();
    scheduleSedentary();
  }, delay);
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
    weatherStatus.textContent = "还没有天气数据。";
    weatherStatus.dataset.state = "idle";
    weatherTimer = window.setTimeout(() => void refreshWeather(), 30 * 60_000);
    return;
  }
  try {
    weatherStatus.textContent = "正在查询天气…";
    weatherStatus.dataset.state = "loading";
    currentWeather = await fetchWeather(profile.weatherCity);
    weatherStatus.textContent = `${currentWeather.city} · ${currentWeather.description} · ${Math.round(currentWeather.temperature)}℃`;
    weatherStatus.dataset.state = "success";
    if (announce) {
      if (profile.aiEnabled && !llmInFlight) {
        llmInFlight = true;
        try { showBubble(await requestModelLine("weather"), 10_000); }
        catch { showBubble(weatherLineFor(currentWeather)); }
        finally { llmInFlight = false; }
      } else showBubble(weatherLineFor(currentWeather));
    }
  } catch (error) {
    currentWeather = null;
    weatherStatus.textContent = error instanceof Error ? error.message : "天气暂时没有更新成功。";
    weatherStatus.dataset.state = "error";
    if (announce) showBubble(error instanceof Error ? error.message : "天气暂时没有更新成功。");
  }
  weatherTimer = window.setTimeout(() => void refreshWeather(), 30 * 60_000);
}

function weatherLineFor(weather: WeatherContext) {
  if (weather.temperature > 30) return randomFrom(linesFor("hot"));
  if (weather.temperature < 5) return randomFrom(linesFor("cold"));
  if (weather.description.includes("雷")) return randomFrom(linesFor("thunder"));
  if (weather.description.includes("雪")) return randomFrom(linesFor("snow"));
  if (weather.description.includes("雨")) return randomFrom(linesFor("rain"));
  if (weather.description.includes("雾")) return randomFrom(linesFor("fog"));
  return `${weather.city}现在${weather.description}，约 ${Math.round(weather.temperature)}℃。`;
}

function scheduleLivingMotion() {
  window.clearTimeout(livingTimer); const delay = 36_000 + Math.random() * 42_000;
  livingTimer = window.setTimeout(() => { if (!dragStart) { petMotion.classList.add("is-living"); window.setTimeout(() => petMotion.classList.remove("is-living"), 2600); } scheduleLivingMotion(); }, delay);
}

function fillStoryForm() {
  const fields = storyForm.elements;
  (fields.namedItem("name") as HTMLInputElement).value = profile.name;
  (fields.namedItem("addressName") as HTMLInputElement).value = profile.addressName;
  (fields.namedItem("selfReference") as HTMLInputElement).value = profile.selfReference;
  (fields.namedItem("persona") as HTMLTextAreaElement).value = profile.persona;
  (fields.namedItem("catchphrases") as HTMLTextAreaElement).value = profile.catchphrases.join("\n");
  (fields.namedItem("proactiveMinutes") as HTMLInputElement).value = String(profile.proactiveMinutes);
  (fields.namedItem("sedentaryEnabled") as HTMLInputElement).checked = profile.sedentaryEnabled;
  (fields.namedItem("sedentaryMinutes") as HTMLInputElement).value = String(profile.sedentaryMinutes);
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
  storyForm.querySelectorAll<HTMLTextAreaElement>("[data-script-key]").forEach((textarea) => {
    const key = textarea.dataset.scriptKey!;
    textarea.value = (profile.dialogueScripts[key]?.length ? profile.dialogueScripts[key] : library.scenarios.find((scenario) => scenario.key === key)?.lines ?? []).join("\n");
  });
  connectionBadge.textContent = profile.aiEnabled ? "待连接" : "未启用";
  connectionBadge.dataset.state = "idle";
  updateRangeOutputs();
}

function readStoryForm(): OCProfile {
  const data = new FormData(storyForm);
  const dialogueScripts = Object.fromEntries(Array.from(storyForm.querySelectorAll<HTMLTextAreaElement>("[data-script-key]")).map((textarea) => [
    textarea.dataset.scriptKey!,
    textarea.value.split("\n").map((line) => line.trim()).filter(Boolean),
  ]));
  return {
    ...profile,
    name: String(data.get("name") || profile.name).trim(), addressName: String(data.get("addressName") || profile.addressName).trim(),
    selfReference: String(data.get("selfReference") || "我").trim(),
    persona: String(data.get("persona") || "").trim(),
    catchphrases: String(data.get("catchphrases") || "").split("\n").map((item) => item.trim()).filter(Boolean),
    dialogueScripts,
    proactiveMinutes: clampBetween(Number(data.get("proactiveMinutes")) || 30, 10, 120),
    sedentaryEnabled: data.get("sedentaryEnabled") === "on",
    sedentaryMinutes: clampBetween(Number(data.get("sedentaryMinutes")) || 60, 20, 240),
    imageScale: clampBetween((Number(data.get("imageScale")) || 100) / 100, 0.4, 1.35),
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
  if (button.dataset.action === "tease") {
    window.setTimeout(() => { closeWheel(); doTease(); }, 120);
    return;
  }
  const panel = button.dataset.action as Exclude<PanelName, null>;
  window.setTimeout(() => { closeWheel(); openPanel(panel); }, 120);
});

app.querySelectorAll<HTMLButtonElement>("[data-close-panel]").forEach((button) => button.addEventListener("click", hidePanels));

Object.entries(panelElements).forEach(([panelKey, panel]) => {
  const key = panelKey as PanelKey;
  const interactiveSelector = "button, input, textarea, select, summary, label, a";

  panel.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || panelGesture) return;
    const target = event.target as HTMLElement;
    if (target.closest(interactiveSelector)) return;
    const edges = panelEdges(panel, event);
    const edgeCursor = resizeCursor(edges);
    const canMove = Boolean(target.closest("[data-panel-drag-handle]")) || target === panel;
    if (!edgeCursor && !canMove) return;

    const windowRect = petWindow.getBoundingClientRect();
    const rect = panel.getBoundingClientRect();
    const layout = clampPanelLayout(key, {
      left: rect.left - windowRect.left,
      top: rect.top - windowRect.top,
      width: rect.width,
      height: rect.height,
    });
    panelGesture = {
      key,
      pointerId: event.pointerId,
      mode: edgeCursor ? "resize" : "move",
      edges,
      startX: event.clientX,
      startY: event.clientY,
      layout,
    };
    applyPanelLayout(key, layout);
    panel.classList.add(edgeCursor ? "is-resizing" : "is-moving");
    panel.style.cursor = edgeCursor || "grabbing";
    panel.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  panel.addEventListener("pointermove", (event) => {
    if (!panelGesture || panelGesture.key !== key || panelGesture.pointerId !== event.pointerId) {
      const target = event.target as HTMLElement;
      if (target.closest(interactiveSelector)) panel.style.cursor = "";
      else panel.style.cursor = resizeCursor(panelEdges(panel, event)) || (target.closest("[data-panel-drag-handle]") ? "grab" : "");
      return;
    }

    const dx = event.clientX - panelGesture.startX;
    const dy = event.clientY - panelGesture.startY;
    const start = panelGesture.layout;
    let next: PanelLayout;
    if (panelGesture.mode === "move") {
      next = { ...start, left: start.left + dx, top: start.top + dy };
    } else {
      const { edges } = panelGesture;
      next = {
        left: edges.left ? start.left + dx : start.left,
        top: edges.top ? start.top + dy : start.top,
        width: start.width + (edges.right ? dx : 0) - (edges.left ? dx : 0),
        height: start.height + (edges.bottom ? dy : 0) - (edges.top ? dy : 0),
      };
      const minimum = panelMinimums[key];
      if (next.width < minimum.width && edges.left) next.left -= minimum.width - next.width;
      if (next.height < minimum.height && edges.top) next.top -= minimum.height - next.height;
    }
    applyPanelLayout(key, next);
  });

  const finishPanelGesture = (event: PointerEvent) => {
    if (!panelGesture || panelGesture.key !== key || panelGesture.pointerId !== event.pointerId) return;
    const windowRect = petWindow.getBoundingClientRect();
    const rect = panel.getBoundingClientRect();
    savePanelLayout(key, {
      left: rect.left - windowRect.left,
      top: rect.top - windowRect.top,
      width: rect.width,
      height: rect.height,
    });
    panel.classList.remove("is-moving", "is-resizing");
    panel.style.cursor = "";
    panelGesture = null;
  };
  panel.addEventListener("pointerup", finishPanelGesture);
  panel.addEventListener("pointercancel", finishPanelGesture);
  panel.addEventListener("pointerleave", () => { if (!panelGesture) panel.style.cursor = ""; });
});

inventoryEditButton.addEventListener("click", () => {
  const willOpen = inventoryEditor.hidden;
  if (willOpen) fillInventoryEditor();
  inventoryEditor.hidden = !willOpen;
  walletPanel.classList.toggle("is-editing", willOpen);
  inventoryEditButton.setAttribute("aria-expanded", String(willOpen));
  inventoryEditButton.querySelector("span")!.textContent = willOpen ? "收起" : "编辑";
});

inventoryEditor.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.dataset.itemField !== "name") return;
  const row = target.closest<HTMLElement>("[data-item-editor]");
  const key = row?.dataset.itemEditor as ItemKey | undefined;
  if (key) row!.querySelector<HTMLElement>(`[data-item-editor-name="${key}"]`)!.textContent = target.value.trim() || "未命名道具";
});

inventoryEditor.addEventListener("submit", (event) => {
  event.preventDefault();
  profile = { ...profile, inventoryCatalog: readInventoryEditor() };
  saveOCProfile(profile);
  renderInventoryCatalog();
  inventoryEditor.hidden = true;
  walletPanel.classList.remove("is-editing");
  inventoryEditButton.setAttribute("aria-expanded", "false");
  inventoryEditButton.querySelector("span")!.textContent = "编辑";
  showBubble("荷包的新名字和属性都记住啦。", 6500);
});

walletPanel.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const tab = target.closest<HTMLButtonElement>("button[data-inventory-tab]");
  if (tab) {
    const kind = tab.dataset.inventoryTab;
    walletPanel.querySelectorAll<HTMLButtonElement>("[data-inventory-tab]").forEach((button) => button.setAttribute("aria-selected", String(button === tab)));
    walletPanel.querySelectorAll<HTMLElement>("[data-inventory-section]").forEach((section) => { section.hidden = section.dataset.inventorySection !== kind; });
    return;
  }
  const button = target.closest<HTMLButtonElement>("button[data-item-use]");
  if (!button) return;
  const key = button.dataset.itemUse as ItemKey;
  const item = profile.inventoryCatalog[key];
  state.satiety = clamp(state.satiety + item.satiety);
  state.mood = clamp(state.mood + item.mood);
  state.energy = clamp(state.energy + item.energy);
  state.affection = Math.max(0, state.affection + item.affection);
  replayClass(button, "is-used", 420); playPetReaction("happy");
  showBubble(item.lines.length ? randomFrom(item.lines) : item.kind === "snack" ? `${item.name}很好吃，谢谢你。` : `${item.name}已经用上啦。`);
  renderState();
});

dialogueForm.addEventListener("submit", async (event) => {
  event.preventDefault(); const message = messageInput.value.trim(); if (!message || llmInFlight) return messageInput.focus();
  messageInput.value = ""; state.mood = clamp(state.mood + 1); state.affection += 1; noteInteraction();
  if (profile.aiEnabled) {
    llmInFlight = true; dialogueForm.classList.add("is-loading"); showBubble("让我想一想…", 45_000);
    try { showBubble(await requestModelLine("chat", message), 12_000); }
    catch { showBubble(replyFor(), 10_000); }
    finally { llmInFlight = false; dialogueForm.classList.remove("is-loading"); }
  } else showBubble(replyFor(), 10_000);
  replayClass(petMotion, "is-talking", 1900); renderState(); messageInput.focus();
});

storyForm.addEventListener("input", (event) => {
  if (!(event.target instanceof HTMLInputElement) || event.target.type !== "range") return;
  updateRangeOutputs(); const preview = readStoryForm();
  petLayer.style.setProperty("--oc-scale", String(preview.imageScale)); petLayer.style.setProperty("--oc-x", `${preview.imageX}%`); petLayer.style.setProperty("--oc-y", `${preview.imageY}%`);
  applyAttachedUiLayout(preview);
});

storyForm.addEventListener("submit", (event) => {
  event.preventDefault(); profile = readStoryForm(); saveOCProfile(profile); applyCharacterAppearance(); scheduleAmbient(); scheduleSedentary(); hidePanels();
  void refreshWeather(profile.weatherEnabled);
  showBubble(`话本收好啦。以后就叫我${profile.name}吧。`, 7000);
});

weatherButton.addEventListener("click", async () => {
  if (weatherButton.disabled) return;
  const draft = readStoryForm();
  if (!draft.weatherCity) {
    weatherStatus.textContent = "请先填写城市。";
    weatherStatus.dataset.state = "error";
    return;
  }
  (storyForm.elements.namedItem("weatherEnabled") as HTMLInputElement).checked = true;
  profile = { ...profile, weatherEnabled: true, weatherCity: draft.weatherCity };
  saveOCProfile(profile);
  weatherButton.disabled = true;
  await refreshWeather(true);
  weatherButton.disabled = false;
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
    setConnectionState("error", describeLLMError(error));
  } finally { llmInFlight = false; }
});

updateButton.addEventListener("click", () => {
  if (availableUpdate) showUpdateDialog(availableUpdate);
  else void checkForUpdates(true);
});

updateInstallButton.addEventListener("click", () => void applyAvailableUpdate());
updateSkipButton.addEventListener("click", () => {
  if (availableUpdate) updatePreferences.skippedVersion = availableUpdate.version;
  updatePreferences.remindAfter = 0;
  saveUpdatePreferences();
  hideUpdateDialog();
});
updateRemindButtons.forEach((button) => button.addEventListener("click", () => {
  updatePreferences.remindAfter = Date.now() + UPDATE_REMIND_DELAY;
  saveUpdatePreferences();
  hideUpdateDialog();
}));
updateAutoInput.addEventListener("change", () => {
  updatePreferences.autoInstall = updateAutoInput.checked;
  saveUpdatePreferences();
});
updateDialogLayer.addEventListener("keydown", (event) => {
  if (event.key !== "Tab") return;
  const focusable = Array.from(updateDialogLayer.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)"));
  if (!focusable.length) return;
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
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
app.querySelector("[data-reset-panels]")?.addEventListener("click", resetPanelLayouts);

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
    const profileDefaults = defaultOCProfile();
    profile = { ...profileDefaults, ...pack.profile, inventoryCatalog: normalizeInventoryCatalog(pack.profile.inventoryCatalog, profileDefaults.inventoryCatalog) };
    customImageDataUrl = pack.imageDataUrl || null;
    animationPack = pack.animationPack?.version === 1 ? pack.animationPack : null;
    saveOCProfile(profile);
    await Promise.all([saveOCImage(customImageDataUrl), saveAnimationPack(animationPack)]);
    fillStoryForm(); applyCharacterAppearance(); renderInventoryCatalog(); showBubble("话本、形象和荷包设定都导入好啦。", 6500);
  } catch { showBubble("这个话本文件读不懂，请换一个有效的 JSON 配置包。"); }
});

pet.addEventListener("contextmenu", (event) => { event.preventDefault(); noteInteraction(); hideBubble(true); petMotion.classList.remove("is-pressed"); dragStart = null; openWheel(event.clientX, event.clientY); });
pet.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  noteInteraction();
  pet.setPointerCapture(event.pointerId);
  dragStart = {
    x: event.clientX,
    y: event.clientY,
    left: state.position.x,
    top: state.position.y,
    dialogueLayout: activePanel === "dialogue" && panelLayouts.dialogue ? { ...panelLayouts.dialogue } : undefined,
  };
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
  petWindow.style.setProperty("--ui-drag-x", `${state.position.x}px`); petWindow.style.setProperty("--ui-drag-y", `${state.position.y}px`);
  if (dragStart.dialogueLayout) {
    const dialogueLayout = dragStart.dialogueLayout;
    panelLayouts.dialogue = clampPanelLayout("dialogue", {
      ...dialogueLayout,
      left: dialogueLayout.left + state.position.x - dragStart.left,
      top: dialogueLayout.top + state.position.y - dragStart.top,
    });
    applyPanelLayout("dialogue");
  }
  requestAnimationFrame(positionAttachedUi);
});
pet.addEventListener("pointerup", (event) => {
  if (event.button !== 0 || !dragStart) return;
  const dialogueMovedWithPet = Boolean(dragStart.dialogueLayout && panelLayouts.dialogue);
  petMotion.classList.remove("is-pressed", "is-dragging"); dragStart = null;
  if (dragged) {
    savePetState(state);
    if (dialogueMovedWithPet && panelLayouts.dialogue) savePanelLayout("dialogue", panelLayouts.dialogue);
    window.setTimeout(positionAttachedUi, 150);
  }
  else { closeWheel(); hidePanels(); hideBubble(true); doPoke(); }
});
pet.addEventListener("pointercancel", () => { petMotion.classList.remove("is-pressed", "is-dragging"); dragStart = null; dragged = false; });

document.addEventListener("pointerdown", (event) => {
  noteInteraction();
  if (!wheel.hidden && !(event.target as HTMLElement).closest("[data-wheel]") && !(event.target as HTMLElement).closest("[data-pet]")) closeWheel();
});
document.addEventListener("keydown", (event) => {
  noteInteraction();
  if (event.key === "Escape") {
    if (!updateDialogLayer.hidden) {
      if (!updateInstalling) {
        updatePreferences.remindAfter = Date.now() + UPDATE_REMIND_DELAY;
        saveUpdatePreferences();
        hideUpdateDialog();
      }
    } else if (!wheel.hidden) closeWheel();
    else hidePanels();
  }
});
window.addEventListener("resize", positionAttachedUi);

window.setInterval(() => { state = applyElapsedDecay(state); renderState(); }, 60_000);
petLayer.style.setProperty("--drag-x", `${state.position.x}px`); petLayer.style.setProperty("--drag-y", `${state.position.y}px`);
petWindow.style.setProperty("--ui-drag-x", `${state.position.x}px`); petWindow.style.setProperty("--ui-drag-y", `${state.position.y}px`);
applyCharacterAppearance(); renderInventoryCatalog(); renderState(); hideBubble(true); scheduleAmbient(); scheduleSedentary(); scheduleLivingMotion(); void refreshWeather();
const updatePreviewMode = !isDesktopRuntime() && new URLSearchParams(window.location.search).has("update-preview");
if (updatePreviewMode) {
  window.setTimeout(() => showUpdateDialog({
    currentVersion: packageInfo.version,
    version: "0.1.4",
    body: "新增启动时自动更新提醒。\n支持稍后提醒、跳过当前版本，并优化下载进度与安装反馈。",
  }), 420);
} else window.setTimeout(() => void checkForUpdates(false), 8000);
