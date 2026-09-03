# 安全与隐私

## API Key

- 不要把真实 API Key 写入源码、`.env.example`、OC 话本或动画包。
- 界面中的 API Key 只存在于当前运行内存，关闭应用后不会保留。
- 本地开发可通过 `OPENAI_API_KEY`、`ANTHROPIC_API_KEY`、`DEEPSEEK_API_KEY` 环境变量提供密钥。
- `.env`、私钥和证书文件均已加入 `.gitignore`。

## 发布签名

Tauri 自动更新的私钥只保存在本地忽略目录和 GitHub Actions Secret 中。仓库只包含对应公钥。若私钥丢失，已安装版本将无法验证由新密钥签名的更新，因此请在安全位置保留离线备份。

## 用户数据

OC 图片、二维动画包、话本、状态和积分默认保存在本机 WebView 数据目录中，不会自动上传 GitHub。只有用户主动调用已配置的大模型或天气功能时，所需上下文才会发送给相应服务商。
