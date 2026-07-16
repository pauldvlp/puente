import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ensureDataDir } from './config/paths';

export interface ServerHandle {
  url: string;
  port: number;
  close: () => Promise<void>;
}

/** Boot the NestJS control-plane server. Returns a handle for graceful shutdown. */
export async function bootstrap(opts: { port: number; host?: string }): Promise<ServerHandle> {
  ensureDataDir();
  const app = await NestFactory.create(AppModule, { cors: true });
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  const host = opts.host ?? '0.0.0.0';
  await app.listen(opts.port, host);
  return {
    url: `http://localhost:${opts.port}`,
    port: opts.port,
    close: () => app.close(),
  };
}

if (require.main === module) {
  const port = Number(process.env.PUENTE_PORT ?? process.env.PORT ?? 5006);
  bootstrap({ port }).then((handle) => {
    console.log(`puente server listening on ${handle.url}`);
  });
}
