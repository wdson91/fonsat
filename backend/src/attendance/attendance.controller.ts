import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Actor, Roles, type CurrentUser } from '../identity/identity';
import { CorrectionsService, type CorrectionInput } from './corrections.service';
import { AttendanceService } from './attendance.service';
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService, private readonly corrections: CorrectionsService) {}
  @Post(':id/corrections') @Roles('admin','foreman') correct(@Actor() u: CurrentUser, @Param('id') id: string, @Body() body: CorrectionInput) { return this.corrections.correct(u,id,body); }
  @Get('bootstrap') @Roles('worker') bootstrap(@Actor() u: CurrentUser) { return this.attendance.bootstrap(u); }
  @Post('sync') @Roles('worker') sync(@Actor() u: CurrentUser, @Body() body: { events: unknown }) { return this.attendance.sync(u, body?.events); }
  @Get('entries') @Roles('admin','foreman','worker') list(@Actor() u: CurrentUser) { return this.attendance.list(u); }
  @Get('team') @Roles('admin','foreman') team(@Actor() u: CurrentUser) { return this.attendance.team(u); }
}
