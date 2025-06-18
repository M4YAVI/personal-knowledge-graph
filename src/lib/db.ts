import Redis from 'ioredis';

if (!process.env.DRAGONFLY_URL) {
  throw new Error('DRAGONFLY_URL is not set');
}

// ioredis connects directly to the redis:// URL.
// It will automatically handle connection retries.
export const db = new Redis(process.env.DRAGONFLY_URL, {
  // This is important for some environments, especially with Docker
  maxRetriesPerRequest: null,
});

db.on('connect', () => console.log('✅ Connected to DragonflyDB'));
db.on('error', (err) => console.error('❌ DragonflyDB Connection Error', err));
