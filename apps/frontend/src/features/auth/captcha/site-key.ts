/** Sitekey pública (DEC-09); el secreto nunca llega al navegador. `null` si falta: el desafío no se puede resolver. */
export function getCaptchaSiteKey(): string | null {
  const value: unknown = import.meta.env.VITE_CAPTCHA_SITE_KEY;
  return typeof value === 'string' && value !== '' ? value : null;
}
