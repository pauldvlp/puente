import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { asc, desc, eq } from 'drizzle-orm';
import { WORKSPACE_LAST_ONE, WORKSPACE_NOT_EMPTY, type CreateWorkspaceInput } from '@puente/shared';
import { DbService } from '../../db/db.service';
import { nodes, routes, workspaces, zones, type WorkspaceRow } from '../../db/schema';
import { newId } from '../../common/ids';
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

  create(dto: CreateWorkspaceInput): WorkspaceRow {
    const now = nowMs();
    const row: WorkspaceRow = {
      id: newId('ws'),
      name: dto.name,
      cloudflareAuthMode: null,
      cloudflareApiTokenEnc: null,
      cloudflareAccountId: null,
      cloudflareAccountName: null,
      defaultZoneId: null,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    };
    this.db.insert(workspaces).values(row).run();
    return row;
  }

  /**
   * Deleting a workspace is refused unless it is empty, and the last one can never go.
   *
   * A workspace holds another company's infrastructure. Cascading a delete from one click would
   * tear down their tunnels, so the answer is to say what is still inside and let a human decide.
   */
  remove(id: string): void {
    const row = this.get(id);
    if (this.list().length <= 1) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'LastWorkspace',
        message: 'This is the only workspace. puente always has one.',
        code: WORKSPACE_LAST_ONE,
      });
    }
    const nodeCount = this.db.select().from(nodes).where(eq(nodes.workspaceId, id)).all().length;
    const routeCount = this.db.select().from(routes).where(eq(routes.workspaceId, id)).all().length;
    if (nodeCount > 0 || routeCount > 0) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'WorkspaceNotEmpty',
        message:
          `"${row.name}" still has ${nodeCount} node(s) and ${routeCount} route(s). ` +
          "Remove them first — deleting them from here would take down someone else's tunnels.",
        code: WORKSPACE_NOT_EMPTY,
      });
    }
    this.db.delete(zones).where(eq(zones.workspaceId, id)).run();
    this.db.delete(workspaces).where(eq(workspaces.id, id)).run();
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
