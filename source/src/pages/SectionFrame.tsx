import type { CSSProperties } from "react";

interface Props {
  /** 队友栏目的独立页面地址（放在 public/sections/ 下，互不干扰） */
  src: string;
  /** 无障碍标题 */
  title: string;
  /** 返回首页 */
  onBack: () => void;
}

/**
 * 一个"跳转链接"容器：用 iframe 把队友各自独立的栏目页面原样加载进来。
 *
 * 为什么用 iframe 而不是 import：
 * - 队友的「音乐墙」「社区」是各自独立、互不依赖的纯静态页面（独立 HTML/CSS/JS）。
 * - iframe 让它们的代码完全隔离在自己的文档里，我们一行都不用改（"不搞乱各个的代码"）。
 * - 首页这边只负责"跳过去 / 跳回来"，以后队友更新他们的页面，只要重拷 public/sections/ 下对应文件夹即可。
 */
export function SectionFrame({ src, title, onBack }: Props) {
  return (
    <div className="section-frame">
      <button type="button" className="section-frame__back" onClick={onBack}>
        ← 返回首页
      </button>
      <iframe
        className="section-frame__iframe"
        src={src}
        title={title}
        // 允许页面自身滚动；沙箱只放开脚本与同源（本地同源，无跨域需求）
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
}
