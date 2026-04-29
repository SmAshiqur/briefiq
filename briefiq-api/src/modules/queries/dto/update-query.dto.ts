// Body of PATCH /queries/:id — partial update.
// The user can pause/resume, change threshold, or change frequency.

import { IsEnum, IsOptional } from 'class-validator';

export class UpdateQueryDto {
  @IsOptional()
  @IsEnum(['active', 'paused', 'archived'])
  status?: 'active' | 'paused' | 'archived';

  @IsOptional()
  @IsEnum(['hourly', 'daily', 'weekly'])
  frequency?: 'hourly' | 'daily' | 'weekly';

  @IsOptional()
  @IsEnum(['loose', 'balanced', 'strict'])
  signalThreshold?: 'loose' | 'balanced' | 'strict';
}
