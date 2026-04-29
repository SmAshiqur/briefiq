// Body of POST /queries/analyze — the user's raw natural-language input.

import { IsString, MaxLength, MinLength } from 'class-validator';

export class AnalyzeQueryDto {
  // 4 chars min so "asdf" isn't a valid query but also nothing pathological.
  // 500 chars cap is generous; the LLM does fine on short prompts.
  @IsString()
  @MinLength(4)
  @MaxLength(500)
  text!: string;
}
