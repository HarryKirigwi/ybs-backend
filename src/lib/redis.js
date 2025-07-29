import Redis from 'redis';

const redisClient = Redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  password: process.env.REDIS_PASSWORD,
});

redisClient.on('error', (err) => console.error('Redis Client Error:', err));
redisClient.on('connect', () => console.log('Redis connected'));

// Connect to Redis
await redisClient.connect().catch(console.error);

export { redisClient }; 