import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { PlanningController } from './planning.controller';
import { PlanningService } from './planning.service';
@Module({ imports: [CatalogModule], controllers: [PlanningController], providers: [PlanningService] })
export class PlanningModule {}
