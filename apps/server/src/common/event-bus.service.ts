import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import type { StreamEvent } from '@puente/shared';
import type { DomainFact } from './facts';

/**
 * In-process pub/sub for pushing live updates to connected browsers over SSE.
 * Feature services call `emit()`; the stream controller subscribes to `stream$`.
 */
@Injectable()
export class EventBus {
  private readonly subject = new Subject<StreamEvent>();
  private readonly facts = new Subject<DomainFact>();

  get stream$(): Observable<StreamEvent> {
    return this.subject.asObservable();
  }

  emit(event: StreamEvent): void {
    this.subject.next(event);
  }

  /**
   * Internal facts, never sent to the browser. Subscribers are in-process listeners such as
   * alerting; the emitter neither knows nor cares whether anyone is listening.
   */
  get facts$(): Observable<DomainFact> {
    return this.facts.asObservable();
  }

  fact(fact: DomainFact): void {
    this.facts.next(fact);
  }

  /** Convenience for reporting steps of a long-running job (e.g. provisioning). */
  progress(
    scope: string,
    step: string,
    message: string,
    opts?: { done?: boolean; error?: boolean },
  ): void {
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
