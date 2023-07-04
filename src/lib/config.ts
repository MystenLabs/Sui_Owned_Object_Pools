// Copyright (c) 2023, Mysten Labs, Inc.

/**
 * Prepare all system variables to be used in other parts of
 * the application
 *
 * @module lib/config
 */

import { config } from 'dotenv';

config({});

export const redisConfig = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || '6379'
};
