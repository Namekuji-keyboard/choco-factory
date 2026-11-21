import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useEditor } from './state/editor';
import { useDevice } from './state/device';
import { Header } from './components/Header';
import { LayerBar } from './components/LayerBar';
import { OsBar } from './components/OsBar';
import { CombosDialog, EncoderDialog, ShortcutsDialog } from './components/Features';
import { absLayer, splitLayerIndex } from './model/os';
import { KeyboardView } from './components/KeyboardView';
import { KeyPanel } from './components/KeyPanel';
import { KeyPicker } from './components/KeyPicker';
import { Footer } from './components/Footer';
import { ApplyDialog, ErrorBanner, FilesDialog, HelpDialog, LockedDialog, PendingLoadDialog, ProjectsDialog, SettingsDialog, Toasts } from './components/Dialogs';

type DialogName = 'projects' | 'settings' | 'files' | 'help' | 'apply' | null;

export default function App() {
  const ready = useEditor((s) => s.ready);
  const init = useEditor((s) => s.init);
  const theme = useEditor((s) => s.settings.theme);
  const kb = useEditor((s) => s.keyboard);
  const confirmApply = useEditor((s) => s.settings.confirmApply);
  const dev = useDevice((s) => s.dev);
  const apply = useDevice((s) => s.apply);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [feature, setFeature] = useState<'shortcuts' | 'combos' | { encoder: number } | null>(null);
  const isOs = useEditor((s) => !!s.project?.os);

  useEffect(() => {
    init().catch((e) => {
      console.error(e);
      alert(`ブラウザの保存領域 (IndexedDB) を開けませんでした。プライベートブラウズでは利用できない場合があります。\n${e}`);
    });
  }, [init]);

  // テーマ
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
      try {
        localStorage.setItem('choco-theme', theme === 'system' ? '' : theme);
      } catch {
        /* noop */
      }
    };
    applyTheme();
    mq.addEventListener('change', applyTheme);
    return () => mq.removeEventListener('change', applyTheme);
  }, [theme]);

  // キーボードショートカット
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]') || document.querySelector('[role=dialog]')) return;
      const s = useEditor.getState();
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z' && !e.shiftKey) s.undo();
      else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) s.redo();
      else if (mod && k === 'c') s.copy();
      else if (mod && k === 'v') s.paste();
      else if (mod && k === 'a') s.selectAll();
      else if ((e.key === 'Delete' || e.key === 'Backspace') && s.selected.length) s.assign({ b: 'trans', p: [] }, '透過に設定');
      else if (e.key === 'Escape') s.clearSelection();
      else if (e.altKey && /^[0-9]$/.test(e.key) && s.project?.os && Number(e.key) < s.project.os.layersPerOs) {
        // Alt + 数字: 表示中の OS の Layer n
        const os = s.project.os;
        s.setLayerIndex(absLayer(os, splitLayerIndex(os, s.layerIndex).os, Number(e.key)));
      } else if (e.altKey && /^[0-9]$/.test(e.key) && s.project && Number(e.key) < s.project.layers.length) s.setLayerIndex(Number(e.key));
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onApply = () => {
    if (!dev) {
      setDialog('help');
      useEditor.getState().toast('info', 'まず「キーボードに接続」で右手 (セントラル) の XIAO に接続してください');
      return;
    }
    if (confirmApply) setDialog('apply');
    else void apply();
  };

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <Header onOpen={setDialog} />
      <ErrorBanner />
      <main className="scroll-thin min-h-0 flex-1 overflow-y-auto lg:flex lg:overflow-hidden">
        <div className="flex min-w-0 flex-col lg:min-h-0 lg:flex-1">
          <div className="space-y-3 px-3 pt-3 sm:px-5 sm:pt-4">
            {isOs ? <OsBar onShortcuts={() => setFeature('shortcuts')} onCombos={() => setFeature('combos')} /> : <LayerBar />}
            <div className="panel overflow-x-auto px-2 py-4 sm:px-6 sm:py-5">
              <KeyboardView onEncoder={(i) => setFeature({ encoder: i })} />
              <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-muted">
                <span>{kb.name}</span>
                <span>{kb.controller}</span>
                <span>ZMK {kb.zmkVersion}</span>
                <span>▽ = 透過</span>
                <span>◎ = エンコーダー (クリックで設定)</span>
                {dev && (
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-warn" /> = キーボードに未適用
                  </span>
                )}
              </div>
            </div>
          </div>
          {/* スマホ・タブレットではキー設定をキーボードのすぐ下に表示 */}
          <div className="panel mx-3 mt-3 overflow-hidden sm:mx-5 lg:hidden">
            <KeyPanel />
          </div>
          <div className="panel m-3 h-[460px] overflow-hidden sm:mx-5 sm:mb-4 lg:h-auto lg:min-h-[260px] lg:flex-1">
            <KeyPicker />
          </div>
        </div>
        <aside className="panel hidden overflow-hidden lg:mt-4 lg:mr-5 lg:mb-4 lg:block lg:w-[340px] lg:shrink-0 xl:w-[380px]">
          <KeyPanel />
        </aside>
      </main>
      <Footer onApply={onApply} onConnectHelp={() => setDialog('help')} />

      <ProjectsDialog open={dialog === 'projects'} onClose={() => setDialog(null)} />
      <SettingsDialog open={dialog === 'settings'} onClose={() => setDialog(null)} />
      <FilesDialog open={dialog === 'files'} onClose={() => setDialog(null)} />
      <HelpDialog open={dialog === 'help'} onClose={() => setDialog(null)} onFiles={() => setDialog('files')} />
      <ApplyDialog
        open={dialog === 'apply'}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          setDialog(null);
          void apply();
        }}
      />
      {feature === 'shortcuts' && <ShortcutsDialog onClose={() => setFeature(null)} />}
      {feature === 'combos' && <CombosDialog onClose={() => setFeature(null)} />}
      {feature && typeof feature === 'object' && <EncoderDialog sensorIndex={feature.encoder} onClose={() => setFeature(null)} />}
      <LockedDialog />
      <PendingLoadDialog />
      <Toasts />
    </div>
  );
}
