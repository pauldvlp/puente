import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import type { Subscription } from 'rxjs';
import { EventBus } from '../../common/event-bus.service';
import { EventsService } from '../../modules/events/events.service';
import type { HealthChangedFact } from '../../common/facts';
import { nowMs } from '../../common/time';
import { LicenseService } from '../license/license.service';
import { AlertsService } from './alerts.service';
import { buildPayload, classify, inCooldown } from './alert-rules';

/**
 * Listens for health transitions and notifies the channels that asked to hear about them.
 *
 * Subscribes to the bus rather than being called by the core: nodes and routes announce what
 * happened and stay unaware that a paid feature is listening, which is what keeps the AGPL side
 * free of any dependency on `ee/`.
 */
@Injectable()
export class AlertDispatcher implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Alerts');
  private subscription: Subscription | null = null;

  constructor(
    private readonly bus: EventBus,
    private readonly alerts: AlertsService,
    private readonly licenses: LicenseService,
    private readonly events: EventsService,
  ) {}

  onModuleInit(): void {
    this.subscription = this.bus.facts$.subscribe((fact) => {
      if (fact.type !== 'health.changed') return;
      void this.handle(fact);
    });
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
  }

  async handle(fact: HealthChangedFact): Promise<void> {
    if (!this.licenses.has('alerts')) return;

    const trigger = classify(fact);
    if (!trigger) return;

    const at = nowMs();
    const payload = buildPayload(fact, trigger);

    for (const channel of this.alerts.subscribersOf(trigger)) {
      if (inCooldown(trigger, this.alerts.lastNotified(channel, fact.id), at)) {
        this.log.debug(`Cooldown active for ${channel.name} / ${fact.name} — not sending.`);
        continue;
      }
      const delivery = await this.alerts.deliver(channel, payload);
      this.alerts.markNotified(channel.id, fact.id, at);

      // The activity feed is the record of what was sent, so a missed page can be explained.
      if (delivery.ok) {
        this.events.info('alert.sent', `Alerted ${channel.name}: ${payload.text}`, {
          nodeId: fact.subject === 'node' ? fact.id : null,
          routeId: fact.subject === 'route' ? fact.id : null,
          meta: { trigger, channel: channel.name },
        });
      } else {
        this.events.warn('alert.failed', `Could not alert ${channel.name}: ${delivery.message}`, {
          meta: { trigger, channel: channel.name },
        });
      }
    }
  }
}
