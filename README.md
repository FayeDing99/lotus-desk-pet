# 荷间小主人

可复用的 OC 桌宠原型。使用透明 PNG，包含轻柔待机动画、窗口/预览拖动、右键跟随轮盘、戳一戳积分、本地关键词对话、状态与荷包、OC 话本、本地持久化、每日 50 分上限，以及基础定时行为。

## 立即预览

```bash
npm install
npm run dev
```

浏览器打开 `http://127.0.0.1:1420`。左键单击角色会“戳一戳”，右键单击会在指针附近打开聊天、状态、荷包、话本轮盘；拖动角色时，浏览器预览会移动角色，Tauri 会移动整个透明窗口。

## 桌面运行

先安装 Rust 与系统所需的 Tauri 依赖，再运行：

```bash
npm run tauri dev
```

当前配置会创建 560×700 的透明、无边框、置顶窗口。当前机器没有 Rust 工具链，因此本次验证使用浏览器版本。

## 更换 OC 与编辑话本

右键角色打开“话本”，可上传或拖入单张 PNG/WebP，也可选择一个 OC 分层动画文件夹。大小、位置、名字、性格、语气、口头禅、关键词回复和主动发言间隔都可以独立调整。配置和图片保存在本地；“导出”会生成包含形象、动画包和话本的 JSON 配置包，其他 OC 可以直接“导入”复用。

### 大模型与实时内容

在“话本”底部展开“大模型与实时内容”，可以选择 OpenAI、Claude、DeepSeek 或 OpenAI Chat Completions 兼容接口，自定义模型名和接口地址。开启后：

- 主动聊天优先使用大模型，并把 OC 性格、语气、称呼、状态和天气组合成角色提示词。
- 待机内容默认 50% 来自模型、50% 来自固定话本，比例可调；请求失败会无感回退到本地话本。
- 开启实时天气并填写城市后，会通过 Open-Meteo 定时更新当前天气，作为模型上下文和天气提醒来源。

API Key 输入框只保留在当前运行中的页面，不会写入 OC 配置或导出文件。桌面版也支持从环境变量读取：`OPENAI_API_KEY`、`ANTHROPIC_API_KEY`、`DEEPSEEK_API_KEY`。模型请求由 Tauri 本地端转发；浏览器预览不会发送密钥，只用于检查界面和本地功能。

界面中预置的是服务商公开接口，不是开发者或用户的私人地址：OpenAI `https://api.openai.com/v1/responses`、Anthropic `https://api.anthropic.com/v1/messages`、DeepSeek `https://api.deepseek.com/chat/completions`。兼容接口中的 `example.com` 只是明确的占位示例，需要用户自行替换；程序不会内置任何人的 API Key。

### 自有 OC 二维动画包

本项目实现的是轻量、自有格式的 OC 二维动画包，不依赖 Live2D Cubism SDK，也不需要为每次播放动作付费。把同一画布尺寸、位置已经对齐的透明 PNG/WebP 图层放进一个文件夹，即可在“话本 → 导入 OC 动画包”中选择整个文件夹。基础运行时会自动提供：

- 整体呼吸、待机轻摆、戳一戳 Q 弹与开心反馈。
- 眼睛自动眨眼、嘴型随说话轻动。
- 前发、后发和饰品的轻微惯性摆动。
- 动画包本地保存、随 OC 话本一起导入和导出。

如果不放配置清单，程序会根据文件名自动判断图层角色。建议使用 `body/身体`、`head/头`、`eyes/眼`、`mouth/嘴`、`hair-back/后发`、`hair-front/前发`、`accessory/饰品`、`background/背景`、`foreground/前景` 等关键词。需要精确控制图层顺序和旋转中心时，可复制 `public/oc-package.example.json` 到动画包根目录并改名为 `oc-package.json`。

推荐的文件夹结构：

```text
我的OC/
  oc-package.json        # 可选
  layers/
    01_hair-back.png
    02_body.png
    03_head.png
    04_eyes.png
    05_mouth.png
    06_hair-front.png
    07_accessory.png
```

PSD 仍然适合作为绘制源文件，但基础版不会直接解析任意 PSD。请先把需要动的部分导出成位置对齐、画布尺寸一致的透明图层。它也不是骨骼变形系统：当前主要是图层级的缩放、旋转、位移和眨眼；要做到头发网格变形、转头和精准口型，后续需要再增加参数绑定或专门的骨骼/网格运行时。

## 编辑基础本地话库

直接修改 `public/dialogue.json`。关键词按顺序匹配，OC 话本里的自定义关键词优先；未命中时使用 `fallback`。主动发言间隔也可在“话本”里调整。

## 本地数据

状态与 OC 配置保存在 WebView/浏览器的 `localStorage` 中，上传的角色图片保存在 IndexedDB 中。饱腹度每 15 分钟下降 1，精力每 20 分钟下降 1；低状态会缓慢影响心情。每日互动积分按本地日期重置，上限为 50。

## GitHub 发布与自动更新

项目已配置 GitHub Actions：`main` 分支会检查前端构建，推送 `v*` 标签时会为 macOS、Windows 和 Linux 构建桌面安装包、创建 GitHub Release，并生成 Tauri 自动更新所需的 `latest.json` 与签名文件。

自动更新地址当前固定为 `FayeDing99/lotus-desk-pet`。如果更改 GitHub 用户名或仓库名，需要同步修改 `src-tauri/tauri.conf.json` 中的 updater endpoint。

首次发布前，在仓库 **Settings → Secrets and variables → Actions** 中创建：

- `TAURI_SIGNING_PRIVATE_KEY`：填入本机 `.local-secrets/tauri-updater.key` 的完整内容。

私钥目录已被 Git 忽略，绝不能提交。请额外离线备份；如果私钥丢失，已经安装的版本将不能验证由新密钥签名的升级包。

发布新版本：

```bash
npm run version:set -- 0.2.0
npm run build
git add .
git commit -m "release: v0.2.0"
git push
git tag v0.2.0
git push origin v0.2.0
```

推送标签后，GitHub 会自动生成 Release。桌面端可在“话本 → 应用更新”中检查并安装；应用启动后也会静默检查一次。使用 GitHub Releases 作为无需登录的更新源时，仓库或更新文件必须可以公开访问。若源码需要长期保持私有，建议另设一个只公开签名安装包的 releases 仓库。

更多安全规则见 `SECURITY.md`。`.env`、本地私钥、构建输出、工作文件和包含本机路径的视觉检查材料都不会进入 Git 仓库。
