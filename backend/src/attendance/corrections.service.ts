import { lockCompanyFinance } from '../invoices/invoice-source';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantService } from '../database/tenant.service';
import { ScopeService } from '../common/scope.service';
import { date, dayInZone, instant, integer, text, uuid } from '../common/validation';
import type { CurrentUser } from '../identity/identity';
export interface CorrectionInput { expectedVersion: unknown; siteId: unknown; tradeId: unknown; startAt: unknown; endAt: unknown; reason: unknown }
@Injectable()
export class CorrectionsService {
  constructor(private readonly tenant: TenantService, private readonly scope: ScopeService) {}
  correct(user: CurrentUser, entryId: string, body: CorrectionInput) {
    uuid(entryId);
    const expectedVersion=integer(body.expectedVersion), siteId=integer(body.siteId), tradeId=integer(body.tradeId), reason=text(body.reason,'Motivo');
    const startAt=instant(body.startAt), endAt=body.endAt==null||body.endAt===''?null:instant(body.endAt);
    if(endAt && endAt < startAt)throw new BadRequestException('A saída não pode ser anterior à entrada.');
    const minutes=endAt?Math.floor(+endAt/60000)-Math.floor(+startAt/60000):null;
    if(minutes!==null && minutes>2147483647)throw new BadRequestException('Duração fora do intervalo suportado.');
    return this.tenant.inCompany(user.company_id, async tx=>{
      await lockCompanyFinance(tx,user.company_id);
      const entry=await tx.workEntry.findUnique({where:{id:entryId},include:{versions:{orderBy:{number:'desc'},take:1}}});
      if(!entry)throw new NotFoundException('Registo não encontrado.');
      const old=entry.versions[0];
      const originalSite=await this.scope.site(tx,user,old.siteId), targetSite=await this.scope.site(tx,user,siteId);
      if(user.role!=='admin' && originalSite.clientId!==targetSite.clientId)throw new BadRequestException('Transferências entre clientes requerem o administrativo.');
      if(entry.currentVersion!==expectedVersion)throw new ConflictException('O registo mudou. Atualize o ecrã antes de corrigir.');
      if(!await tx.trade.findUnique({where:{id:tradeId}}))throw new BadRequestException('Ofício não pertence à empresa.');
      const changed=await tx.workEntry.updateMany({where:{id:entryId,currentVersion:expectedVersion},data:{currentVersion:expectedVersion+1}});
      if(changed.count!==1)throw new ConflictException('O registo mudou. Atualize o ecrã antes de corrigir.');
      const version=await tx.entryVersion.create({data:{companyId:user.company_id,entryId,number:expectedVersion+1,siteId,tradeId,startAt,endAt,workedOn:date(dayInZone(startAt,user.time_zone)),minutes,source:'manual',reason,authorId:user.id}});
      await tx.auditEvent.create({data:{companyId:user.company_id,authorId:user.id,action:'attendance.correct',entityId:entryId,payload:{beforeVersionId:old.id,afterVersionId:version.id,reason}}});
      return version;
    });
  }
}
