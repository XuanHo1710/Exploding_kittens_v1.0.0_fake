import { Global, Module } from '@nestjs/common';
import { LocalRedisService } from './local-redis.service';
import {
  RedisIdempotencyService,
  RedisLockoutService,
  RedisPresenceService,
  RedisRateLimitService,
  RedisSessionCacheService,
} from './redis-ephemeral.services';

@Global()
@Module({
  providers: [
    LocalRedisService,
    RedisSessionCacheService,
    RedisLockoutService,
    RedisIdempotencyService,
    RedisPresenceService,
    RedisRateLimitService,
  ],
  exports: [
    LocalRedisService,
    RedisSessionCacheService,
    RedisLockoutService,
    RedisIdempotencyService,
    RedisPresenceService,
    RedisRateLimitService,
  ],
})
export class LocalRedisModule {}
