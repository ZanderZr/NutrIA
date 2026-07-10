import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection,
} from '@capacitor-community/sqlite';

import { DB_NAME, DB_VERSION, SCHEMA_UPGRADES } from './migrations';

/**
 * Owns the single SQLite connection and runs migrations on startup.
 * On web it boots the jeep-sqlite element and persists to IndexedDB so the
 * repositories work identically during development (`ionic serve`).
 */
@Injectable({ providedIn: 'root' })
export class DatabaseService {
  private sqlite = new SQLiteConnection(CapacitorSQLite);
  private db!: SQLiteDBConnection;
  private ready?: Promise<void>;
  private readonly isWeb = Capacitor.getPlatform() === 'web';

  /** Idempotent: safe to await from multiple callers; only initialises once. */
  init(): Promise<void> {
    return (this.ready ??= this.doInit());
  }

  private async doInit(): Promise<void> {
    if (this.isWeb) {
      await this.initWebStore();
    }

    await this.sqlite.addUpgradeStatement(DB_NAME, SCHEMA_UPGRADES);

    const conn = await this.sqlite.isConnection(DB_NAME, false);
    this.db = conn.result
      ? await this.sqlite.retrieveConnection(DB_NAME, false)
      : await this.sqlite.createConnection(
          DB_NAME,
          false,
          'no-encryption',
          DB_VERSION,
          false,
        );

    await this.db.open();

    if (this.isWeb) {
      await this.sqlite.saveToStore(DB_NAME);
    }
  }

  private async initWebStore(): Promise<void> {
    const { defineCustomElements } = await import('jeep-sqlite/loader');
    defineCustomElements(window);
    if (!customElements.get('jeep-sqlite')) {
      await customElements.whenDefined('jeep-sqlite');
    }
    const jeepEl = document.createElement('jeep-sqlite');
    document.body.appendChild(jeepEl);
    await customElements.whenDefined('jeep-sqlite');
    await this.sqlite.initWebStore();
  }

  /** SELECT helper. Returns typed rows. */
  async query<T>(statement: string, values: unknown[] = []): Promise<T[]> {
    await this.init();
    const res = await this.db.query(statement, values as never);
    return (res.values ?? []) as T[];
  }

  /** INSERT/UPDATE/DELETE helper. Returns lastId for inserts. */
  async run(
    statement: string,
    values: unknown[] = [],
  ): Promise<number | undefined> {
    await this.init();
    const res = await this.db.run(statement, values as never);
    await this.persist();
    return res.changes?.lastId;
  }

  /** Run several statements atomically inside a transaction. */
  async transaction(
    work: (db: SQLiteDBConnection) => Promise<void>,
  ): Promise<void> {
    await this.init();
    await this.db.beginTransaction();
    try {
      await work(this.db);
      await this.db.commitTransaction();
    } catch (err) {
      await this.db.rollbackTransaction();
      throw err;
    }
    await this.persist();
  }

  private async persist(): Promise<void> {
    if (this.isWeb) {
      await this.sqlite.saveToStore(DB_NAME);
    }
  }
}
