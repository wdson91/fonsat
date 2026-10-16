import { expect, it } from "vitest";
import { AttendanceService } from "../src/attendance/attendance.service";
import type { TenantService } from "../src/database/tenant.service";
import type { ScopeService } from "../src/common/scope.service";
import type { CurrentUser } from "../src/identity/identity";
it("um lote de sincronização tem de conter pelo menos uma marcação", async () => {
  const service = new AttendanceService(
    {} as TenantService,
    {} as ScopeService,
  );
  await expect(service.sync({} as CurrentUser, [])).rejects.toMatchObject({
    status: 400,
  });
});
