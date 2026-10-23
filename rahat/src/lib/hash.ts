// SHA-256 of a dispatch's handover code. Carriers hold only the hash, so the
// code itself is not readable on their phones. Needs a secure context (HTTPS or localhost).
export async function codeHash(dispatchId: string, code: string): Promise<string> {
  const data = new TextEncoder().encode(`${dispatchId}:${code}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function newCode(): string {
  return String(1000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 9000));
}
