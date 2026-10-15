import { ServiceUnavailableException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { expect, it, vi } from "vitest";
import { PrismaService } from "../src/database/prisma.service";
import { HealthModule } from "../src/health/health.module";
import { HealthService } from "../src/health/health.service";

it("devolve indisponibilidade quando a ligação ao banco falha", async () => {
  const module = await Test.createTestingModule({ imports: [HealthModule] })
    .overrideProvider(PrismaService)
    .useValue({ $queryRaw: vi.fn().mockRejectedValue(new Error("connection failed")) })
    .compile();
  try {
    await expect(module.get(HealthService).getStatus()).rejects.toBeInstanceOf(ServiceUnavailableException);
  } finally {
    await module.close();
  }
});
