import { Injectable, NotFoundException } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { asc, desc, eq } from 'drizzle-orm';
import { DbService } from '../../db/db.service';
import { workspaces, type WorkspaceRow } from '../../db/schema';
import { nowMs } from '../../common/time';

/**
 * A workspace is one Cloudflare account plus everything published through it. Every install has at
 * least one — the migration guarantees it — so nothing downstream has to handle its absence.
 *
 * The current workspace travels in an AsyncLocalStorage rather than through every method
 * signature. Two reasons: the alternative is threading an id through the whole service layer for a
 * value that is constant within a request, and background work (the health poller, the CLI) has no
 * request at all and simply gets the default. If nobody opened a scope, reads fall back to the
 * default workspace — which on a single-workspace install is the only one, so behaviour is
 * unchanged.
 */
@Injectable()
export class WorkspacesService {
  private readonly scope = new AsyncLocalStorage<string>();

  constructor(private readonly dbs: DbService) {}

  private get db() {
    return this.dbs.db;
  }

  /** Run `fn` with `id` as the current workspace. */
  runIn<T>(id: string, fn: () => T): T {
    return this.scope.run(id, fn);
  }

  list(): WorkspaceRow[] {
    return this.db
      .select()
      .from(workspaces)
      .orderBy(desc(workspaces.isDefault), asc(workspaces.createdAt))
      .all();
  }

  /** The workspace this request belongs to, or the default one outside a request. */
  current(): WorkspaceRow {
    const scoped = this.scope.getStore();
    if (scoped) {
      const row = this.db.select().from(workspaces).where(eq(workspaces.id, scoped)).get();
      if (row) return row;
    }
    return this.default();
  }

  currentId(): string {
    return this.current().id;
  }

  default(): WorkspaceRow {
    const row = this.list()[0];
    // The migration creates one on every boot, so this only fires if someone deleted it by hand.
    if (!row) throw new NotFoundException('No workspace exists. Restart puente to repair it.');
    return row;
  }

  get(id: string): WorkspaceRow {
    const row = this.db.select().from(workspaces).where(eq(workspaces.id, id)).get();
    if (!row) throw new NotFoundException(`No workspace with id ${id}.`);
    return row;
  }

  exists(id: string): boolean {
    return Boolean(this.db.select().from(workspaces).where(eq(workspaces.id, id)).get());
  }

  patch(id: string, patch: Partial<WorkspaceRow>): WorkspaceRow {
    this.db
      .update(workspaces)
      .set({ ...patch, updatedAt: nowMs() })
      .where(eq(workspaces.id, id))
      .run();
    return this.get(id);
  }
}
