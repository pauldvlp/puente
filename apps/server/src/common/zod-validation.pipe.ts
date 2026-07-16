import { PipeTransform, BadRequestException } from '@nestjs/common';
import type { ZodType, infer as ZodInfer } from 'zod';

/**
 * Validates request payloads against a zod schema (from @puente/shared), so the
 * backend and frontend enforce the exact same contract.
 *
 * Usage: `@Body(new ZodBody(CreateNodeSchema)) dto: CreateNodeInput`
 */
export class ZodBody<T extends ZodType> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown): ZodInfer<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const messages = result.error.issues.map(
        (i) => `${i.path.join('.') || '(root)'}: ${i.message}`,
      );
      throw new BadRequestException({
        statusCode: 400,
        error: 'ValidationError',
        message: messages,
        code: 'VALIDATION_ERROR',
      });
    }
    return result.data;
  }
}

/** Imperative validation helper for use inside services. */
export function zParse<T extends ZodType>(schema: T, value: unknown): ZodInfer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const messages = result.error.issues.map(
      (i) => `${i.path.join('.') || '(root)'}: ${i.message}`,
    );
    throw new BadRequestException({
      statusCode: 400,
      error: 'ValidationError',
      message: messages,
      code: 'VALIDATION_ERROR',
    });
  }
  return result.data;
}
