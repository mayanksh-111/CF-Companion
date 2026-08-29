import { ProblemStatus } from "../problemPanel";
export function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";

  for(let i = 0; i < 32; i++){
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeAttr(value: unknown): string {
  return escapeHtml(value);
}

export function timeAgo(unixSeconds: number): string {
  const diffMs = Date.now() - unixSeconds * 1000;
  const minutes = Math.floor(diffMs / 60000);

  if(minutes < 1){ return "just now"; }
  if(minutes < 60){ return `${minutes}m ago`; }
  
  const hours = Math.floor(minutes / 60);
  if(hours < 24){ return `${hours}h ago`; }

  const days = Math.floor(hours / 24);
  if(days < 30){ return `${days}d ago`; }

  const months = Math.floor(days / 30);
  if(months < 12){ return `${months}mo ago`; }

  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

export function verdictClass(verdict?: string): string {
  if(verdict === "OK"){ return "v-ok"; }
  if(verdict === "WRONG_ANSWER") { return "v-wa"; }
  if(verdict === "TIME_LIMIT_EXCEEDED"){ return "v-tle"; }
  if(
    [
      "RUNTIME_ERROR",
      "MEMORY_LIMIT_EXCEEDED",
      "COMPILATION_ERROR",
      "IDLENESS_LIMIT_EXCEEDED",
      "CHALLENGED",
    ].includes(verdict ?? "")
  ){ return "v-err"; }

  return "v-other";
}

export function formatVerdict(
  verdict?: string
): ProblemStatus {
    const labels: Record<string, ProblemStatus> = {
        OK: "Accepted",
        WRONG_ANSWER: "Wrong Answer",
        TIME_LIMIT_EXCEEDED: "Time Limit",
        MEMORY_LIMIT_EXCEEDED: "Memory Limit",
        RUNTIME_ERROR: "Runtime Error",
        COMPILATION_ERROR: "Compilation Error",
        IDLENESS_LIMIT_EXCEEDED: "Idleness Limit",
        CHALLENGED: "Challenged",
        TESTING: "Judging…",
        UNKNOWN: "Unknown",
    };

  return labels[verdict ?? "UNKNOWN"] ?? "Unknown";
}

export function getRatingClass(rating?: number | null): string {
  if(rating === null || rating === undefined){ return "rating-unrated"; }
  if(rating >= 3000){ return "rating-red"; }
  if(rating >= 2600){ return "rating-red"; }
  if(rating >= 2400){ return "rating-orange"; }
  if(rating >= 2100){ return "rating-yellow"; }
  if(rating >= 1900){ return "rating-purple"; }
  if(rating >= 1600){ return "rating-blue"; }
  if(rating >= 1400){ return "rating-cyan"; }
  if(rating >= 1200){ return "rating-green"; }

  return "rating-gray";
}

export function getRatingHex(rating?: number | null): string {
  if(rating === null || rating === undefined) return "#8a8a8a";
  if(rating >= 2600) return "#ff2b2b";
  if(rating >= 2400) return "#ff2b2b";
  if(rating >= 2100) return "#ff8c00";
  if(rating >= 1900) return "#a0a";
  if(rating >= 1600) return "#58a6ff";
  if(rating >= 1400) return "#00b8d9";
  if(rating >= 1200) return "#2ea043";
  return "#8a8a8a";
}