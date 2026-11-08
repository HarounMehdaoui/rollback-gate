import { defineConfig } from 'prisma/config';
export default defineConfig({ schema: 'test.prisma', datasource: { url: 'postgresql://x:y@127.0.0.1:1/none' } });
