// Auth module — Apple Sign-In identity-token verification + our own JWT
// session tokens.
//
// Flow (matches plan.md):
//   iOS calls AuthorizationAppleIDRequest -> gets identityToken
//   iOS POSTs identityToken to POST /auth/apple
//   Backend verifies the token with Apple's keys, upserts a user row
//   Backend mints a JWT session token, returns it
//   iOS stores the session token in Keychain, sends it on every request

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';
import { getEnv } from '../../config/env';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      // useFactory so the secret is read after env validation has run.
      useFactory: () => {
        const env = getEnv();
        return {
          secret: env.JWT_SECRET,
          signOptions: { expiresIn: env.JWT_EXPIRES_IN },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard],
  // Export the guard so any controller can `@UseGuards(JwtAuthGuard)`.
  exports: [JwtAuthGuard, AuthService],
})
export class AuthModule {}
