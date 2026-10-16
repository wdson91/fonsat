import {
  Body,
  Controller,
  Delete,
  Param,
  ParseIntPipe,
  Get,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Actor, Roles, type CurrentUser } from '../identity/identity';
import { PlanningService } from './planning.service';
@Controller('planning')
@Roles('admin', 'foreman')
export class PlanningController {
  constructor(private readonly planning: PlanningService) {}
  @Get() list(@Actor() u: CurrentUser, @Query('week') week: string) {
    return this.planning.list(u, week);
  }
  @Put() save(
    @Actor() u: CurrentUser,
    @Body() body: Parameters<PlanningService['save']>[1],
  ) {
    return this.planning.save(u, body);
  }
  @Delete(':id') remove(
    @Actor() u: CurrentUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.planning.remove(u, id);
  }
  @Post('copy') copy(@Actor() u: CurrentUser, @Body() body: { week: string }) {
    return this.planning.copy(u, body.week);
  }
}
