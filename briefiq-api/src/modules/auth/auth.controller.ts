// Auth controller — POST /auth/apple and (dev only) POST /auth/dev.

import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignInAppleDto } from './dto/sign-in-apple.dto';
import { getEnv } from '../../config/env';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * iOS posts the identityToken from ASAuthorizationAppleIDCredential.
   * We verify, upsert, and return a session JWT.
   */
  @Post('apple')
  async apple(@Body() dto: SignInAppleDto) {
    return this.auth.signInWithApple(dto);
  }

  /**
   * Dev-only shortcut so you can build features on Windows without an
   * Apple Developer account. Returns a real JWT for a fake user.
   *
   * Disabled outside development. The check lives inside the handler
   * (not as a guard) so it shows up loudly in 4xx responses.
   */
  @Post('dev')
  async devSignIn(@Body() body: { handle?: string }) {
    if (getEnv().NODE_ENV === 'production') {
      throw new BadRequestException('Dev sign-in is disabled in production.');
    }
    if (!body.handle || body.handle.length < 2) {
      throw new BadRequestException('handle is required (min 2 chars)');
    }
    return this.auth.devSignIn(body.handle);
  }
}
