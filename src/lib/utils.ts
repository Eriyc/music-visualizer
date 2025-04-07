import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const formatMs = (ms: number) => {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes < 10 ? `0${minutes}` : minutes}:${
    seconds < 10 ? "0" : ""
  }${seconds.toFixed(0)}`;
};

function toColor(code: number) {
  const hex = 16777216 + code;

  return `#${hex.toString(16).slice(1, 7)}`;
}

export { formatMs, toColor };
