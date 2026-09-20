import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';
import { config } from './config.js';
const adapter = new PrismaPg({ connectionString: config.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000 });
export const db = new PrismaClient({ adapter });
