import { Controller, Get, Header, Query, StreamableFile } from '@nestjs/common';
import {
  EventQuerySchema,
  ExportFormatSchema,
  type ActivityEvent,
  type EventQuery,
} from '@puente/shared';
import { EventsService } from '../../modules/events/events.service';
import { MinRole } from '../../modules/auth/min-role.decorator';
import { RequiresPro } from '../license/requires-pro.decorator';

/**
 * puente Pro — getting the audit trail out of puente.
 *
 * Reading and searching the feed stay free; what a client, an auditor or a compliance review asks
 * for is a file, and that is what this produces.
 */
@RequiresPro('audit')
@MinRole('owner')
@Controller('audit')
export class AuditController {
  constructor(private readonly events: EventsService) {}

  @Get('export')
  @Header('Cache-Control', 'no-store')
  export(@Query() raw: Record<string, string>): StreamableFile {
    const format = ExportFormatSchema.catch('csv').parse(raw.format);
    const parsed = EventQuerySchema.safeParse(raw);
    const query: Partial<EventQuery> = parsed.success ? parsed.data : {};
    const rows = this.events.all(query);

    const body = format === 'json' ? JSON.stringify(rows, null, 2) : toCsv(rows);
    const stamp = new Date().toISOString().slice(0, 10);
    return new StreamableFile(Buffer.from(body, 'utf8'), {
      type: format === 'json' ? 'application/json' : 'text/csv; charset=utf-8',
      disposition: `attachment; filename="puente-audit-${stamp}.${format}"`,
    });
  }
}

const COLUMNS = ['ts', 'level', 'action', 'username', 'message', 'nodeId', 'routeId'] as const;

/**
 * RFC 4180 quoting. Spreadsheets are the destination and a stray comma in a message would shift
 * every column after it — which is exactly the sort of thing nobody notices until an audit.
 */
export function toCsv(rows: ActivityEvent[]): string {
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [COLUMNS.join(',')];
  for (const row of rows) {
    lines.push(COLUMNS.map((c) => escape(row[c as keyof ActivityEvent])).join(','));
  }
  return `${lines.join('\n')}\n`;
}
