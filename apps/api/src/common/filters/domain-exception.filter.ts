import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { DomainError } from '@radar/core';
import { ZodError } from 'zod';

/** Maps every error to an RFC-7807-style problem document. */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = 500;
    let type = 'internal_error';
    let title = 'Internal Server Error';
    let detail: string | undefined;
    let errors: unknown;

    if (exception instanceof DomainError) {
      status = exception.status;
      type = exception.type;
      title = exception.message;
      errors = exception.details;
    } else if (exception instanceof ZodError) {
      status = 422;
      type = 'validation_error';
      title = 'Validation failed';
      errors = exception.flatten();
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      title = typeof body === 'string' ? body : ((body as { message?: string }).message ?? exception.message);
      type = exception.name;
    } else if (exception instanceof Error) {
      detail = exception.message;
    }

    if (status >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    res.status(status).json({
      type,
      title,
      status,
      detail,
      errors,
      instance: req.url,
    });
  }
}
