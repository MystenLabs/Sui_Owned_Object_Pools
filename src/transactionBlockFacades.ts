// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0
import type { Transactions } from '@mysten/sui.js/transactions';
import { TransactionBlock } from '@mysten/sui.js/transactions';

/**
 * This class is a wrapper around TransactionBlock that allows to
 * moveCall without an adminCapId.
 * It saves temporarily the arguments of the moveCall method so that
 * the AdminCap id can be injected later by the corresponding worker pool.
 */
export class AdminCapTransactionBlockFacade {
  public readonly adminCapIdentifier: string;
  private readonly adminCapIndex: number;
  public transactionBlock: TransactionBlock;

  private transactionBlockArguments:
    | Parameters<(typeof Transactions)['MoveCall']>
    | undefined;
  constructor(
    adminCapIdentifier = 'AdminCap',
    adminCapIndex = 0,
    transaction?: TransactionBlock,
  ) {
    this.adminCapIdentifier = adminCapIdentifier;
    this.adminCapIndex = adminCapIndex;
    this.transactionBlock = new TransactionBlock(transaction);
  }

  public moveCall(...args: Parameters<(typeof Transactions)['MoveCall']>) {
    this.transactionBlockArguments = args;
  }

  public runMoveCall(
    adminCapId: string,
  ): ReturnType<typeof TransactionBlock.prototype.moveCall> {
    if (!this.transactionBlockArguments) {
      throw new Error('TransactionBlock arguments are undefined!');
    }
    const args = this.transactionBlockArguments;
    if (!args[0].arguments) {
      throw new Error('Arguments are not provided!');
    }
    const argsWithAdminCap = [
      ...args[0].arguments.slice(0, this.adminCapIndex),
      this.transactionBlock.object(adminCapId),
      ...args[0].arguments.slice(this.adminCapIndex),
    ];

    return this.transactionBlock.moveCall({
      arguments: argsWithAdminCap,
      target: args[0].target,
      typeArguments: args[0].typeArguments,
    });
  }

  public pure(value: unknown, type?: string) {
    return this.transactionBlock.pure(value, type);
  }
  public object(value: any) {
    return this.transactionBlock.object(value);
  }
}
