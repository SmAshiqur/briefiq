// DTO for iOS (and other clients) posting log/error events to the backend.

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import type { EventLevel } from '../../../monitoring/event-store.types';

export class ClientEventDto {
  @IsEnum(['debug', 'info', 'warn', 'error'])
  level!: EventLevel;

  @IsString()
  @MaxLength(2000)
  message!: string;

  /** Optional key/value context — keep small; no PII or secrets. */
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}

export class CreateClientEventsDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ClientEventDto)
  events!: ClientEventDto[];
}
