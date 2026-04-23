import { startServer } from './server';

async function main() {
  const server = await startServer();
  await new Promise<void>((resolve, reject) => {
    server.on('close', resolve);
    server.on('error', reject);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
