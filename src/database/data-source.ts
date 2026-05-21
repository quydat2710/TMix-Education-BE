import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';

/**
 * Standalone DataSource for TypeORM CLI migrations.
 *
 * Usage:
 *   npx typeorm migration:generate -d src/database/data-source.ts src/database/migrations/MigrationName
 *   npx typeorm migration:run -d src/database/data-source.ts
 *   npx typeorm migration:revert -d src/database/data-source.ts
 */
const options: DataSourceOptions = {
  type: (process.env.DATABASE_TYPE as any) || 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: process.env.DATABASE_PORT ? parseInt(process.env.DATABASE_PORT, 10) : 5432,
  username: process.env.DATABASE_USERNAME || 'root',
  password: process.env.DATABASE_PASSWORD || '',
  database: process.env.DATABASE_NAME || 'eng-center',
  entities: [__dirname + '/../**/*.entity{.js,.ts}'],
  migrations: [__dirname + '/migrations/*{.js,.ts}'],
  synchronize: false,
  ssl: process.env.DATABASE_SSL_MODE === 'require'
    ? { rejectUnauthorized: false }
    : false,
};

export default new DataSource(options);
