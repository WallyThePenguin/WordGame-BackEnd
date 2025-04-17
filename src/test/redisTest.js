import redisClient from '../utils/redisClient.js';

async function test() {
  await redisClient.set('test-key', 'hello world');
  const value = await redisClient.get('test-key');
  console.log('🔁 Redis roundtrip:', value);
  await redisClient.quit();
}

test();
