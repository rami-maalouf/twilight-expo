// local ids only; matches the shape of UUID().uuidString
export function makeId(): string {
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  const s = (n: number) => Array.from({ length: n }, hex).join('');
  return `${s(8)}-${s(4)}-4${s(3)}-${((Math.random() * 4) | 8).toString(16)}${s(3)}-${s(12)}`.toUpperCase();
}
