import { Module } from "@nestjs/common";
import { CatalogModule } from "../catalog/catalog.module";
import { AttendanceController } from "./attendance.controller";
import { AttendanceService } from "./attendance.service";
import { CorrectionsService } from "./corrections.service";

@Module({
  imports: [CatalogModule],
  controllers: [AttendanceController],
  providers: [AttendanceService, CorrectionsService],
})
export class AttendanceModule {}
