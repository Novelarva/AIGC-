/**
 * 后端对接配置 —— 音乐扩展（ACE-Step 1.5）功能。
 *
 * 路线：队友在自己带 N 卡的电脑上本地部署 ACE-Step 1.5（uv run acestep-api，默认 8001），
 * 再跑一个中转后端 relay_server.py（默认 8010）替前端转发。前端**只连 relay、绝不直连 8001**
 * （跨域 + localhost 指玩家自己机器，会连错）。
 *
 * 队友把 relay 的局域网地址填进项目根 .env 的 VITE_ACE_API_BASE 后，
 * 前端无需改任何代码，即可从「演示模式」切到真实生成。
 * 部署细节见 src/api/deploy/DEPLOY_GUIDE.md 与同目录 SUNO_EXTENSION_CONTRACT.md。
 */

const env = import.meta.env;

/** 队友中转后端 relay 地址（结尾不要带 /）。默认 http://<队友机局域网IP>:8010 */
export const ACE_API_BASE: string = (
  env.VITE_ACE_API_BASE || env.VITE_SUNO_API_BASE || ""
).replace(/\/+$/, "");

/** 历史命名兼容：早期对接文档用 Suno 风格变量名，这里保留别名避免引用断裂。 */
export const SUNO_API_BASE: string = ACE_API_BASE;

/**
 * 音乐墙发布接口基址（可选）。默认复用 ACE_API_BASE；
 * 如果队友的音乐墙是独立服务，单独填 VITE_MUSICWALL_API_BASE。
 */
export const MUSICWALL_API_BASE: string = (
  env.VITE_MUSICWALL_API_BASE || ACE_API_BASE
).replace(/\/+$/, "");

/**
 * 是否启用「演示模式」：
 *   - 没填 ACE_API_BASE 时自动启用；
 *   - 或显式 VITE_USE_MOCK=1 强制启用（方便后端联调时随时切回本地演示）。
 * 演示模式下 UI 流程与真实后端完全一致，只是用「占位音频」代替 ACE-Step 生成的完整曲子。
 */
export const EXTENSION_USE_MOCK: boolean = env.VITE_USE_MOCK === "1" || ACE_API_BASE === "";

/** 音乐扩展功能总开关（万一要整体下线，把它改成 false 即可） */
export const EXTENSION_ENABLED: boolean = true;

/**
 * 送给 ACE-Step 的「目标时长」参考值（秒）—— ACE-Step 1.5 支持 10~600s。
 * 真实生成时 ExtensionModal 会在 60~120 秒（1~2 分钟）之间随机取一个值，
 * 让每次扩展出的完整曲子长度有差异；此常量仅作兜底默认值。
 */
export const TARGET_DURATION_SECONDS = 90;

/** 参考音频最长录制时长（秒），超过则截断，避免上传体积过大 */
export const MAX_REFERENCE_SECONDS = 60;
