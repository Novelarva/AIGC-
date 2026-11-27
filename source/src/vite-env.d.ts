/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Suno 扩展后端基址，结尾不要带 / */
  readonly VITE_SUNO_API_BASE?: string;
  /** 音乐墙发布接口基址（可选，默认复用 VITE_SUNO_API_BASE） */
  readonly VITE_MUSICWALL_API_BASE?: string;
  /** 设为 "1" 强制走演示模式（即使填了后端地址） */
  readonly VITE_USE_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
