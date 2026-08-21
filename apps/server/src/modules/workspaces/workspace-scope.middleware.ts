import { Injectable, NestMiddleware } from '@nestjs/common';
import { WORKSPACE_HEADER } from '@puente/shared';
import { WorkspacesService } from './workspaces.service';

interface HeaderCarrier {
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Opens the workspace scope for the whole request, so services deeper down can ask "which
 * Cloudflare account am I on?" without every signature growing an id.
 *
 * An unknown or missing header falls back to the default workspace. That is deliberate: an older
 * panel, a curl, or the CLI should keep working exactly as before rather than fail closed on a
 * concept they have never heard of.
 */
@Injectable()
export class WorkspaceScopeMiddleware implements NestMiddleware {
  constructor(private readonly workspaces: WorkspacesService) {}

  use(req: HeaderCarrier, _res: unknown, next: () => void): void {
    const raw = req.headers[WORKSPACE_HEADER];
    const requested = Array.isArray(raw) ? raw[0] : raw;
    const id =
      requested && this.workspaces.exists(requested) ? requested : this.workspaces.default().id;
    this.workspaces.runIn(id, next);
  }
}
