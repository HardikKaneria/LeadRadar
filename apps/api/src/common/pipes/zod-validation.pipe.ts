import { type PipeTransform, Injectable, type ArgumentMetadata } from '@nestjs/common';
import { ZodSchema } from 'zod';

/** Validates a request payload against a zod schema (from @radar/contracts). */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    return this.schema.parse(value);
  }
}
