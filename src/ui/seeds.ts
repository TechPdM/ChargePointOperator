/**
 * A random day for free play: `s1`–`s9999`. Seeds are strings (D26); the
 * `s<number>` form matches the CLI's and stays readable in the top bar, so a
 * day can be noted down and replayed. Never returns `current`, so New seed
 * always changes the day.
 */
export function randomDaySeed(current?: string): string {
  for (;;) {
    const seed = `s${1 + Math.floor(Math.random() * 9_999)}`;
    if (seed !== current) return seed;
  }
}
