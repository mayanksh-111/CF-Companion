import * as https from "https";

export interface CfUser {
  handle: string;
  rating?: number;
  maxRating?: number;
  rank?: string;
  maxRank?: string;
  titlePhoto?: string;
  avatar?: string;
}

export interface CfSubmission {
  id: number;
  creationTimeSeconds: number;
  verdict?: string;
  problem: {
    contestId?: number;
    index: string;
    name: string;
    rating?: number;
    tags: string[];
  };
}

export interface CfRatingChange {
  contestId: number;
  contestName: string;
  handle: string;
  rank: number;
  ratingUpdateTimeSeconds: number;
  oldRating: number;
  newRating: number;
}

function getJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "cf-companion-vscode-extension" } }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try{
          const parsed = JSON.parse(data);
          if(parsed.status && parsed.status !== "OK"){
            reject(new Error(parsed.comment ?? "Codeforces API error"));
            return;
          }
          resolve(parsed.result ?? parsed);
        }
        catch(e){
          reject(e);
        }
      });
    })
    .on("error", reject);
  });
}

export async function fetchUserInfo(handle: string): Promise<CfUser> {
  const result = await getJson<any[]>(`https://codeforces.com/api/user.info?handles=${encodeURIComponent(handle)}`);
  const u = result[0];
  return {
    handle: u.handle,
    rating: u.rating,
    maxRating: u.maxRating,
    rank: u.rank,
    maxRank: u.maxRank,
    avatar: u.titlePhoto ?? u.avatar,
  };
}

export async function fetchUserSubmissions(handle: string, count = 10000, from = 1): Promise<CfSubmission[]> {
  return getJson<CfSubmission[]>(`https://codeforces.com/api/user.status?handle=${encodeURIComponent(handle)}&from=${from}&count=${count}`);
}

export async function fetchUserRatingHistory(handle: string): Promise<CfRatingChange[]> {
  return getJson<CfRatingChange[]>(`https://codeforces.com/api/user.rating?handle=${encodeURIComponent(handle)}`);
}