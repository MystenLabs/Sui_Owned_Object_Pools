// Copyright (c) 2023, Mysten Labs, Inc.
/**
 * Database manager for the application.
 *
 * @module lib/db
 */

import { createClient, RedisClientType } from 'redis';
import * as cfg from './config';
import { Coin } from '../Coin';

const defaultClient = client();

/**
 * Get a Client instance.
 */
export function client(): RedisClientType {
  // @ts-ignore
  const client: RedisClientType = createClient({ socket: cfg.redisConfig });
  return client;
}

// @ts-ignore
// Have to insert this line to avoid: "Do not know how to serialize a BigInt"
// More details in this issue: https://github.com/prisma/studio/issues/614
BigInt.prototype.toJSON = function () {
  return this.toString();
};

/**
 * Connect the client to the db.
 */
export function connect() {
  return defaultClient
    .connect()
    .then(() => console.log('Redis client connected'));
}

/**
 * Disconnect the client.
 */
export function disconnect() {
  return defaultClient
    .disconnect()
    .then(() => console.log('Redis client disconnected'));
}

/**
 * Store coins to db.
 */
export function storeCoins(coins: Coin[]) {
  coins.forEach((coin) => {
    defaultClient.hSet(`coin:${coin.coinObjectId}`, coin as any);
  });
}

/**
 * Delete coin from db.
 */
export async function deleteCoin(id: string) {
  let keys = await defaultClient.hKeys(`coin:${id}`);

  keys.forEach((key) => {
    defaultClient.hDel(`coin:${id}`, key);
  });
}

/**
 * Retrieve coins by id from db.
 */
export async function getCoinById(id: string) {
  let coin = await defaultClient.hGetAll(`coin:${id}`);
  console.log(JSON.stringify(coin, null, 2));

  return coin;
}

/**
 * Get total coin balance from db.
 */
export async function getTotalBalance() {
  let totalBalance: number = 0;
  let coins = await defaultClient.scan(0);

  let getBalance = new Promise<void>((resolve) => {
    coins.keys.forEach(async (coin, index, array) => {
      let coinBalance = await defaultClient.hGet(`${coin}`, 'balance');

      totalBalance += Number(coinBalance);
      if (index === array.length - 1) resolve();
    });
  });

  getBalance
    .then(() => {
      console.log('Total Balance: ', totalBalance);

      return totalBalance;
    })
    .catch((err) => {
      console.error('Could not get total balance because of error: ', err);
    });
}

/**
 * Retrieve length of coins from db.
 */
export async function getLength() {
  defaultClient.dbSize().then((res) => {
    return res;
  });
}
