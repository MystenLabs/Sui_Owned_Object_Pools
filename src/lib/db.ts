// Copyright (c) 2023, Mysten Labs, Inc.
/**
 * Database manager for the application.
 *
 * @module lib/db
 */

import { createClient, RedisClientOptions } from 'redis';

import { Coin } from '../Coin';
import * as cfg from './config';

declare global {
  interface BigInt {
    toJSON(): string;
  }
}

const defaultClient = client();

/**
 * Get a Client instance.
 */
export function client() {
  const options: RedisClientOptions = {
    socket: {
      host: cfg.redisConfig.host,
      port: Number(cfg.redisConfig.port),
    },
    // Add any other necessary options here
  };

  const client = createClient(options);
  return client;
}

// Have to insert this line to avoid: "Do not know how to serialize a BigInt"
// More details in this issue: https://github.com/prisma/studio/issues/614
BigInt.prototype.toJSON = function () {
  return this.toString();
};

/**
 * Connect the client to the db.
 */
export async function connect() {
  await defaultClient.connect();
  return console.log('Redis client connected');
}

/**
 * Disconnect the client.
 */
export async function disconnect() {
  await defaultClient.disconnect();
  return console.log('Redis client disconnected');
}

/**
 * Store coins to db.
 */
export function storeCoins(coins: Coin[]) {
  coins.forEach((coin) => {
    defaultClient.hSet(
      `coin:${coin.coinObjectId}`,
      'coin',
      JSON.stringify(coin),
    );
  });
}

/**
 * Delete coin from db.
 */
export async function deleteCoin(id: string) {
  const keys = await defaultClient.hKeys(`coin:${id}`);

  keys.forEach((key) => {
    defaultClient.hDel(`coin:${id}`, key);
  });
}

/**
 * Retrieve coins by id from db.
 */
export async function getCoinById(id: string) {
  const coin = await defaultClient.hGetAll(`coin:${id}`);

  return coin;
}

/**
 * Get total coin balance from db.
 */
export async function getTotalBalance() {
  let totalBalance = 0;
  const { cursor, keys } = await defaultClient.scan(0);

  for (const key of keys) {
    const coinBalance = await defaultClient.hGet(`${key}`, 'balance');

    totalBalance += Number(coinBalance);
  }

  return totalBalance;
}

/**
 * Retrieve length of coins from db.
 */
export async function getLength() {
  defaultClient.dbSize().then((res) => {
    return res;
  });
}

/**
 * Retrieve a snapshot of all the coins used as gas.
 */
export async function getSnapshot(): Promise<Coin[]> {
  const keys = await defaultClient.keys('coin:*');
  const coins: Coin[] = [];

  for (const key of keys) {
    const coinObject = await defaultClient.hGet(key, 'coin');
    if (coinObject) {
      const coin = JSON.parse(coinObject) as Coin;
      coins.push(coin);
    }
  }

  return coins;
}

/**
 * Get all coins from db.
 * @returns {Promise<Coin[]>} - A promise that resolves to an array of coins.
 **/
export async function getAllCoins(): Promise<Coin[]> {
  const coins: Coin[] = [];
  await defaultClient.keys('coin:*').then(async (keys) => {
    for (const key of keys) {
      await defaultClient.hGetAll(key).then((coin) => {
        if (coin) {
          let coinObj = new Coin(
            coin.version,
            coin.digest,
            coin.coinType,
            coin.previousTransaction,
            key.replace('coin:',''),
            coin.balance,
          );
          
          coins.push(coinObj);
        }
      });
    }
  });
  
  return coins;
}