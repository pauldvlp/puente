import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import type { StreamEvent } from '@puente/shared';

/**
 * In-process pub/sub for pushing live updates to connected browsers over SSE.
 * Feature services call `emit()`; the stream controller subscribes to `stream$`.
 */
@Injectable()
export class EventBus {
  private readonly subject = new Subject<StreamEvent>();

  get stream$(): Observable<StreamEvent> {
    return this.subject.asObservable();
  }

  emit(event: StreamEvent): void {
    this.subject.next(event);
  }

  /** Convenience for reporting steps of a long-running job (e.g. provisioning). */
  progress(scope: string, step: string, message: string, opts?: { done?: boolean; error?: boolean }): void {
    this.emit({
      type: 'progress',
      scope,
      step,
      message,
      done: opts?.done ?? false,
      error: opts?.error ?? false,
    });
  }
}
