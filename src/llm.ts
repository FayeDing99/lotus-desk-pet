import type { OCProfile } from "./oc";
import type { PetState } from "./state";
import type { WeatherContext } from "./weather";
import type { OCExpressionOption } from "./animation-pack";

export interface OCLineResult {
  text: string;
  expression: string | null;
  motion: string | null;
}

export interface LLMMessageRequest {
  profile: OCProfile;
  state: PetState;
  apiKey: string;
  userPrompt: string;
  weather: WeatherContext | null;
  mode: "chat" | "idle" | "weather" | "test";
  expressions?: OCExpressionOption[];
}

interface NativeLLMRequest {
  provider: OCProfile["llmProvider"];
  api_key: string | null;
  base_url: string;
  model: string;
  system_prompt: string;
  user_prompt: string;
}

function weatherLine(weather: WeatherContext | null) {
  if (!weather) return "天气信息：当前未启用或暂时不可用。";
  return `天气信息：${weather.city}现在${weather.description}，${Math.round(weather.temperature)}℃，体感${Math.round(weather.apparentTemperature)}℃，湿度${weather.humidity}%，风速${Math.round(weather.windSpeed)}km/h。`;
}

function systemPrompt(profile: OCProfile, state: PetState, weather: WeatherContext | null, expressions: OCExpressionOption[]) {
  const examples = [
    ...profile.catchphrases,
    ...Object.values(profile.dialogueScripts).flat(),
  ].filter(Boolean).slice(0, 18);
  const expressionChoices = expressions.filter(({ kind }) => kind === "expression").map(({ id, label }) => `${id}=${label}`).join("；");
  const motionChoices = expressions.filter(({ kind }) => kind === "motion").map(({ id, label }) => `${id}=${label}`).join("；");
  return [
    `你正在扮演桌宠 OC「${profile.name}」。`,
    `这个角色称呼用户为「${profile.addressName || "你"}」。`,
    `完整人设：${profile.persona || "温柔安静，愿意陪伴用户。"}`,
    `自称：${profile.selfReference || "我"}。`,
    `常用口头禅：${profile.catchphrases.join("；") || "慢慢来，我在这里。"}`,
    examples.length ? `说话范例：${examples.join("；")}` : "",
    `当前状态：心情${state.mood}，饱腹${state.satiety}，精力${state.energy}，亲密度${state.affection}。`,
    weatherLine(weather),
    expressionChoices
      ? `当前角色可用表情：${expressionChoices}。根据回答语义选择最合适的一项；平静或不确定时选择 idle。`
      : "当前角色没有可切换表情。",
    motionChoices ? `当前角色可用一次性动作：${motionChoices}。只有语境自然匹配时才选择动作，否则返回 null。` : "",
    expressionChoices || motionChoices
      ? '只输出一个 JSON 对象，格式为 {"reply":"角色说的话","expression":"可用表情ID或null","motion":"可用动作ID或null"}。不要使用 Markdown、代码块、动作括号、列表或角色名前缀。'
      : "只输出角色要说的话，不要解释设定，不要加引号、动作括号、列表或角色名前缀。",
    "回复一到两句，优先控制在50个中文字符内；自然、温暖，不要每次都提天气或状态，也不要声称做了现实中未发生的事。",
  ].filter(Boolean).join("\n");
}

function modePrompt(mode: LLMMessageRequest["mode"], userPrompt: string) {
  if (mode === "idle") return "写一句适合桌宠待机时主动说的轻巧陪伴话。不要催促，不要重复问候。";
  if (mode === "weather") return "结合当前天气写一句自然的关心或小提醒，不要像天气播报。";
  if (mode === "test") return "用角色语气说一句连接成功的话。";
  return `用户刚刚说：${userPrompt}`;
}

