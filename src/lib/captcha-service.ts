import 'server-only';
import { randomBytes } from 'crypto';

const CAPTCHA_TTL_MS = 5 * 60 * 1000;
const CAPTCHA_LENGTH = 6;
const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const challenges = new Map<string, { answer: string; expiresAt: number }>();

function createAnswer(): string {
  const bytes = randomBytes(CAPTCHA_LENGTH);
  return Array.from(bytes, (byte) => characters[byte % characters.length]).join('');
}

function createImage(answer: string): string {
  const text = answer.split('').map((character, index) => `<text x="${18 + index * 27}" y="34" transform="rotate(${index % 2 === 0 ? -8 : 8} ${18 + index * 27} 34)">${character}</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="190" height="52" role="img" aria-label="CAPTCHA"><rect width="100%" height="100%" fill="#e7f2fc"/><path d="M0 38 L190 13 M0 15 L190 42" stroke="#839fba" stroke-width="1"/>${text}<style>text{font:700 27px sans-serif;fill:#1c2230}</style></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export function issueCaptcha(): { id: string; image: string } {
  const id = randomBytes(24).toString('base64url');
  challenges.set(id, { answer: createAnswer(), expiresAt: Date.now() + CAPTCHA_TTL_MS });
  return { id, image: createImage(challenges.get(id)!.answer) };
}

export function verifyCaptcha(id: string, answer: string): boolean {
  const challenge = challenges.get(id);
  challenges.delete(id);
  return Boolean(challenge && challenge.expiresAt > Date.now() && challenge.answer === answer);
}
