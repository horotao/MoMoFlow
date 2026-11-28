import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Download, Play, Plus, SquarePen, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AnimatedToastStack,
  type AnimatedToast,
  type ToastStatus,
} from '@/components/ui/AnimatedToastStack';

const TYPE_SCALE = [
  {
    role: 'Title',
    spec: '16 / 24 · 500',
    sample: '模型与 API 设置',
    className: 'text-base font-medium tracking-tight text-foreground',
  },
  {
    role: 'Body',
    spec: '14 / 20 · 400',
    sample: '将参考图拖入画布节点，输入提示词即可生成候选图。',
    className: 'text-sm font-normal text-foreground',
  },
  {
    role: 'Caption',
    spec: '12 / 16 · 500',
    sample: '已自动保存至本地工作区',
    className: 'text-xs font-medium text-foreground',
  },
  {
    role: 'Micro',
    spec: '11 / 16 · 500',
    sample: 'GENERATION OPTIONS · 3 RUNNING',
    className: 'text-micro font-medium text-muted-foreground',
  },
  {
    role: 'Mono',
    spec: '12 / 16 · 400',
    sample: '⌘ K   ⇧ ⌘ Z   aspect_ratio: "16:9"',
    className: 'font-mono text-xs text-foreground',
  },
] as const;

const WEIGHTS = [
  { label: '400', name: 'Regular', sample: '工作流画布与多节点串联' },
  { label: '500', name: 'Medium', sample: '生成图像 · 导出画布' },
  { label: '600', name: 'Semibold', sample: '节点输出文档标题' },
] as const;

const SURFACE_SWATCHES = [
  { name: 'Canvas', hex: '#090908', bg: 'var(--canvas-background)' },
  { name: 'Node', hex: '#111110', bg: 'var(--background)' },
  { name: 'Card', hex: '#191918', bg: 'var(--card)' },
  { name: 'Subtle', hex: '5%', bg: 'var(--surface-subtle)' },
  { name: 'Muted', hex: '8%', bg: 'var(--muted)' },
  { name: 'Accent', hex: '14%', bg: 'var(--accent)' },
  { name: 'Hover', hex: '17%', bg: 'var(--surface-hover)' },
] as const;

const FOREGROUND_SWATCHES = [
  { name: 'Primary', hex: '#eeeeec', bg: 'var(--foreground)' },
  { name: 'Secondary', hex: '#b5b3ad', bg: 'var(--muted-foreground)' },
  { name: 'Subtle', hex: '#7c7b74', bg: 'var(--foreground-subtle)' },
  { name: 'Success', hex: '#7bcfa0', bg: 'var(--success)' },
  { name: 'Warning', hex: '#e1bc7c', bg: 'var(--warning)' },
  { name: 'Destructive', hex: '#f19797', bg: 'var(--destructive)' },
] as const;

const BLUR_LEVELS = [
  { name: 'Blur S', value: '8px', token: '--blur-sm' },
  { name: 'Blur M', value: '16px', token: '--blur-md' },
  { name: 'Blur L', value: '24px', token: '--blur-lg' },
] as const;

const RADIUS_SCALE = [
  { name: 'XS', value: '4px', token: '--radius-xs' },
  { name: 'SM', value: '8px', token: '--radius-sm' },
  { name: 'MD', value: '12px', token: '--radius-md' },
  { name: 'LG', value: '16px', token: '--radius-lg' },
  { name: 'XL', value: '24px', token: '--radius-xl' },
  { name: 'Full', value: '9999px', token: '--radius-full' },
] as const;

const CONTROL_SIZES = [
  { name: 'XS', value: '24px', token: '--control-xs', radius: 'var(--radius-xs)' },
  { name: 'SM', value: '28px', token: '--control-sm', radius: 'var(--radius-sm)' },
  { name: 'MD', value: '32px', token: '--control-md', radius: 'var(--radius-md)' },
  { name: 'LG', value: '36px', token: '--control-lg', radius: 'var(--radius-sm)' },
  { name: 'XL', value: '40px', token: '--control-xl', radius: 'var(--radius-md)' },
] as const;

