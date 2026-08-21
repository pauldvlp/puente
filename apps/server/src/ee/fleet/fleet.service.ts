import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  FLEET_OPERATION_LABELS,
  type FleetOperation,
  type FleetResult,
  type FleetRun,
  type RunFleetOperationInput,
} from '@puente/shared';
import { NodesService } from '../../modules/nodes/nodes.service';
import { EventsService } from '../../modules/events/events.service';
import { EventBus } from '../../common/event-bus.service';

/**
 * The same connector action, across a fleet.
 *
 * Deliberately sequential. Upgrading twenty connectors in parallel takes twenty tunnels down at
 * the same moment, which is the outage the client hired the agency to avoid; one at a time means
 * only one origin is unreachable at any point, for a few seconds. It is slower, and that is the
 * feature.
 */
@Injectable()
export class FleetService {
  private readonly log = new Logger('Fleet');
  private running = false;

  constructor(
    private readonly nodes: NodesService,
    private readonly events: EventsService,
    private readonly bus: EventBus,
  ) {}

  async run(dto: RunFleetOperationInput): Promise<FleetRun> {
    // Two rolling upgrades at once would defeat the point of rolling them.
    if (this.running) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'FleetBusy',
        message: 'A fleet operation is already running. Wait for it to finish.',
        code: 'FLEET_BUSY',
      });
    }

    const all = this.nodes.list();
    const targets = dto.nodeIds ? all.filter((n) => dto.nodeIds!.includes(n.id)) : all;
    const eligible = targets.filter((n) => n.tunnelId);
    if (eligible.length === 0) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'NothingToDo',
        message: 'None of those nodes have a connector yet.',
        code: 'FLEET_EMPTY',
      });
    }

    this.running = true;
    const scope = `fleet:${dto.operation}`;
    const startedAt = new Date().toISOString();
    const results: FleetResult[] = [];

    this.events.info(
      'fleet.start',
      `${FLEET_OPERATION_LABELS[dto.operation]} on ${eligible.length} node(s)`,
    );

    try {
      for (const [index, node] of eligible.entries()) {
        this.bus.progress(scope, node.id, `${node.name} (${index + 1} of ${eligible.length})`, {
          done: false,
        });
        try {
          await this.apply(dto.operation, node.id);
          results.push({ nodeId: node.id, name: node.name, ok: true, message: 'Done' });
        } catch (err) {
          // One unreachable node must not stop the other nineteen from being updated.
          const message = err instanceof Error ? err.message : String(err);
          this.log.warn(`${dto.operation} failed on ${node.name}: ${message}`);
          results.push({ nodeId: node.id, name: node.name, ok: false, message });
        }
      }
    } finally {
      this.running = false;
    }

    const failed = results.filter((r) => !r.ok).length;
    const succeeded = results.length - failed;
    this.bus.progress(scope, 'done', `${succeeded} succeeded, ${failed} failed`, {
      done: true,
      error: failed > 0,
    });

    const summary = `${FLEET_OPERATION_LABELS[dto.operation]}: ${succeeded} succeeded, ${failed} failed`;
    if (failed > 0) this.events.warn('fleet.finish', summary);
    else this.events.success('fleet.finish', summary);

    return {
      operation: dto.operation,
      startedAt,
      finishedAt: new Date().toISOString(),
      results,
      succeeded,
      failed,
    };
  }

  private apply(operation: FleetOperation, nodeId: string): Promise<unknown> {
    return operation === 'upgrade'
      ? this.nodes.upgradeConnector(nodeId)
      : this.nodes.setConnector(nodeId, 'restart');
  }
}
