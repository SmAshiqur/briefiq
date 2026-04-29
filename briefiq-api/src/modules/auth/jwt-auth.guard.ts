// Convenience subclass — same behavior as `AuthGuard('jwt')` but with a
// concrete name to import. Apply with @UseGuards(JwtAuthGuard) on any
// controller method that requires a logged-in user.

import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
