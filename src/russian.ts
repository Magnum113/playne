export function counted(n: number, one: string, few: string, many: string) {
  const v = Math.abs(n) % 100, last = v % 10;
  return `${n} ${v >= 11 && v <= 14 ? many : last === 1 ? one : last >= 2 && last <= 4 ? few : many}`;
}