const SAMPLE_TOASTS: Record<ToastStatus, Omit<AnimatedToast, 'id'>> = {
  neutral: {
    status: 'neutral',
    title: '画布已保存',
    description: '本地快照已更新至最新版本。',
  },
  info: {
    status: 'info',
    title: '正在排队生成 4 张候选图',
    description: '完成后自动写入当前 Image 节点。',
  },
  loading: {
    status: 'loading',
    title: '模型推理中',
    description: '预计还需 8 秒。',
  },
  success: {
    status: 'success',
    title: '导出成功',
    description: '已保存无损 PNG（2048 × 2048）。',
  },
  error: {
    status: 'error',
    title: 'API 连接失败',
    description: '请检查密钥与服务地址。',
  },
};

function formatTimecode(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function DesignSystemPage() {
  const [showGuides, setShowGuides] = useState(false);
  const [opticalPadding, setOpticalPadding] = useState(true);
  const [opticalCentring, setOpticalCentring] = useState(true);
  const [tick, setTick] = useState(14);
  const [toastStatus, setToastStatus] = useState<ToastStatus>('success');

  useEffect(() => {
    const id = window.setInterval(() => {
      setTick((prev) => (prev + 1) % 180);
    }, 750);
    return () => window.clearInterval(id);
  }, []);

  const zoomSteps = [50, 75, 87, 100, 112, 125, 150, 200];
  const currentZoom = zoomSteps[tick % zoomSteps.length];
  const currentProgress = ((tick * 7) % 100) + 1;
  const activeToast: AnimatedToast = {
    id: `demo-${toastStatus}`,
    ...SAMPLE_TOASTS[toastStatus],
  };

  return (
    <div
      className="min-h-screen text-foreground antialiased"
      style={{ background: 'var(--canvas-background)' }}
    >
      <div className="mx-auto max-w-4xl px-6 py-16 md:px-10 md:py-24">
        {/* Header */}
        <header className="flex flex-wrap items-baseline justify-between gap-4 pb-16">
          <div className="flex items-baseline gap-3">
            <h1 className="text-base font-medium tracking-tight text-foreground">
              MoMoFlow
            </h1>
            <span className="text-xs text-foreground-subtle">Design System</span>
          </div>
          <nav className="flex flex-wrap items-center gap-6 text-xs text-muted-foreground">
            <a href="#type" className="transition-colors hover:text-foreground">
              Type
            </a>
            <a href="#typesetting" className="transition-colors hover:text-foreground">
              Typesetting
            </a>
            <a href="#color" className="transition-colors hover:text-foreground">
              Color
            </a>
            <a href="#surface" className="transition-colors hover:text-foreground">
              Surface
            </a>
            <a href="#radius" className="transition-colors hover:text-foreground">
              Radius &amp; Size
            </a>
            <a href="#optical" className="transition-colors hover:text-foreground">
              Optical
            </a>
            <a href="#components" className="transition-colors hover:text-foreground">
              Components
            </a>
          </nav>
        </header>

        {/* Typography */}
        <section
          id="type"
          className="grid gap-8 border-t border-border/70 py-14 md:grid-cols-[152px_1fr]"
        >
          <div className="flex items-start justify-between md:flex-col md:justify-start md:gap-3">
            <h2 className="text-xs font-medium text-muted-foreground">Typography</h2>
            <button
              type="button"
              onClick={() => setShowGuides((prev) => !prev)}
              className="cursor-pointer text-micro font-medium text-foreground-subtle transition-colors hover:text-foreground"
            >
              {showGuides ? '隐藏基线框' : '显示基线框'}
            </button>
          </div>

          <div className="space-y-12">
            {/* Fonts */}
            <div className="grid gap-8 sm:grid-cols-2">
              <div>
                <div className="text-micro font-medium text-foreground-subtle">
                  Inter · PingFang · Noto
                </div>
                <div className="mt-2.5 text-base font-medium tracking-tight text-foreground">
                  Aa Bb Cc 永 艺 0123456789
                </div>
              </div>
              <div>
                <div className="text-micro font-medium text-foreground-subtle">
                  GeistMono
                </div>
                <div className="mt-2.5 font-mono text-base font-medium tracking-tight text-foreground">
                  Aa Bb Cc 0123456789 {'{}'} =&gt;
                </div>
              </div>
            </div>

            {/* Scale */}
            <div className="divide-y divide-border/60 border-t border-border/60">
              {TYPE_SCALE.map((item) => (
                <div
                  key={item.role}
                  className="grid items-baseline gap-2 py-4 sm:grid-cols-[144px_1fr]"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-medium text-foreground">
                      {item.role}
                    </span>
                    <span className="text-micro font-medium text-foreground-subtle tabular-nums">
                      {item.spec}
                    </span>
                  </div>
                  <div>
                    <span
                      className={
                        showGuides
                          ? `${item.className} inline-block bg-primary/10 outline outline-1 outline-primary/30`
                          : item.className
                      }
                    >
                      {item.sample}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Weights */}
            <div className="grid gap-6 sm:grid-cols-3">
              {WEIGHTS.map((item) => (
                <div key={item.label}>
                  <div className="text-micro font-medium text-foreground-subtle tabular-nums">
                    {item.label} · {item.name}
                  </div>
                  <div
                    className="mt-2 text-sm text-foreground"
                    style={{ fontWeight: Number(item.label) }}
                  >
                    {item.sample}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Typesetting — frameless editorial rows */}
        <section
          id="typesetting"
          className="grid gap-8 border-t border-border/70 py-14 md:grid-cols-[152px_1fr]"
        >
          <h2 className="text-xs font-medium text-muted-foreground">Typesetting</h2>

          <div className="divide-y divide-border/60">
            {/* Tabular */}
            <div className="grid items-baseline gap-3 pb-6 sm:grid-cols-[144px_1fr]">
              <span className="text-xs font-medium text-foreground-subtle">
                tabular-nums
              </span>
              <div className="flex flex-wrap items-baseline gap-6 text-sm tabular-nums">
                <span className="font-medium text-foreground">{currentZoom}%</span>
                <span className="text-muted-foreground">
                  {formatTimecode(tick)} / 03:00
                </span>
                <span className="text-muted-foreground">
                  {currentProgress}% · 2048 × 2048
                </span>
              </div>
            </div>

            {/* Autospace */}
            <div className="grid items-baseline gap-3 py-6 sm:grid-cols-[144px_1fr]">
              <span className="text-xs font-medium text-foreground-subtle">
                text-autospace
              </span>
              <div className="space-y-3 text-sm">
                <div className="flex items-baseline gap-4">
                  <span className="w-12 shrink-0 text-micro font-medium text-foreground-subtle">
                    off
                  </span>
                  <p
                    className="text-muted-foreground"
                    style={{ textAutospace: 'no-autospace' } as React.CSSProperties}
                  >
                    已生成4张2048px高清PNG候选图，耗时8.4s
                  </p>
                </div>
                <div className="flex items-baseline gap-4">
                  <span className="w-12 shrink-0 text-micro font-medium text-foreground-subtle">
                    normal
                  </span>
                  <p
                    className="text-foreground"
                    style={{ textAutospace: 'normal' } as React.CSSProperties}
                  >
                    已生成4张2048px高清PNG候选图，耗时8.4s
                  </p>
                </div>
              </div>
            </div>

            {/* Balance */}
            <div className="grid items-baseline gap-3 py-6 sm:grid-cols-[144px_1fr]">
              <span className="text-xs font-medium text-foreground-subtle">
                text-wrap
              </span>
              <div className="grid max-w-md grid-cols-2 gap-8">
                <div>
                  <div className="text-micro font-medium text-foreground-subtle">
                    default
                  </div>
                  <p className="mt-1.5 text-sm font-medium text-muted-foreground">
                    配置自定义模型与工作流连接参数
                  </p>
                </div>
                <div>
                  <div className="text-micro font-medium text-foreground-subtle">
                    balance
                  </div>
                  <p className="mt-1.5 text-sm font-medium text-balance text-foreground">
                    配置自定义模型与工作流连接参数
                  </p>
                </div>
              </div>
            </div>

            {/* Truncate & Overflow */}
            <div className="grid items-baseline gap-3 py-6 sm:grid-cols-[144px_1fr]">
              <span className="text-xs font-medium text-foreground-subtle">
                overflow
              </span>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="min-w-0">
                  <div className="text-micro font-medium text-foreground-subtle">
                    truncate
                  </div>
                  <p className="mt-1.5 truncate text-xs font-medium text-foreground">
                    赛博朋克雨夜霓虹街道概念图_v4_final_upscaled_4k.png
                  </p>
                </div>
                <div className="min-w-0">
                  <div className="text-micro font-medium text-foreground-subtle">
                    break-words
                  </div>
                  <p className="mt-1.5 break-words font-mono text-xs text-muted-foreground">
                    https://api.momoflow.studio/v1/images/generations/task_01j9x8k2m4n6p8q0
                  </p>
                </div>
              </div>
            </div>

            {/* Document Specimen */}
            <div className="grid items-baseline gap-3 pt-6 sm:grid-cols-[144px_1fr]">
              <span className="text-xs font-medium text-foreground-subtle">
                document
              </span>
              <article className="max-w-lg">
                <h3
                  className="text-balance text-foreground"
                  style={{
                    fontSize: 'var(--type-doc-h1-size)',
                    lineHeight: 'var(--type-doc-h1-line)',
                    fontWeight: 'var(--font-weight-semibold)',
                    letterSpacing: 'var(--tracking-tight)',
                  }}
                >
                  一级标题 · 24 / 32
                </h3>
                <h4
                  className="mt-3 text-balance text-foreground"
                  style={{
                    fontSize: 'var(--type-doc-h2-size)',
                    lineHeight: 'var(--type-doc-h2-line)',
                    fontWeight: 'var(--font-weight-semibold)',
                    letterSpacing: 'var(--tracking-tight)',
                  }}
                >
                  二级标题 · 18 / 28
                </h4>
                <p
                  className="mt-2.5 text-pretty text-muted-foreground"
                  style={{
                    fontSize: 'var(--type-doc-body-size)',
                    lineHeight: 'var(--type-doc-body-line)',
                    lineBreak: 'strict',
                    hangingPunctuation: 'first allow-end last',
                  }}
                >
                  「节点内富文本正文」采用 14 / 24 宽松行高与严格中文避头尾标点，行内代码使用{' '}
                  <code className="rounded-xs bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                    aspect_ratio: &quot;16:9&quot;
                  </code>
                  ，快捷键使用{' '}
                  <kbd className="rounded-xs border border-border bg-background px-1.5 py-0.5 font-mono text-xs text-foreground">
                    ⌘ K
                  </kbd>
                  。
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* Color */}
        <section
          id="color"
          className="grid gap-8 border-t border-border/70 py-14 md:grid-cols-[152px_1fr]"
        >
          <h2 className="text-xs font-medium text-muted-foreground">Color</h2>

          <div className="space-y-10">
            {/* Surfaces Palette Strip */}
            <div>
              <div className="grid grid-cols-4 gap-3 sm:grid-cols-7">
                {SURFACE_SWATCHES.map((item) => (
                  <div key={item.name}>
                    <div
                      className="h-12 w-full rounded-sm border border-border/70"
                      style={{ background: item.bg }}
                    />
                    <div className="mt-2 text-xs font-medium text-foreground">
                      {item.name}
                    </div>
                    <div className="text-micro font-medium text-foreground-subtle tabular-nums">
                      {item.hex}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Foreground & Status Strip */}
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {FOREGROUND_SWATCHES.map((item) => (
                <div key={item.name}>
                  <div
                    className="h-10 w-full rounded-sm border border-border/70"
                    style={{ background: item.bg }}
                  />
                  <div className="mt-2 text-xs font-medium text-foreground">
                    {item.name}
                  </div>
                  <div className="text-micro font-medium text-foreground-subtle tabular-nums">
                    {item.hex}
                  </div>
                </div>
              ))}
            </div>

            {/* Emphasis & Borders */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex h-8 items-center rounded-sm bg-primary px-3 text-xs font-medium text-primary-foreground">
                Primary
              </span>
              <span className="inline-flex h-8 items-center rounded-sm border border-border px-3 text-xs font-medium text-foreground">
                Border · 14%
              </span>
              <span className="inline-flex h-8 items-center rounded-sm border border-border-strong px-3 text-xs font-medium text-foreground">
                Focus · 32%
              </span>
            </div>
          </div>
        </section>

        {/* Surface & Glass */}
        <section
          id="surface"
          className="grid gap-8 border-t border-border/70 py-14 md:grid-cols-[152px_1fr]"
        >
          <h2 className="text-xs font-medium text-muted-foreground">Surface</h2>

          <div
            className="rounded-lg border border-border/70 p-6"
            style={{
              backgroundColor: 'var(--canvas-background)',
              backgroundImage:
                'radial-gradient(var(--canvas-grid-dot) 1px, transparent 1px)',
              backgroundSize: '18px 18px',
            }}
          >
            <div className="grid gap-4 sm:grid-cols-3">
              {BLUR_LEVELS.map((item) => (
                <div
                  key={item.name}
                  className="rounded-md border border-border p-4"
                  style={{
                    background: 'var(--surface-overlay)',
                    backdropFilter: `blur(var(${item.token}))`,
                    boxShadow: 'var(--shadow-overlay)',
                  }}
                >
                  <div className="text-xs font-medium text-foreground">
                    {item.name}
                  </div>
                  <div className="mt-1 text-micro font-medium text-muted-foreground tabular-nums">
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Radius & Control Sizes */}
        <section
          id="radius"
          className="grid gap-8 border-t border-border/70 py-14 md:grid-cols-[152px_1fr]"
        >
          <h2 className="text-xs font-medium text-muted-foreground">
            Radius &amp; Size
          </h2>

          <div className="space-y-10">
            {/* Radius Swatches */}
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
              {RADIUS_SCALE.map((item) => (
                <div key={item.name}>
                  <div
                    className="h-14 w-full border border-border/80 bg-card"
                    style={{ borderRadius: `var(${item.token})` }}
                  />
                  <div className="mt-2 text-xs font-medium text-foreground">
                    {item.name}
                  </div>
                  <div className="text-micro font-medium text-foreground-subtle tabular-nums">
                    {item.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Concentric Nesting */}
            <div className="flex flex-wrap items-center gap-5">
              <div
                className="inline-flex items-center gap-1 border border-border bg-card p-1"
                style={{ borderRadius: 'var(--radius-lg)' }}
              >
                {['选择', '抓手', '缩放'].map((label, idx) => (
                  <span
                    key={label}
                    className={
                      idx === 0
                        ? 'inline-flex items-center bg-accent px-3 text-xs font-medium text-foreground'
                        : 'inline-flex items-center px-3 text-xs font-medium text-muted-foreground'
                    }
                    style={{
                      height: 'var(--control-md)',
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    {label}
                  </span>
                ))}
              </div>
              <span className="text-micro font-medium text-foreground-subtle tabular-nums">
                16px = 12px + 4px
              </span>
            </div>

            {/* Control Heights */}
            <div className="flex flex-wrap items-end gap-3">
              {CONTROL_SIZES.map((item) => (
                <div key={item.name} className="flex items-center gap-1.5">
                  <div
                    className="inline-flex items-center justify-center border border-border bg-card px-3 text-xs font-medium text-foreground tabular-nums"
                    style={{
                      height: `var(${item.token})`,
                      borderRadius: item.radius,
                    }}
                  >
                    {item.name} · {item.value}
                  </div>
                  <div
                    className="inline-flex items-center justify-center border border-border bg-card text-muted-foreground"
                    style={{
                      width: `var(${item.token})`,
                      height: `var(${item.token})`,
                      borderRadius: item.radius,
                    }}
                  >
                    <Plus
                      size={item.name === 'XS' ? 12 : item.name === 'XL' ? 16 : 14}
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Optical Alignment */}
        <section
          id="optical"
          className="grid gap-8 border-t border-border/70 py-14 md:grid-cols-[152px_1fr]"
        >
          <h2 className="text-xs font-medium text-muted-foreground">Optical</h2>

          <div className="divide-y divide-border/60">
            {/* Optical Padding (Icon + Text) */}
            <div className="grid items-start gap-3 pb-8 sm:grid-cols-[144px_1fr]">
              <div className="flex items-center justify-between sm:flex-col sm:items-start sm:gap-2">
                <span className="text-xs font-medium text-foreground-subtle">
                  optical padding
                </span>
                <button
                  type="button"
                  onClick={() => setOpticalPadding((prev) => !prev)}
                  className="cursor-pointer text-micro font-medium text-foreground-subtle transition-colors hover:text-foreground"
                >
                  {opticalPadding ? '已开启 (-2px)' : '已关闭 (等距)'}
                </button>
              </div>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <Button
                    variant="secondary"
                    className={opticalPadding ? 'rounded-full' : 'rounded-full !px-4'}
                  >
                    <ArrowLeft aria-hidden="true" />
                    Back
                  </Button>
                  <Button
                    variant="secondary"
                    className={opticalPadding ? 'rounded-full' : 'rounded-full !px-4'}
                  >
                    <Download aria-hidden="true" />
                    Save file
                  </Button>
                  <Button
                    variant="secondary"
                    className={opticalPadding ? 'rounded-full' : 'rounded-full !px-4'}
                  >
                    Continue
                    <ArrowRight aria-hidden="true" />
                  </Button>
                </div>
                <div className="font-mono text-xs text-foreground-subtle tabular-nums">
                  {opticalPadding
                    ? 'icon side -2px · has-[>svg:first-child:not(:last-child)]:pl-3.5'
                    : 'padding-inline: 16px 16px'}
                </div>
              </div>
            </div>

            {/* Optical Centring (Icon-only) */}
            <div className="grid items-start gap-3 pt-8 sm:grid-cols-[144px_1fr]">
              <div className="flex items-center justify-between sm:flex-col sm:items-start sm:gap-2">
                <span className="text-xs font-medium text-foreground-subtle">
                  optical centring
                </span>
                <button
                  type="button"
                  onClick={() => setOpticalCentring((prev) => !prev)}
                  className="cursor-pointer text-micro font-medium text-foreground-subtle transition-colors hover:text-foreground"
                >
                  {opticalCentring ? '已开启 (重心微调)' : '已关闭 (几何居中)'}
                </button>
              </div>
              <div className="flex flex-wrap items-start gap-6">
                {[
                  {
                    name: 'Play',
                    nudge: 'x +1px',
                    transform: 'translateX(1px)',
                    icon: <Play size={16} fill="currentColor" aria-hidden="true" />,
                  },
                  {
                    name: 'SquarePen',
                    nudge: 'x +0.5  y -0.5',
                    transform: 'translate(0.5px, -0.5px)',
                    icon: <SquarePen size={16} aria-hidden="true" />,
                  },
                  {
                    name: 'Delete',
                    nudge: 'y -0.25px',
                    transform: 'translateY(-0.25px)',
                    icon: <Trash2 size={16} aria-hidden="true" />,
                  },
                ].map((item) => (
                  <div key={item.name} className="flex flex-col items-center gap-2">
                    <div
                      className="relative inline-flex items-center justify-center rounded-full border border-border bg-card text-foreground"
                      style={{
                        width: 'var(--control-xl)',
                        height: 'var(--control-xl)',
                      }}
                    >
                      <span
                        className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-border/50"
                        aria-hidden="true"
                      />
                      <span
                        className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-border/50"
                        aria-hidden="true"
                      />
                      <span
                        className="relative inline-flex transition-transform duration-150"
                        style={{
                          transform: opticalCentring ? item.transform : 'none',
                        }}
                      >
                        {item.icon}
                      </span>
                    </div>
                    <div className="text-xs font-medium text-foreground">{item.name}</div>
                    <div className="font-mono text-micro text-foreground-subtle tabular-nums">
                      {opticalCentring ? item.nudge : '0, 0'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Components */}
        <section
          id="components"
          className="grid gap-8 border-t border-border/70 py-14 md:grid-cols-[152px_1fr]"
        >
          <h2 className="text-xs font-medium text-muted-foreground">Components</h2>

          <div className="space-y-10">
            <div className="flex flex-wrap items-center gap-2.5">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Delete</Button>
              <Button size="sm" variant="outline">
                Small
              </Button>
              <Button variant="outline">
                <Download aria-hidden="true" />
                Export
              </Button>
              <Button size="icon" variant="outline" aria-label="Play">
                <Play
                  size={16}
                  fill="currentColor"
                  className="translate-x-[1px]"
                  aria-hidden="true"
                />
              </Button>
            </div>

            <div className="space-y-4">
              <div className="flex flex-wrap gap-1.5">
                {(['neutral', 'info', 'loading', 'success', 'error'] as const).map(
                  (status) => (
                    <Button
                      key={status}
                      size="sm"
                      variant={toastStatus === status ? 'default' : 'ghost'}
                      onClick={() => setToastStatus(status)}
                    >
                      {status}
                    </Button>
                  ),
                )}
              </div>
              <AnimatedToastStack
                toasts={[activeToast]}
                placement="static"
                className="max-w-sm"
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
