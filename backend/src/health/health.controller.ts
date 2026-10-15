import { Controller, Get } from "@nestjs/common";
import { Public } from "../identity/identity";
import { HealthService } from "./health.service";

@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  health() {
    return this.healthService.getStatus();
  }
}
