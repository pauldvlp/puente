import { z } from 'zod';

/**
 * Scheduled backups — a puente Pro capability (`backup`).
 *
 * Taking a backup by hand is free (`puente backup`): losing your tunnels because you did not pay
 * would be a strange thing to sell. What Pro sells is it happening without anyone remembering.
 */

export const BACKUP_FREQUENCIES = ['daily', 'weekly'] as const;
export const BackupFrequencySchema = z.enum(BACKUP_FREQUENCIES);
export type BackupFrequency = z.infer<typeof BackupFrequencySchema>;

export const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const BackupScheduleSchema = z.object({
  enabled: z.boolean(),
  frequency: BackupFrequencySchema,
  /** Local hour, 0–23. Backups run on the panel's clock, not UTC — people think in local time. */
  hour: z.number().int().min(0).max(23),
  /** 0 = Sunday. Ignored for daily. */
  weekday: z.number().int().min(0).max(6),
  /** How many files to keep. The oldest are deleted after a successful run, never before. */
  keep: z.number().int().min(1).max(365),
  /** Where the files go. Defaults to `backups/` inside the data directory. */
  directory: z.string(),
  /** True once a passphrase has been stored. The passphrase itself is never returned. */
  hasPassphrase: z.boolean(),
  lastRunAt: z.string().nullable(),
  lastError: z.string().nullable(),
  /** When the next run is due, computed from the settings above. Null when disabled. */
  nextRunAt: z.string().nullable(),
});
export type BackupSchedule = z.infer<typeof BackupScheduleSchema>;

export const UpdateBackupScheduleSchema = z.object({
  enabled: z.boolean().optional(),
  frequency: BackupFrequencySchema.optional(),
  hour: z.number().int().min(0).max(23).optional(),
  weekday: z.number().int().min(0).max(6).optional(),
  keep: z.number().int().min(1).max(365).optional(),
  directory: z.string().min(1).optional(),
  /** Set once; omit to leave the stored one alone. Sending "" clears it. */
  passphrase: z.string().optional(),
});
export type UpdateBackupScheduleInput = z.infer<typeof UpdateBackupScheduleSchema>;

/** A file sitting in the backup directory. */
export const BackupFileSchema = z.object({
  name: z.string(),
  bytes: z.number().int(),
  createdAt: z.string(),
});
export type BackupFile = z.infer<typeof BackupFileSchema>;

export const NO_PASSPHRASE_SET = 'NO_PASSPHRASE_SET';
