import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { BackupService } from './backup.service';

const FILE = 'nutricontrol-autobackup.json';
const DIR = Directory.Documents;
/** Don't rewrite more than once a day. */
const MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Silent on-device safety net: writes a full backup to the device's Documents
 * folder about once a day. Complements the manual export/share (the only copy
 * that survives a lost phone) and enables an offer to restore after a reinstall.
 * Native-only — a no-op on the web build.
 */
@Injectable({ providedIn: 'root' })
export class AutoBackupService {
  private backup = inject(BackupService);
  private readonly isNative = Capacitor.isNativePlatform();

  /** Write today's backup if enabled and the last one is older than a day. */
  async maybeRun(enabled: boolean): Promise<void> {
    if (!this.isNative || !enabled) return;
    try {
      const last = await this.backup.lastAutoBackupAt();
      if (last && Date.now() - Date.parse(last) < MIN_INTERVAL_MS) return;

      const json = await this.backup.buildJson();
      await Filesystem.writeFile({
        path: FILE,
        data: json,
        directory: DIR,
        encoding: Encoding.UTF8,
      });
      await this.backup.markAutoBackup();
    } catch {
      // Best-effort; never let a backup failure affect the app.
    }
  }

  /** True when an on-device auto-backup file exists (for the restore offer). */
  async hasBackupFile(): Promise<boolean> {
    if (!this.isNative) return false;
    try {
      await Filesystem.stat({ path: FILE, directory: DIR });
      return true;
    } catch {
      return false;
    }
  }

  /** Read the auto-backup file's JSON, or null if missing/unreadable. */
  async readBackupFile(): Promise<string | null> {
    if (!this.isNative) return null;
    try {
      const { data } = await Filesystem.readFile({
        path: FILE,
        directory: DIR,
        encoding: Encoding.UTF8,
      });
      return typeof data === 'string' ? data : null;
    } catch {
      return null;
    }
  }
}
