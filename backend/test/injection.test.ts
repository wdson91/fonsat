import "reflect-metadata";
import { Injectable } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { expect, it } from "vitest";
import { PrismaService } from "../src/database/prisma.service";

@Injectable()
class ExampleService {
  constructor(readonly prisma: PrismaService) {}
}

it("resolve uma dependência de classe pelo tipo do construtor, sem @Inject", async () => {
  const prisma = {};
  const module = await Test.createTestingModule({
    providers: [ExampleService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  try {
    expect(module.get(ExampleService).prisma).toBe(prisma);
  } finally {
    await module.close();
  }
});
