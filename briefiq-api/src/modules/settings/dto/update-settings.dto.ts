// Body of PATCH /settings — fields directly correspond to the iOS Settings
// screen toggles + inputs.

import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';

const HHMM = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  @Matches(HHMM, { message: 'quietStart must be HH:MM' })
  quietStart?: string;

  @IsOptional()
  @IsString()
  @Matches(HHMM, { message: 'quietEnd must be HH:MM' })
  quietEnd?: string;

  @IsOptional()
  @IsString()
  @Matches(HHMM, { message: 'digestTime must be HH:MM' })
  digestTime?: string;

  @IsOptional()
  @IsEnum(['loose', 'balanced', 'strict'])
  defaultThreshold?: 'loose' | 'balanced' | 'strict';

  @IsOptional()
  @IsEnum(['headline', 'standard', 'detailed'])
  defaultDetail?: 'headline' | 'standard' | 'detailed';
}
