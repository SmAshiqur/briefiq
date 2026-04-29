// Body of POST /push/register — the iOS device's APNs token.
// The iOS app calls this on every launch because tokens can rotate.

import { IsString, Length } from 'class-validator';

export class RegisterPushDto {
  // APNs tokens are 64 hex chars normally, but Apple has hinted at longer
  // tokens in future. Validate length loosely; treat as opaque.
  @IsString()
  @Length(32, 256)
  deviceToken!: string;
}
