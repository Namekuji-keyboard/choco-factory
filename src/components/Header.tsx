import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Usb, Cpu, Settings, Sun, Moon, Monitor, FolderOpen, ChevronDown, Unplug, HelpCircle, FileDown, Loader2 } from 'lucide-react';
import { useEditor } from '../state/editor';
import { STATUS_LABELS, useDevice, useDeviceDiff, type DeviceStatus } from '../state/device';
import { isSerialSupported } from '../device/studio';
import { MenuItem } from './LayerBar';

const STATUS_COLORS: Record<DeviceStatus | 'editing', string> = {
  disconnected: 'bg-muted/50',
  selecting: 'bg-warn',
  connecting: 'bg-warn animate-pulse',
  locked: 'bg-warn animate-pulse',
  loading: 'bg-warn animate-pulse',
  connected: 'bg-ok',
  editing: 'bg-accent',
  writing: 'bg-accent animate-pulse',
  saved: 'bg-ok',
  error: 'bg-danger',
};

export function useStatus(): DeviceStatus | 'editing' {
  const status = useDevice((s) => s.status);
  const diff = useDeviceDiff();
  if ((status === 'connected' || status === 'saved') && diff) return 'editing';
  return status;
}

export function Header({ onOpen }: { onOpen: (d: 'projects' | 'settings' | 'files' | 'help') => void }) {
  const project = useEditor((s) => s.project);
  const theme = useEditor((s) => s.settings.theme);
  const showSim = useEditor((s) => s.settings.showSimulator);
  const updateSettings = useEditor((s) => s.updateSettings);
  const info = useDevice((s) => s.info);
  const kind = useDevice((s) => s.kind);
  const dev = useDevice((s) => s.dev);
  const connect = useDevice((s) => s.connect);
  const disconnect = useDevice((s) => s.disconnect);
  const status = useStatus();
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setMenu(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menu]);

  const nextTheme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
  const ThemeIcon = theme === 'system' ? Monitor : theme === 'light' ? Sun : Moon;
  const busy = status === 'selecting' || status === 'connecting' || status === 'loading';
  const serialOk = isSerialSupported();

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-3 sm:px-4">
      <div className="flex items-center gap-2">
        <img src="./favicon.svg" alt="" className="h-7 w-7" />
        <span className="hidden text-[15px] font-bold tracking-tight sm:inline">Choco Factory</span>
      </div>
      <button className="btn-ghost ml-1 max-w-[40vw] truncate border border-line" onClick={() => onOpen('projects')} title="プロジェクトの管理">
        <FolderOpen size={15} className="shrink-0" />
        <span className="truncate">{project?.name ?? '…'}</span>
        <ChevronDown size={14} className="shrink-0 text-muted" />
      </button>

      <div className="ml-auto flex items-center gap-1.5">
        <div className="hidden items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-1 text-xs md:flex" title={info ? `${info.name}${dev ? ` (${dev.label})` : ''}` : undefined}>
          <span className={clsx('h-2 w-2 rounded-full', STATUS_COLORS[status])} />
          <span className="font-medium">{STATUS_LABELS[status]}</span>
          {info && <span className="text-muted">· {info.name}</span>}
          {kind && dev && <span className="text-muted">{kind === 'sim' ? 'シミュレーター' : 'USB'}</span>}
        </div>

        {dev ? (
          <button className="btn-outline" onClick={() => disconnect()} title="切断">
            <Unplug size={15} />
            <span className="hidden sm:inline">切断</span>
          </button>
        ) : (
          <div className="relative flex" ref={ref}>
            <button className="btn-primary rounded-r-none" disabled={busy || (!serialOk && !showSim)} onClick={() => connect('usb')} title={serialOk ? 'USB でキーボードに接続' : 'このブラウザは Web Serial に未対応です (Chrome / Edge をお使いください)'}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Usb size={15} />}
              <span className="hidden sm:inline">キーボードに接続</span>
            </button>
            <button className="btn-primary rounded-l-none border-l border-accent-fg/20 px-1.5" onClick={() => setMenu(!menu)} aria-label="接続方法を選ぶ" disabled={busy}>
              <ChevronDown size={14} />
            </button>
            {menu && (
              <div className="panel animate-pop z-30 p-1 shadow-xl max-sm:fixed max-sm:top-14 max-sm:right-3 max-sm:left-3 sm:absolute sm:top-full sm:right-0 sm:mt-1 sm:w-72">
                <MenuItem icon={<Usb size={14} />} disabled={!serialOk} onClick={() => (setMenu(false), connect('usb'))}>
                  <span>
                    USB (推奨)
                    <span className="block text-xs text-muted">右手 (セントラル) を USB-C で接続</span>
                  </span>
                </MenuItem>
                {showSim && (
                  <MenuItem icon={<Cpu size={14} />} onClick={() => (setMenu(false), connect('sim'))}>
                    <span>
                      シミュレーター
                      <span className="block text-xs text-muted">実機なしで接続・書き込みの流れを試す</span>
                    </span>
                  </MenuItem>
                )}
                {!serialOk && <p className="px-2.5 py-1.5 text-xs text-muted">お使いのブラウザは USB 接続 (Web Serial) に対応していません。Chrome または Edge (PC) をお使いください。</p>}
                <p className="border-t border-line px-2.5 pt-1.5 pb-1 text-[11px] text-muted">
                  Bluetooth 経由の編集は、Windows / macOS のブラウザでは ZMK 公式に未対応のため提供していません。キーボード本来の Bluetooth 接続には影響しません。
                </p>
              </div>
            )}
          </div>
        )}

        <button className="btn-ghost p-2" onClick={() => onOpen('files')} title="インポート / エクスポート">
          <FileDown size={17} />
        </button>
        <button className="btn-ghost p-2" onClick={() => onOpen('help')} title="使い方・初回セットアップ">
          <HelpCircle size={17} />
        </button>
        <button className="btn-ghost p-2" onClick={() => onOpen('settings')} title="設定">
          <Settings size={17} />
        </button>
        <button className="btn-ghost p-2" onClick={() => updateSettings({ theme: nextTheme })} title={`テーマ: ${theme === 'system' ? 'システム' : theme === 'light' ? 'ライト' : 'ダーク'}`}>
          <ThemeIcon size={17} />
        </button>
      </div>
    </header>
  );
}
