export type PoolObject = {
  objectId: string;
  digest: string;
  version: string;
  type: string;
};
export type PoolObjectsMap = Map<string, PoolObject>; // Map<objectId, object>
