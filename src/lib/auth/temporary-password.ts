import { randomInt } from "node:crypto";

const UPPERCASE = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWERCASE = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%&*";
const ALL_CHARACTERS = `${UPPERCASE}${LOWERCASE}${DIGITS}${SYMBOLS}`;

export const TEMPORARY_PASSWORD_MIN_LENGTH = 12;
export const TEMPORARY_PASSWORD_MAX_LENGTH = 128;
export const GENERATED_TEMPORARY_PASSWORD_LENGTH = 16;

function pick(characters: string): string {
  return characters[randomInt(characters.length)];
}

export function generateTemporaryPassword(
  length = GENERATED_TEMPORARY_PASSWORD_LENGTH,
): string {
  if (
    !Number.isInteger(length) ||
    length < TEMPORARY_PASSWORD_MIN_LENGTH ||
    length > TEMPORARY_PASSWORD_MAX_LENGTH
  ) {
    throw new RangeError("Temporary password length is outside the supported range.");
  }

  const characters = [
    pick(UPPERCASE),
    pick(LOWERCASE),
    pick(DIGITS),
    pick(SYMBOLS),
  ];

  while (characters.length < length) characters.push(pick(ALL_CHARACTERS));

  // Fisher-Yates with crypto.randomInt avoids the predictable Math.random()
  // generator previously used by the browser-only implementation.
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }

  return characters.join("");
}

export function validateTemporaryPassword(password: unknown): string | null {
  if (typeof password !== "string") return "Temporary password must be a string.";
  if (password.length < TEMPORARY_PASSWORD_MIN_LENGTH) {
    return `Temporary password must be at least ${TEMPORARY_PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > TEMPORARY_PASSWORD_MAX_LENGTH) {
    return `Temporary password must be at most ${TEMPORARY_PASSWORD_MAX_LENGTH} characters.`;
  }
  if (!/[A-Z]/.test(password)) return "Temporary password must contain an uppercase letter.";
  if (!/[a-z]/.test(password)) return "Temporary password must contain a lowercase letter.";
  if (!/[0-9]/.test(password)) return "Temporary password must contain a number.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Temporary password must contain a symbol.";
  return null;
}
