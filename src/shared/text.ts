/** Trims a name and collapses inner whitespace ("  X10   600 " → "X10 600"). */
export function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}
