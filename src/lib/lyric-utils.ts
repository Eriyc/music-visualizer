export interface Line {
  startTimeMs: number;
  words: string;
}

export function parseLrc(lrcContent: string): Line[] {
  const lines: Line[] = [];
  const timeRegex = /\[(\d{2}:\d{2}\.\d{2,3})\](.*)/;

  for (const line of lrcContent.split("\n")) {
    const match = timeRegex.exec(line);

    if (match) {
      const timestamp = match[1];
      const text = match[2];

      if (timestamp && text) {
        const startTimeMs = lrcTimeToMilliseconds(timestamp);

        lines.push({
          startTimeMs: startTimeMs,
          words: text,
        });
      }
    }
  }

  return lines;
}

function lrcTimeToMilliseconds(lrcTime: string): number {
  const parts = lrcTime.split(":");
  const minutes = Number.parseInt(parts[0], 10);
  const secondsAndMilliseconds = parts[1].split(".");
  const seconds = Number.parseInt(secondsAndMilliseconds[0], 10);
  const millisecondsStr = secondsAndMilliseconds[1];
  let milliseconds: number;

  if (millisecondsStr.length === 2) {
    milliseconds = Number.parseInt(millisecondsStr, 10) * 10;
  } else if (millisecondsStr.length === 3) {
    milliseconds = Number.parseInt(millisecondsStr, 10);
  } else {
    milliseconds = 0;
  }

  return minutes * 60 * 1000 + seconds * 1000 + milliseconds;
}
