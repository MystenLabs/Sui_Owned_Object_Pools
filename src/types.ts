/**
 * Represents an object in a pool.
 */
export type PoolObject = {
  objectId: string;
  digest: string;
  version: string;
  type: string;
};

/**
 * A map of pool objects, where the keys are object IDs and the values are pool objects.
 */
export type PoolObjectsMap = Map<string, PoolObject>; // Map<objectId, object>
