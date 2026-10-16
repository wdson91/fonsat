import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
@Module({ imports: [CatalogModule], controllers: [AttendanceController], providers: [AttendanceService] })
export class AttendanceModule {}
