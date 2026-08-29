import { CfSubmission, fetchUserSubmissions } from "../cfApi";

const FULL_FETCH_COUNT = 10000;
interface CacheEntry { submissions: CfSubmission[]; lastFullFetch: number; }

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<CfSubmission[]>>();

export function getFullSubmissions(handle: string): Promise<CfSubmission[]> {
  const key = handle.toLowerCase();

  const existingCall = inFlight.get(key);
  if(existingCall){
    return existingCall;
  }

  const call = fetchUserSubmissions(handle, FULL_FETCH_COUNT)
    .then((submissions) => {
      cache.set(key, { submissions, lastFullFetch: Date.now() });
      return submissions;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, call);
  return call;
}

export function getCachedSubmissions(handle: string): CfSubmission[] {
  return cache.get(handle.toLowerCase())?.submissions ?? [];
}

export function invalidate(handle: string): void {
  cache.delete(handle.toLowerCase());
}