import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { OpsController } from './ops.controller';
import { OpsReadGuard } from './ops-read.guard';
import { OpsService } from './ops.service';

@Module({
  imports: [AuthModule],
  controllers: [OpsController],
  providers: [OpsService, OpsReadGuard],
})
export class OpsModule {}
