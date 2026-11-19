// Small ULID: 48-bit time + 80 bits of randomness, Crockford base32. Sortable by creation time.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function ulid(now = Date.now()): string {
  let t = now;
  let time = "";
  for (let i = 0; i < 10; i++) {
    time = ALPHABET[t % 32] + time;
    t = Math.floor(t / 32);
  }
  let rand = "";
  for (let i = 0; i < 16; i++) rand += ALPHABET[Math.floor(Math.random() * 32)];
  return time + rand;
}
