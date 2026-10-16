import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { Actor, type CurrentUser, Roles } from "../identity/identity";
import { AttendanceService } from "./attendance.service";
import {
  type CorrectionInput,
  CorrectionsService,
} from "./corrections.service";

@Controller("attendance")
export class AttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly corrections: CorrectionsService,
  ) {}

  @Post(":id/corrections")
  @Roles("admin", "foreman")
  correct(
    @Actor() user: CurrentUser,
    @Param("id") id: string,
    @Body() body: CorrectionInput,
  ) {
    return this.corrections.correct(user, id, body);
  }

  @Get("bootstrap")
  @Roles("worker")
  bootstrap(@Actor() user: CurrentUser) {
    return this.attendance.bootstrap(user);
  }

  @Post("sync")
  @Roles("worker")
  sync(@Actor() user: CurrentUser, @Body() body: { events: unknown }) {
    return this.attendance.sync(user, body?.events);
  }

  @Get("entries")
  @Roles("admin", "foreman", "worker")
  list(@Actor() user: CurrentUser) {
    return this.attendance.list(user);
  }

  @Get("team")
  @Roles("admin", "foreman")
  team(@Actor() user: CurrentUser) {
    return this.attendance.team(user);
  }
}
