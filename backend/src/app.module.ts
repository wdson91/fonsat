import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module";
import { IdentityModule } from "./identity/identity.module";
import { SitesModule } from "./sites/sites.module";

@Module({ imports: [HealthModule, IdentityModule, SitesModule] })
export class AppModule {}
