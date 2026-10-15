import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import type { INestApplication } from "@nestjs/common";
describe("API com PostgreSQL real", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createApp();
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });
  it("confirma comunicação HTTP e ligação ao banco", async () => {
    const response = await request(app.getHttpServer()).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", database: "ok" });
  });
});
