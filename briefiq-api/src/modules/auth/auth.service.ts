// AuthService — verifies Apple identity tokens, upserts the user, and
// issues our own JWT session token.
//
// During prototype on Windows you can sign in with a fake user (see the
// `devSignIn` method) without an Apple Developer account. Production code
// path uses apple-signin-auth to verify the JWT against Apple's JWKS.

import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import { DRIZZLE_TOKEN, type DrizzleDb } from '../../db/client';
import { users } from '../../db/schema';
import { getEnv } from '../../config/env';
import type { SignInAppleDto } from './dto/sign-in-apple.dto';

export interface AuthUser {
  id: string;
  appleSub: string;
  email: string | null;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(DRIZZLE_TOKEN) private readonly db: DrizzleDb,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Production sign-in path: verify Apple identity token, upsert user,
   * mint a session JWT.
   */
  async signInWithApple(dto: SignInAppleDto): Promise<{ token: string; user: AuthUser }> {
    const env = getEnv();
    if (!env.APPLE_CLIENT_ID) {
      throw new UnauthorizedException(
        'Apple Sign-In is not configured on this server (APPLE_CLIENT_ID missing).',
      );
    }

    // apple-signin-auth verifies the JWT against Apple's JWKS, ensures the
    // audience matches our bundle id, checks expiration, and returns the
    // payload. Throws on any tamper. Dynamic import to keep startup light.
    const appleSignin = await import('apple-signin-auth');
    let payload;
    try {
      payload = await appleSignin.default.verifyIdToken(dto.identityToken, {
        audience: env.APPLE_CLIENT_ID,
        ignoreExpiration: false,
      });
    } catch (err) {
      this.logger.warn(`Apple token verification failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Invalid Apple identity token');
    }

    return this.upsertAndIssue({
      appleSub: payload.sub,
      email: dto.email ?? payload.email ?? null,
    });
  }

  /**
   * Dev-only sign-in for prototype iteration. Bypasses Apple completely.
   * Disabled in production via NODE_ENV check in the controller.
   */
  async devSignIn(handle: string): Promise<{ token: string; user: AuthUser }> {
    return this.upsertAndIssue({
      // Stable fake sub so re-running dev sign-in returns the same user.
      appleSub: `dev:${handle}`,
      email: `${handle}@dev.briefiq.local`,
    });
  }

  /** Look up a user by id — used by JwtStrategy to populate request.user. */
  async findById(id: string): Promise<AuthUser | null> {
    const rows = await this.db
      .select({ id: users.id, appleSub: users.appleSub, email: users.email })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  // ── Private ──

  private async upsertAndIssue(input: {
    appleSub: string;
    email: string | null;
  }) {
    // INSERT ... ON CONFLICT(apple_sub) DO UPDATE returning the row.
    // Email gets refreshed in case the user toggled "Hide my email" later.
    const [row] = await this.db
      .insert(users)
      .values({ appleSub: input.appleSub, email: input.email })
      .onConflictDoUpdate({
        target: users.appleSub,
        set: { email: input.email },
      })
      .returning({
        id: users.id,
        appleSub: users.appleSub,
        email: users.email,
      });

    const token = await this.jwt.signAsync({ sub: row.id });
    return { token, user: row };
  }
}
