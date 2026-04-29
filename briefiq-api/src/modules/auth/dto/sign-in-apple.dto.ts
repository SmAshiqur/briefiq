// Body shape for POST /auth/apple. Matches what
// ASAuthorizationAppleIDCredential gives us on iOS.

import { IsOptional, IsString, MinLength } from 'class-validator';

export class SignInAppleDto {
  /** The JWT Apple returns. We verify this against Apple's public keys. */
  @IsString()
  @MinLength(20)
  identityToken!: string;

  /**
   * Apple includes the user's full name only on the FIRST sign-in. iOS
   * passes it through here so we can store a display name.
   */
  @IsOptional()
  @IsString()
  fullName?: string;

  /**
   * Apple may give us a relay email (or the real one). Optional because
   * "Hide my email" can also be set to "no email at all" by some users.
   */
  @IsOptional()
  @IsString()
  email?: string;
}
