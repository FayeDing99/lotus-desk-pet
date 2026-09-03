use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Deserialize)]
struct LlmRequest {
  provider: String,
  api_key: Option<String>,
  base_url: String,
  model: String,
  system_prompt: String,
  user_prompt: String,
}

fn env_key(provider: &str) -> Option<String> {
  let name = match provider {
    "anthropic" => "ANTHROPIC_API_KEY",
    "deepseek" => "DEEPSEEK_API_KEY",
    _ => "OPENAI_API_KEY",
  };
  std::env::var(name).ok().filter(|value| !value.trim().is_empty())
}

fn response_error(status: reqwest::StatusCode, body: &Value) -> String {
  let message = body.pointer("/error/message").and_then(Value::as_str)
    .or_else(|| body.get("error").and_then(Value::as_str))
    .unwrap_or("服务暂时没有返回可读的错误信息");
  format!("API 请求失败（{}）：{}", status.as_u16(), message)
}

#[tauri::command]
async fn llm_chat(request: LlmRequest) -> Result<String, String> {
  let key = request.api_key.filter(|value| !value.trim().is_empty()).or_else(|| env_key(&request.provider))
    .ok_or_else(|| "没有找到 API Key。请在话本中临时输入，或通过对应环境变量提供。".to_string())?;
  if request.model.trim().is_empty() || request.base_url.trim().is_empty() {
    return Err("请填写模型名称和接口地址。".to_string());
  }

  let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(45)).build().map_err(|error| error.to_string())?;
  let mut builder = client.post(&request.base_url).header("content-type", "application/json");
  let body = match request.provider.as_str() {
    "anthropic" => {
      builder = builder.header("x-api-key", key).header("anthropic-version", "2023-06-01");
      json!({
        "model": request.model,
        "max_tokens": 160,
        "system": request.system_prompt,
        "messages": [{"role": "user", "content": request.user_prompt}]
      })
    }
    "openai" => {
      builder = builder.bearer_auth(key);
      json!({
        "model": request.model,
        "instructions": request.system_prompt,
        "input": request.user_prompt,
        "max_output_tokens": 160,
        "store": false
      })
    }
    _ => {
      builder = builder.bearer_auth(key);
      json!({
        "model": request.model,
        "messages": [
          {"role": "system", "content": request.system_prompt},
          {"role": "user", "content": request.user_prompt}
        ],
        "max_tokens": 160,
        "stream": false
      })
    }
  };

  let response = builder.json(&body).send().await.map_err(|error| format!("无法连接模型服务：{}", error))?;
  let status = response.status();
  let payload: Value = response.json().await.map_err(|error| format!("模型响应不是有效 JSON：{}", error))?;
  if !status.is_success() { return Err(response_error(status, &payload)); }

  let text = match request.provider.as_str() {
    "anthropic" => payload.pointer("/content/0/text").and_then(Value::as_str),
    "openai" => payload.get("output").and_then(Value::as_array).and_then(|items| {
      items.iter().find_map(|item| item.get("content").and_then(Value::as_array).and_then(|contents| {
        contents.iter().find_map(|content| content.get("text").and_then(Value::as_str))
      }))
    }),
    _ => payload.pointer("/choices/0/message/content").and_then(Value::as_str),
  };
  text.map(str::to_owned).ok_or_else(|| "模型响应中没有找到文字内容。".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .invoke_handler(tauri::generate_handler![llm_chat])
    .run(tauri::generate_context!())
    .expect("运行荷间小主人时发生错误");
}