function cleanReply(value: string) {
  return value.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/^\s*\[[^\]\n]{1,32}\]\s*/, "")
    .replace(/^[(（「『“\"']+|[)）」』”\"']+$/g, "")
    .trim();
}

function matchingExpression(value: unknown, expressions: OCExpressionOption[]) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return expressions.find(({ id, label }) => id.toLowerCase() === normalized || label.trim().toLowerCase() === normalized)?.id ?? null;
}

function expressionForSemantic(semantic: string, expressions: OCExpressionOption[]) {
  const patterns: Record<string, RegExp> = {
    happy: /happy|smile|微笑|开心|開心|高兴|高興|笑/,
    shy: /shy|blush|害羞|脸红|臉紅/,
    surprised: /surprise|stun|呆住|惊讶|驚訝|震惊/,
    annoyed: /annoy|angry|speechless|无语|無語|生气|生氣/,
    sad: /sad|难过|難過|悲伤|悲傷|伤心|傷心/,
    cry: /cry|tear|哭|流泪|流淚/,
    sleepy: /sleepy|drowsy|yawn|困|睡/,
    confused: /confused|puzzled|疑惑|困惑|不解/,
    excited: /excited|兴奋|興奮|激动|激動/,
    talking: /talk|speaking|说话|說話|开口|開口/,
    blink: /blink|闭眼|閉眼/,
    idle: /idle|neutral|default|睁眼|開眼|开眼|待机|待機|正常|平静|平靜/,
  };
  const pattern = patterns[semantic];
  return expressions.find(({ id, label }) => id === semantic || Boolean(pattern?.test(`${id} ${label}`.toLowerCase())))?.id ?? null;
}

export function inferExpression(text: string, expressions: OCExpressionOption[], hint = ""): string | null {
  const expressionOnly = expressions.filter(({ kind }) => kind === "expression");
  if (!expressionOnly.length) return null;
  const value = `${hint} ${text}`;
  const candidates: Array<[string, RegExp]> = [
    ["annoyed", /(生气|够了|不许|讨厌|烦|无语|哼[！!]?|再闹|没有你的份)/],
    ["shy", /(害羞|不好意思|脸红|别这样|靠这么近|才没有|怎、怎么)/],
    ["surprised", /(吓|惊|居然|竟然|呀[！!]|诶[？?！!]|真的[？?])/],
    ["cry", /(哭|眼泪|流泪|呜呜|难受)/],
    ["sad", /(难过|伤心|失落|遗憾|对不起)/],
    ["sleepy", /(困|眼皮|睡|晚安|休息|精力见底)/],
    ["confused", /(不明白|不懂|疑惑|为什么|怎么回事|[？?]$)/],
    ["excited", /(太棒|好耶|期待|兴奋|成功啦|做到了)/],
    ["happy", /(开心|高兴|喜欢|谢谢|很好|真好|好呀|当然|完成|回来啦|收好啦|装好啦)/],
  ];
  for (const [semantic, pattern] of candidates) {
    if (!pattern.test(value)) continue;
    const match = expressionForSemantic(semantic, expressionOnly);
    if (match) return match;
  }
  return expressionForSemantic("idle", expressionOnly) ?? expressionOnly[0]!.id;
}

export function parseOCModelOutput(raw: string, expressions: OCExpressionOption[]): OCLineResult {
  const withoutFence = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  let reply = "";
  let requestedExpression: unknown;
  let requestedMotion: unknown;
  try {
    const parsed = JSON.parse(withoutFence) as { reply?: unknown; text?: unknown; expression?: unknown; motion?: unknown };
    reply = typeof parsed.reply === "string" ? parsed.reply : typeof parsed.text === "string" ? parsed.text : "";
    requestedExpression = parsed.expression;
    requestedMotion = parsed.motion;
  } catch {
    const replyMatch = withoutFence.match(/["']?(?:reply|text)["']?\s*:\s*["']([^"']+)["']/i);
    const looksStructured = /^[{\[]/.test(withoutFence) && /(?:reply|text|expression|motion)\s*:/i.test(withoutFence);
    reply = replyMatch?.[1] ?? (looksStructured ? "" : withoutFence);
    requestedExpression = withoutFence.match(/["']expression["']\s*:\s*["']([^"']+)["']/i)?.[1];
    requestedMotion = withoutFence.match(/["']motion["']\s*:\s*["']([^"']+)["']/i)?.[1];
  }
  const cleaned = cleanReply(reply).slice(0, 140);
  if (!cleaned) throw new Error("模型没有返回文字。");
  return {
    text: cleaned,
    expression: matchingExpression(requestedExpression, expressions.filter(({ kind }) => kind === "expression")) ?? inferExpression(cleaned, expressions),
    motion: matchingExpression(requestedMotion, expressions.filter(({ kind }) => kind === "motion")),
  };
}

export async function generateOCLine(request: LLMMessageRequest): Promise<OCLineResult> {
  if (!("__TAURI_INTERNALS__" in window)) {
    throw new Error("浏览器预览不会发送 API 密钥，请在 Tauri 桌面版中测试连接。");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  const payload: NativeLLMRequest = {
    provider: request.profile.llmProvider,
    api_key: request.apiKey.trim() || null,
    base_url: request.profile.llmBaseUrl,
    model: request.profile.llmModel,
    system_prompt: systemPrompt(request.profile, request.state, request.weather, request.expressions ?? []),
    user_prompt: modePrompt(request.mode, request.userPrompt),
  };
  const text = await invoke<string>("llm_chat", { request: payload });
  return parseOCModelOutput(text, request.expressions ?? []);
}

export function describeLLMError(error: unknown): string {
  const raw = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "";
  const normalized = raw.toLowerCase();

  if (!raw) return "连接失败，但服务没有返回原因。请确认正在使用桌面版。";
  if (normalized.includes("credit_balance_exhausted") || normalized.includes("insufficient_quota")) {
    return "API 余额不足。充值后等待几分钟，再重新测试连接。";
  }
  if (normalized.includes("401") || normalized.includes("invalid_api_key") || normalized.includes("incorrect api key")) {
    return "API Key 无效或已撤销。请重新复制完整密钥，注意不要带空格。";
  }
  if (normalized.includes("403") || normalized.includes("permission") || normalized.includes("forbidden")) {
    return "API Key 权限不足。请允许模型/Responses 写入请求，或新建 All 权限密钥。";
  }
  if (normalized.includes("404") || normalized.includes("model_not_found") || normalized.includes("does not exist")) {
    return "当前账号无法使用这个模型，或模型名称不正确。请检查模型设置。";
  }
  if (normalized.includes("429") || normalized.includes("rate limit")) {
    return "请求过于频繁或账户额度受限，请稍等一分钟后再试。";
  }
  if (normalized.includes("timed out") || normalized.includes("timeout")) {
    return "模型服务连接超时，请检查网络后重试。";
  }
  return raw;
}

export function providerDefaults(provider: OCProfile["llmProvider"]): { model: string; baseUrl: string } {
  if (provider === "anthropic") return { model: "claude-sonnet-4-6", baseUrl: "https://api.anthropic.com/v1/messages" };
  if (provider === "deepseek") return { model: "deepseek-v4-flash", baseUrl: "https://api.deepseek.com/chat/completions" };
  if (provider === "compatible") return { model: "", baseUrl: "https://example.com/v1/chat/completions" };
  return { model: "gpt-5.6-luna", baseUrl: "https://api.openai.com/v1/responses" };
}
