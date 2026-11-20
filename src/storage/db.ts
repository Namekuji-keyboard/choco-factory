/**
 * ブラウザ内 (IndexedDB) へのプロジェクト保存。
 *
 * データは利用者ごとのブラウザ (オリジン単位) に保存され、サーバーには一切送信されません。
 * DB のスキーマはバージョン管理しており、アプリ更新時も既存データを引き継ぎます。
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Project } from '../model/types';

interface ChocoDB extends DBSchema {
  projects: { key: string; value: Project; indexes: { updatedAt: number } };
  meta: { key: string; value: unknown };
}

const DB_NAME = 'choco-factory';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<ChocoDB>> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB<ChocoDB>(DB_NAME, DB_VERSION, {
      upgrade(d, oldVersion) {
        // 新しいバージョンでスキーマを変える場合は oldVersion を見て段階的に移行する (既存データは消さない)
        if (oldVersion < 1) {
          const s = d.createObjectStore('projects', { keyPath: 'id' });
          s.createIndex('updatedAt', 'updatedAt');
          d.createObjectStore('meta');
        }
      },
    });
  }
  return dbPromise;
}

export async function listProjects(): Promise<Project[]> {
  const all = await (await db()).getAll('projects');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(id: string): Promise<Project | undefined> {
  return (await db()).get('projects', id);
}

export async function putProject(p: Project): Promise<void> {
  await (await db()).put('projects', p);
}

export async function deleteProject(id: string): Promise<void> {
  await (await db()).delete('projects', id);
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get('meta', key)) as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await db()).put('meta', value, key);
}

/** ブラウザに「永続ストレージ」を要求 (容量逼迫時に自動削除されにくくなる) */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

// ---- バックアップ ----

export interface Backup {
  format: 'choco-factory-backup';
  version: 1;
  exportedAt: string;
  projects: Project[];
}

export async function createBackup(): Promise<Backup> {
  return { format: 'choco-factory-backup', version: 1, exportedAt: new Date().toISOString(), projects: await listProjects() };
}

/** バックアップを復元。同じ ID のプロジェクトがある場合は新しい ID で追加 (上書きしない) */
export async function restoreBackup(b: Backup, newId: () => string): Promise<number> {
  if (b?.format !== 'choco-factory-backup' || !Array.isArray(b.projects)) throw new Error('Choco Factory のバックアップファイルではありません');
  const existing = new Set((await listProjects()).map((p) => p.id));
  for (const p of b.projects) {
    const proj = existing.has(p.id) ? { ...p, id: newId(), name: `${p.name} (復元)` } : p;
    await putProject(proj);
  }
  return b.projects.length;
}
