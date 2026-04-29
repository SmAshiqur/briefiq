// Passport JWT strategy. Wires `Authorization: Bearer <token>` headers into
// `request.user` (an AuthUser).
//
// We re-read the user from the DB on every request rather than trusting
// claims alone. That's slower but means a soft-deleted user instantly
// loses access without waiting for the JWT to expire.

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService, AuthUser } from './auth.service';
import { getEnv } from '../../config/env';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly auth: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getEnv().JWT_SECRET,
    });
  }

  /**
   * Passport calls this after verifying the JWT signature. Whatever we
   * return becomes `request.user`. Throwing UnauthorizedException denies
   * the request.
   */
  async validate(payload: { sub: string }): Promise<AuthUser> {
    const user = await this.auth.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }
    return user;
  }
}
