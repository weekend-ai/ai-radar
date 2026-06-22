/**
 * Shared BullMQ + ioredis connection.
 *
 * BullMQ wants a Redis connection that supports its blocking calls. We use a
 * single shared connection across the scheduler process — Queue.add() and
 * Worker() both reuse it via the `connection` factory below.
 *
 * Two connections are returned because BullMQ requires SEPARATE connections
 * for the worker (blocking) vs the queue (non-blocking). The bullmq docs
 * are explicit about this: workers should not share a connection with the
 * publishing side.
 */

import IORedis, { type Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6380";

let _queueConn: Redis | null = null;
let _workerConn: Redis | null = null;

export function getQueueConnection(): Redis {
  if (_queueConn) return _queueConn;
  _queueConn = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null, // BullMQ requires this
  });
  return _queueConn;
}

export function getWorkerConnection(): Redis {
  if (_workerConn) return _workerConn;
  _workerConn = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
  });
  return _workerConn;
}

export async function closeRedisConnections() {
  await Promise.allSettled([_queueConn?.quit(), _workerConn?.quit()]);
  _queueConn = null;
  _workerConn = null;
}
