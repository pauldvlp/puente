import { Controller, Sse, MessageEvent } from '@nestjs/common';
import { interval, map, merge, of, Observable } from 'rxjs';
import type { StreamEvent } from '@puente/shared';
import { EventBus } from '../../common/event-bus.service';

@Controller('stream')
export class StreamController {
  constructor(private readonly bus: EventBus) {}

  /** Single SSE channel the SPA subscribes to for all live updates. */
  @Sse()
  stream(): Observable<MessageEvent> {
    const now = () => new Date().toISOString();
    const hello$ = of<StreamEvent>({ type: 'hello', at: now() });
    const ping$ = interval(25000).pipe(
      map<number, StreamEvent>(() => ({ type: 'ping', at: now() })),
    );
    const events$ = this.bus.stream$;
    return merge(hello$, events$, ping$).pipe(map((e) => ({ data: e }) as MessageEvent));
  }
}
