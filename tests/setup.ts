import 'dotenv/config';
// Never silently fall back to the application database.
import { assertTestDatabase } from './test-database.js';
assertTestDatabase(process.env.DATABASE_URL_TEST, process.env.DATABASE_URL);
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
