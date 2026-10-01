import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr';
export function createAuthFactory(config, secure) {
  return ((req, res) => createServerClient(config.url, config.publishable, {
    cookieOptions: { httpOnly: true, secure, sameSite: 'lax', path: '/' },
    cookies: {
      getAll: () => parseCookieHeader(req.headers.cookie ?? ''),
      setAll: (cookies, headers = {}) => {
        for (const { name, value, options } of cookies) res.append('Set-Cookie', serializeCookieHeader(name, value, { ...options, httpOnly: true, secure, sameSite: 'lax', path: '/' }));
        for (const [key, value] of Object.entries(headers)) res.set(key, value);
      },
    },
  }));
}
