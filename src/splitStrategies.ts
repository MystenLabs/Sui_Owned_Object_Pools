import { isCoin } from './helpers';
import { PoolObject } from './types';

/**
 * A strategy containing the rules that determine how the split of the pool will be done.
 *
 * - pred: A predicate function used to split the pool's objects and coins into a new pool.
 * This predicate is called for each object, and depending on what it returns,
 * the object will be moved to the new pool, stay in the current pool, or the split will be terminated.
 * The predicate should return:
 * 1. `true`, if the object will be moved to the new Pool
 * 2. `false`, if the object stays in `this` Pool
 * 3. `null`, if the split should be terminated and the new Pool should be returned immediately,
 * with the remaining unchecked objects being kept to the initial pool.
 *
 * [WARNING] If you want to implement a custom strategy, make sure that the predicate
 * will select at least one coin to be moved to the new pool, otherwise the transaction block
 * will not be able to determine the gas payment and will fail.
 *
 * - succeeded: A function that is called after the split is done to check if the split utilized the strategy as supposed to.
 */
export type SplitStrategy = {
  pred: (obj: PoolObject | undefined) => boolean | null;

  /**
   * Call this function after the split is done to check if the split utilized the strategy as supposed to.
   * Used in order to decide if it should be retried by loading more objects for the strategy to iterate over.
   * @returns A boolean indicating if the split succeeded or not.
   */
  succeeded: () => boolean;
};

/**
 * The DefaultSplitStrategy is used when no other strategy is provided.
 * It moves to the new pool one SUI (gas) coin.
 */
export class DefaultSplitStrategy implements SplitStrategy {
  private coinsToMove = 1;

  public pred(obj: PoolObject | undefined) {
    if (!obj) throw new Error('No object found!.');
    if (this.coinsToMove <= 0) {
      return null;
    }
    if (isCoin(obj.type)) {
      return this.coinsToMove-- > 0;
    } else {
      return false;
    }
  }

  public succeeded() {
    const check = this.coinsToMove <= 0;
    return check;
  }
}

/**
 * The IncludeAdminCapStrategy is used when the pool needs to contain an AdminCap object.
 * It moves to the new pool one object, one SUI (gas) coin, and one AdminCap object of the package.
 */
export class IncludeAdminCapStrategy implements SplitStrategy {
  private objectsToMove = 1;
  private coinsToMove = 1;
  private readonly packageId: string;
  private adminCapIncluded = false;

  /**
   * Creates a new instance of the Pool class.
   * @param packageId - The ID of the package containing the AdminCap.
   */
  constructor(packageId: string) {
    this.packageId = packageId;
  }
  public pred(obj: PoolObject | undefined) {
    if (!obj) throw new Error('No object found!.');
    if (obj.type.includes('AdminCap') && obj.type.includes(this.packageId)) {
      this.adminCapIncluded = true;
      return true;
    }
    const terminateWhen =
      this.objectsToMove <= 0 && this.coinsToMove <= 0 && this.adminCapIncluded;
    if (terminateWhen) {
      return null;
    }
    if (isCoin(obj.type) && this.coinsToMove > 0) {
      return this.coinsToMove-- > 0;
    } else if (!isCoin(obj.type) && this.objectsToMove > 0) {
      return this.objectsToMove-- > 0;
    } else {
      return false;
    }
  }
  public succeeded() {
    const check =
      this.objectsToMove <= 0 && this.coinsToMove <= 0 && this.adminCapIncluded;
    return check;
  }
}
