import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
export async function createApp() {
  const app = await NestFactory.create(AppModule, {
    logger: process.env.NODE_ENV === "test" ? false : undefined,
  });
  app.setGlobalPrefix("api");
  app.enableShutdownHooks();
  return app;
}
