import { Body, Controller, Get, Post } from '@nestjs/common';
import { Actor, Roles, type CurrentUser } from '../identity/identity';
import { AttendanceService } from './attendance.service';
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}
  @Get('bootstrap') @Roles('worker') bootstrap(@Actor() u: CurrentUser) { return this.attendance.bootstrap(u); }
  @Post('sync') @Roles('worker') sync(@Actor() u: CurrentUser, @Body() body: { events: unknown }) { return this.attendance.sync(u, body?.events); }
  @Get('entries') @Roles('admin','foreman','worker') list(@Actor() u: CurrentUser) { return this.attendance.list(u); }
  @Get('team') @Roles('admin','foreman') team(@Actor() u: CurrentUser) { return this.attendance.team(u); }
}
