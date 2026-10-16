import { createApp } from "./app";

async function bootstrap() {
  const app = await createApp();
  await app.listen(process.env.PORT ?? 3001);
}

bootstrap().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
