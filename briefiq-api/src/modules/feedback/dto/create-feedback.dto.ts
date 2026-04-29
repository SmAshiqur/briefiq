import { IsEnum } from 'class-validator';

export class CreateFeedbackDto {
  // The briefingId is taken from the URL, not the body.

  @IsEnum(['useful', 'noise'])
  rating!: 'useful' | 'noise';
}
