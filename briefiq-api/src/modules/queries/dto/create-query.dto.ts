// Body of POST /queries — what the iOS confirm panel sends after the user
// approves the AI-suggested intent / sources / frequency.

import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class QuerySourcesDto {
  @IsArray()
  @IsString({ each: true })
  domains!: string[];
}

export class CreateQueryDto {
  @IsString()
  @MinLength(4)
  @MaxLength(500)
  rawText!: string;

  @IsEnum(['trend', 'event', 'policy', 'listing', 'price', 'other'])
  intentType!: 'trend' | 'event' | 'policy' | 'listing' | 'price' | 'other';

  @IsEnum(['hourly', 'daily', 'weekly'])
  frequency!: 'hourly' | 'daily' | 'weekly';

  @IsOptional()
  @ValidateNested()
  @Type(() => QuerySourcesDto)
  sources?: QuerySourcesDto;

  @IsOptional()
  @IsEnum(['loose', 'balanced', 'strict'])
  signalThreshold?: 'loose' | 'balanced' | 'strict';
}
