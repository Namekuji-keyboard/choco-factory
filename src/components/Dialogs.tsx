import { useRef, useState } from 'react';
import clsx from 'clsx';
import { Plus, Copy, Trash2, Pencil, Check, Download, Upload, FileCode2, FileArchive, FileJson, DatabaseBackup, KeyRound, Usb, CircleCheck, CircleX, Info, Cpu, Unlock } from 'lucide-react';
import { Modal, Section } from './ui';
import { useEditor } from '../state/editor';
import { useDevice, useDeviceDiff } from '../state/device';
import { buildKeymap, buildZip, download, projectFile, safeName, type ZipVariant } from '../lib/files';
import { isProjectFile } from '../model/project';
import { createBackup, restoreBackup } from '../storage/db';
import { newId } from '../model/project';
import { planApply } from '../device/sync';

// ---------------------------------------------------------------------------
// プロジェクト管理
// ---------------------------------------------------------------------------
export function ProjectsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const projects = useEditor((s) => s.projects);
  const current = useEditor((s) => s.project);
  const openProject = useEditor((s) => s.openProject);
  const newProject = useEditor((s) => s.newProject);
  const rename = useEditor((s) => s.renameProject);
  const duplicate = useEditor((s) => s.duplicateProject);
  const remove = useEditor((s) => s.deleteProject);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');

  return (
    <Modal open={open} onClose={onClose} title="プロジェクト" wide>
      <p className="mb-3 text-sm text-muted">プロジェクトはこのブラウザ内 (IndexedDB) に自動保存されます。他の人やサーバーには送信されません。</p>
      <div className="mb-4 flex gap-2">
        <input className="input" placeholder="新しいプロジェクト名" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && (newProject(name.trim()), setName(''), onClose())} />
        <button className="btn-primary shrink-0" disabled={!name.trim()} onClick={() => (newProject(name.trim()), setName(''), onClose())}>
          <Plus size={15} /> 新規作成
        </button>
      </div>
      <ul className="divide-y divide-line rounded-xl border border-line">
        {projects.map((p) => (
          <li key={p.id} className={clsx('flex items-center gap-2 px-3 py-2', p.id === current?.id && 'bg-accent-soft/60')}>
            {editing === p.id ? (
              <input
                autoFocus
                className="input"
                defaultValue={p.name}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v) rename(p.id, v);
                  setEditing(null);
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            ) : (
              <button className="min-w-0 flex-1 text-left" onClick={() => (openProject(p.id), onClose())}>
                <div className="truncate text-sm font-medium">
                  {p.name} {p.id === current?.id && <span className="ml-1 text-xs text-accent">(編集中)</span>}
                </div>
                <div className="text-xs text-muted">更新: {new Date(p.updatedAt).toLocaleString('ja-JP')}</div>
              </button>
            )}
            <button className="btn-ghost p-1.5" title="名前を変更" onClick={() => setEditing(p.id)}>
              <Pencil size={14} />
            </button>
            <button className="btn-ghost p-1.5" title="複製" onClick={() => duplicate(p.id)}>
              <Copy size={14} />
            </button>
            <button className="btn-ghost p-1.5 text-danger" title="削除" onClick={() => confirm(`「${p.name}」を削除しますか？この操作は元に戻せません。`) && remove(p.id)}>
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// 設定
// ---------------------------------------------------------------------------
export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useEditor((s) => s.settings);
  const update = useEditor((s) => s.updateSettings);
  const persistent = useEditor((s) => s.persistent);
  const dev = useDevice((s) => s.dev);
  const resetDevice = useDevice((s) => s.resetDevice);
  return (
    <Modal open={open} onClose={onClose} title="設定">
      <Section title="表示">
        <label className="label">テーマ</label>
        <div className="mb-3 flex gap-1">
          {(
            [
              ['system', 'システムに合わせる'],
              ['light', 'ライト'],
              ['dark', 'ダーク'],
            ] as const
          ).map(([v, l]) => (
            <button key={v} className="chip" data-on={settings.theme === v} onClick={() => update({ theme: v })}>
              {l}
            </button>
          ))}
        </div>
        <label className="label">PC のキーボード配列 (キー表示に使用)</label>
        <div className="flex gap-1">
          {(
            [
              ['jis', 'JIS (日本語配列)'],
              ['us', 'US (英語配列)'],
            ] as const
          ).map(([v, l]) => (
            <button key={v} className="chip" data-on={settings.hostLayout === v} onClick={() => update({ hostLayout: v })}>
              {l}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">キーボードが送るのは「キーの位置」なので、記号の表示は PC 側の配列設定で変わります。</p>
      </Section>
      <Section title="キーボードへの適用">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={settings.confirmApply} onChange={(e) => update({ confirmApply: e.target.checked })} />
          適用前に変更内容を確認する
        </label>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={settings.showSimulator} onChange={(e) => update({ showSimulator: e.target.checked })} />
          接続メニューに「シミュレーター」を表示する (実機なしで動作確認)
        </label>
        <div className="mt-3 rounded-lg border border-line p-3">
          <div className="text-sm font-medium">キーボードを初期化</div>
          <p className="mt-1 text-xs text-muted">Web から保存したキーマップを消去し、ファームウェア (.keymap ファイル) の初期状態に戻します。</p>
          <button
            className="btn-danger mt-2"
            disabled={!dev}
            onClick={() => confirm('キーボードに保存されたキーマップを消去して、ファームウェアの初期状態に戻しますか？') && (resetDevice(), onClose())}
          >
            キーボードを初期化
          </button>
          {!dev && <span className="ml-2 text-xs text-muted">(接続中のみ)</span>}
        </div>
      </Section>
      <Section title="データ">
        <p className="text-sm">
          保存先: このブラウザ (IndexedDB) ・ 永続化:{' '}
          <span className={persistent ? 'text-ok' : 'text-warn'}>{persistent ? '有効' : '未許可 (ブラウザの容量が逼迫すると削除される可能性があります)'}</span>
        </p>
        <p className="mt-1 text-xs text-muted">ブラウザのデータを消去すると保存したプロジェクトも消えます。定期的に「ファイル」→「バックアップ」を保存してください。</p>
      </Section>
      <Section title="このアプリについて">
        <p className="text-xs text-muted">
          Choco Factory v{__APP_VERSION__} ・ ZMK Studio RPC (公式 @zmkfirmware/zmk-studio-ts-client) を使用 ・ MIT License
        </p>
      </Section>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// インポート / エクスポート
// ---------------------------------------------------------------------------
export function FilesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const project = useEditor((s) => s.project);
  const kb = useEditor((s) => s.keyboard);
  const importKeymap = useEditor((s) => s.importKeymap);
  const importProject = useEditor((s) => s.importProject);
  const refresh = useEditor((s) => s.refreshProjects);
  const toast = useEditor((s) => s.toast);
  const [variant, setVariant] = useState<ZipVariant>('studio');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  if (!project) return null;
  const base = safeName(project.name);

  const exportKeymapFile = () => {
    const { text, warnings } = buildKeymap(project, kb);
    setWarnings(warnings);
    download(kb.keymapPath.split('/').pop() ?? 'keymap.keymap', text);
  };
  const exportZip = async () => {
    const { blob, warnings } = await buildZip(project, kb, variant);
    setWarnings(warnings);
    download(`${base}-zmk-config.zip`, blob);
  };

  const handleFile = async (file: File) => {
    try {
      const text = await file.text();
      if (file.name.endsWith('.keymap')) {
        await importKeymap(file.name.replace(/\.keymap$/, ''), text);
        toast('success', `${file.name} を新しいプロジェクトとして読み込みました`);
        onClose();
        return;
      }
      const json = JSON.parse(text);
      if (isProjectFile(json)) {
        await importProject(json.project);
        toast('success', `プロジェクト「${json.project.name}」を読み込みました`);
        onClose();
        return;
      }
      if (json?.format === 'choco-factory-backup') {
        const n = await restoreBackup(json, newId);
        await refresh();
        toast('success', `${n} 件のプロジェクトを復元しました`);
        return;
      }
      throw new Error('対応していないファイルです (.keymap / プロジェクト .json / バックアップ .json)');
    } catch (e) {
      toast('error', `読み込みに失敗しました: ${(e as Error).message}`);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="インポート / エクスポート" wide>
      <Section title="エクスポート">
        <div className="grid gap-2 sm:grid-cols-2">
          <ExportCard icon={<FileArchive size={18} />} title="ZMK 設定一式 (ZIP)" desc="zmk-config リポジトリにそのまま置けるファイル一式。GitHub Actions でビルドできます。" onClick={exportZip}>
            <div className="mt-2 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
              <button className="chip" data-on={variant === 'studio'} onClick={() => setVariant('studio')}>
                ZMK Studio 対応版 (推奨)
              </button>
              <button className="chip" data-on={variant === 'original'} onClick={() => setVariant('original')}>
                元の構成
              </button>
            </div>
          </ExportCard>
          <ExportCard icon={<FileCode2 size={18} />} title=".keymap ファイル" desc="キーマップファイルのみ。既存の zmk-config の config/ に上書きします。" onClick={exportKeymapFile} />
          <ExportCard icon={<FileJson size={18} />} title="プロジェクト (.json)" desc="このアプリで再び開くためのファイル。他の PC への移行に。" onClick={() => download(`${base}.choco.json`, JSON.stringify(projectFile(project), null, 2), 'application/json')} />
          <ExportCard
            icon={<DatabaseBackup size={18} />}
            title="全プロジェクトのバックアップ"
            desc="このブラウザに保存されたすべてのプロジェクトを 1 つのファイルに保存します。"
            onClick={async () => download(`choco-factory-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await createBackup(), null, 2), 'application/json')}
          />
        </div>
        {warnings.length > 0 && (
          <div className="mt-3 rounded-lg bg-warn/10 p-3 text-xs text-warn">
            <div className="mb-1 font-semibold">注意</div>
            <ul className="list-disc space-y-0.5 pl-4">
              {warnings.slice(0, 10).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </Section>
      <Section title="インポート">
        <div
          onDragOver={(e) => (e.preventDefault(), setDrag(true))}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files[0];
            if (f) void handleFile(f);
          }}
          className={clsx('flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors', drag ? 'border-accent bg-accent-soft' : 'border-line')}
        >
          <Upload size={22} className="text-muted" />
          <p className="text-sm">ファイルをここにドロップ、または</p>
          <button className="btn-outline" onClick={() => input.current?.click()}>
            ファイルを選択
          </button>
          <p className="text-xs text-muted">.keymap (ZMK キーマップ) ・ .json (プロジェクト / バックアップ)。読み込んだ内容は新しいプロジェクトになります。</p>
          <input ref={input} type="file" accept=".keymap,.json,.dtsi" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
        </div>
      </Section>
    </Modal>
  );
}

function ExportCard({ icon, title, desc, onClick, children }: { icon: React.ReactNode; title: string; desc: string; onClick: () => void; children?: React.ReactNode }) {
  return (
    <div role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => e.key === 'Enter' && onClick()} className="cursor-pointer rounded-xl border border-line p-3 text-left transition-colors hover:border-accent/60 hover:bg-surface-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="text-accent">{icon}</span>
        {title}
        <Download size={14} className="ml-auto text-muted" />
      </div>
      <p className="mt-1 text-xs text-muted">{desc}</p>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 使い方・初回セットアップ
// ---------------------------------------------------------------------------
export function HelpDialog({ open, onClose, onFiles }: { open: boolean; onClose: () => void; onFiles: () => void }) {
  const kb = useEditor((s) => s.keyboard);
  return (
    <Modal open={open} onClose={onClose} title="使い方・初回セットアップ" wide>
      <Section title="1. 初回のみ: ZMK Studio 対応ファームウェアを書き込む">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm">
          <li>
            「ファイル」→「ZMK 設定一式 (ZIP) / ZMK Studio 対応版」を出力し、中身を zmk-config リポジトリに上書きして push します。
            <button className="ml-1 text-accent underline" onClick={onFiles}>
              今すぐ出力
            </button>
          </li>
          <li>GitHub Actions のビルド結果 (firmware.zip) から .uf2 をダウンロードします。</li>
          <li>XIAO nRF52840 のリセットボタンを素早く 2 回押すと USB ドライブとして認識されるので、右手・左手それぞれの .uf2 をコピーします。</li>
        </ol>
        <p className="mt-2 rounded-lg bg-surface-2 p-2 text-xs text-muted">
          変更点: 右手 (セントラル) のビルドに <code>studio-rpc-usb-uart</code> と <code>CONFIG_ZMK_STUDIO=y</code> を追加、物理レイアウトの定義、Layer 4 に <code>&amp;studio_unlock</code>、予備レイヤー 3 つを追加。左右間の BLE 通信や他の設定は変更していません。2 回目以降は .uf2 の書き込みは不要です。
        </p>
      </Section>
      <Section title="2. キーボードに接続する">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm">
          <li>
            <b>{kb.central === 'R' ? '右手' : '左手'} (セントラル)</b> の XIAO を USB-C ケーブルで PC に接続します。{kb.central === 'R' ? '左手' : '右手'}はペリフェラルのためキーマップを持たず、接続しても編集できません。
          </li>
          <li>Chrome または Edge で「キーボードに接続」を押し、一覧から XIAO (USB シリアルデバイス) を選びます。</li>
          <li>「ロック解除待ち」と表示されたら、{kb.unlockHint}</li>
          <li>キーボードの現在のキーマップが読み込まれます。</li>
        </ol>
      </Section>
      <Section title="3. 編集して適用する">
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
          <li>キーをクリック → 下の一覧からキーコードを選ぶか、右のパネルで Mod-Tap / Layer-Tap などを設定します。</li>
          <li>「キーボードに適用」で変更したキーだけを書き込み、XIAO 内部のフラッシュに保存します。USB を抜いても、電源を切っても設定は残ります。</li>
          <li>編集内容はこのブラウザにも自動保存されます。未接続でも編集でき、あとから適用できます。</li>
        </ul>
      </Section>
      <Section title="できること / できないこと (ZMK Studio の仕様)">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>✅ キーの割り当て・レイヤー名・レイヤーの追加 (予備レイヤーの範囲内) は Web から直接書き込めます。</li>
          <li>⚠️ マクロ・コンボ・エンコーダーの割り当て・タップ時間などの設定は ZMK Studio が未対応のため、ZIP を出力してファームウェアをビルドする必要があります。</li>
          <li>⚠️ Bluetooth 経由の編集は ZMK 公式でも Linux の Chrome のみ動作確認されています (Windows / macOS では接続できない場合があります)。</li>
          <li>ℹ️ Web から保存したキーマップは .keymap ファイルより優先されます。ファイル側を反映したいときは「設定」→「キーボードを初期化」。</li>
        </ul>
      </Section>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// 適用の確認
// ---------------------------------------------------------------------------
export function ApplyDialog({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: () => void }) {
  const project = useEditor((s) => s.project);
  const deviceLayers = useDevice((s) => s.deviceLayers);
  const info = useDevice((s) => s.info);
  const diff = useDeviceDiff();
  if (!project || !deviceLayers) return null;
  const plan = planApply(project.layers, deviceLayers);
  const byLayer = new Map<number, number>();
  plan.bindings.forEach((b) => byLayer.set(b.layerIndex, (byLayer.get(b.layerIndex) ?? 0) + 1));
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="キーボードに適用"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            キャンセル
          </button>
          <button className="btn-primary" onClick={onConfirm}>
            <Upload size={15} /> 書き込んで保存
          </button>
        </>
      }
    >
      <p className="text-sm">
        <b>{info?.name}</b> に {diff} 件の変更を書き込み、内部フラッシュに保存します。
      </p>
      <ul className="mt-3 space-y-1 text-sm">
        {plan.addLayers > 0 && <li>・レイヤーを {plan.addLayers} 個追加</li>}
        {plan.removeLayers.length > 0 && <li>・レイヤーを {plan.removeLayers.length} 個削除</li>}
        {plan.renames.map((r) => (
          <li key={r.layerIndex}>
            ・レイヤー {r.layerIndex} の名前を「{r.name}」に変更
          </li>
        ))}
        {[...byLayer.entries()].map(([li, n]) => (
          <li key={li}>
            ・{project.layers[li]?.name}: {n} 個のキー
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">書き込み中は USB ケーブルを抜かないでください。書き込み後に内容を読み直して確認します。</p>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// 接続関連
// ---------------------------------------------------------------------------
export function LockedDialog() {
  const status = useDevice((s) => s.status);
  const disconnect = useDevice((s) => s.disconnect);
  const sim = useDevice((s) => s.sim);
  const load = useDevice((s) => s.load);
  const kb = useEditor((s) => s.keyboard);
  return (
    <Modal open={status === 'locked'} onClose={() => disconnect()} title="キーボードのロックを解除してください" dismissible={false}>
      <div className="flex gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <KeyRound size={24} />
        </div>
        <div className="text-sm">
          <p>安全のため、キーボード側で編集を許可する必要があります。</p>
          <p className="mt-2 font-medium">{kb.unlockHint}</p>
          <p className="mt-2 text-xs text-muted">ロックが解除されると自動で次に進みます。(10 分間操作しないと再びロックされます)</p>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        {sim && (
          <button className="btn-outline" onClick={() => sim.pressUnlock()}>
            <Unlock size={15} /> (シミュレーター) Unlock キーを押す
          </button>
        )}
        <button className="btn-ghost" onClick={() => load()}>
          再確認
        </button>
        <button className="btn-ghost" onClick={() => disconnect()}>
          切断
        </button>
      </div>
    </Modal>
  );
}

export function PendingLoadDialog() {
  const pending = useDevice((s) => s.pendingLoad);
  const accept = useDevice((s) => s.acceptDeviceKeymap);
  const dismiss = useDevice((s) => s.dismissPendingLoad);
  const info = useDevice((s) => s.info);
  const project = useEditor((s) => s.project);
  if (!pending || !project) return null;
  const n = planApply(project.layers, pending);
  return (
    <Modal open onClose={dismiss} title="キーボードに接続しました">
      <div className="flex gap-3">
        <CircleCheck className="shrink-0 text-ok" size={22} />
        <div className="text-sm">
          <p>
            <b>{info?.name}</b> の現在のキーマップを読み込みました。プロジェクト「{project.name}」とは {n.bindings.length + n.renames.length + n.addLayers + n.removeLayers.length} 件の違いがあります。
          </p>
          <p className="mt-2 text-muted">どちらを表示しますか？</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2">
        <button className="btn-primary justify-start py-2.5" onClick={accept}>
          <Usb size={16} /> キーボードの設定を表示して編集する (推奨)
        </button>
        <button className="btn-outline justify-start py-2.5" onClick={dismiss}>
          <Info size={16} /> プロジェクトの内容のまま (あとで「キーボードに適用」で書き込む)
        </button>
      </div>
      <p className="mt-3 text-xs text-muted">「キーボードの設定を表示」を選んでも、「元に戻す」でプロジェクトの内容に戻せます。</p>
    </Modal>
  );
}

export function ErrorBanner() {
  const status = useDevice((s) => s.status);
  const error = useDevice((s) => s.error);
  const dev = useDevice((s) => s.dev);
  const load = useDevice((s) => s.load);
  const connect = useDevice((s) => s.connect);
  const kind = useDevice((s) => s.kind);
  if (status !== 'error' || !error) return null;
  return (
    <div className="flex items-center gap-2 border-b border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">
      <CircleX size={16} className="shrink-0" />
      <span className="flex-1">{error}</span>
      {dev ? (
        <button className="btn-outline py-1 text-xs" onClick={() => load()}>
          再読み込み
        </button>
      ) : (
        kind && (
          <button className="btn-outline py-1 text-xs" onClick={() => connect(kind)}>
            {kind === 'sim' ? <Cpu size={13} /> : <Usb size={13} />} 再接続
          </button>
        )
      )}
    </div>
  );
}

export function Toasts() {
  const toasts = useEditor((s) => s.toasts);
  const dismiss = useEditor((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed right-4 bottom-20 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={clsx(
            'panel animate-pop pointer-events-auto flex cursor-pointer items-start gap-2 px-3 py-2.5 text-sm shadow-lg',
            t.kind === 'error' && 'border-danger/40',
            t.kind === 'success' && 'border-ok/40',
          )}
        >
          {t.kind === 'success' ? <Check size={16} className="mt-0.5 shrink-0 text-ok" /> : t.kind === 'error' ? <CircleX size={16} className="mt-0.5 shrink-0 text-danger" /> : <Info size={16} className="mt-0.5 shrink-0 text-accent" />}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
