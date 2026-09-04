import type { OCProfile } from "./oc";
import type { PetState } from "./state";
import type { WeatherContext } from "./weather";

export interface LLMMessageRequest {
  profile: OCProfile;
  state: PetState;
  apiKey: string;
  userPrompt: string;
  weather: WeatherContext | null;
  mode: "chat" | "idle" | "weather" | "test";
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

function systemPrompt(profile: OCProfile, state: PetState, weather: WeatherContext | null) {
  const examples = [
    ...profile.catchphrases,
    ...Object.values(profile.dialogueScripts).flat(),
  ].filter(Boolean).slice(0, 18);
  return [
    `你正在扮演桌宠 OC「${profile.name}」。`,
    `这个角色称呼用户为「${profile.addressName || "你"}」。`,
    `完整人设：${profile.persona || "温柔安静，愿意陪伴用户。"}`,
    `自称：${profile.selfReference || "我"}。`,
    `常用口头禅：${profile.catchphrases.join("；") || "慢慢来，我在这里。"}`,
    examples.length ? `说话范例：${examples.join("；")}` : "",
    `当前状态：心情${state.mood}，饱腹${state.satiety}，精力${state.energy}，亲密度${state.affection}。`,
    weatherLine(weather),
    "只输出角色要说的话，不要解释设定，不要加引号、动作括号、列表或角色名前缀。",
    "回复一到两句，优先控制在50个中文字符内；自然、温暖，不要每次都提天气或状态，也不要声称做了现实中未发生的事。",
  ].filter(Boolean).join("\n");
}

function modePrompt(mode: LLMMessageRequest["mode"], userPrompt: string) {
  if (mode === "idle") return "写一句适合桌宠待机时主动说的轻巧陪伴话。不要催促，不要重复问候。";
  if (mode === "weather") return "结合当前天气写一句自然的关心或小提醒，不要像天气播报。";
  if (mode === "test") return "用角色语气说一句连接成功的话。";
  return `用户刚刚说：${userPrompt}`;
}

export async function generateOCLine(request: LLMMessageRequest): Promise<string> {
  if (!("__TAURI_INTERNALS__" in window)) {
    throw new Error("浏览器预览不会发送 API 密钥，请在 Tauri 桌面版中测试连接。");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  const payload: NativeLLMRequest = {
    provider: request.profile.llmProvider,
    api_key: request.apiKey.trim() || null,
    base_url: request.profile.llmBaseUrl,
    model: request.profile.llmModel,
    system_prompt: systemPrompt(request.profile, request.state, request.weather),
    user_prompt: modePrompt(request.mode, request.userPrompt),
  };
  const text = await invoke<string>("llm_chat", { request: payload });
  const cleaned = text.trim().replace(/^[(（「『“\"']+|[)）」』”\"']+$/g, "");
  if (!cleaned) throw new Error("模型没有返回文字。");
  return cleaned.slice(0, 140);
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
