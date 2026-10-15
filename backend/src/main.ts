import { createApp } from "./app";
async function main() {
  const app = await createApp();
  await app.listen(Number(process.env.PORT ?? 3001), "0.0.0.0");
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
