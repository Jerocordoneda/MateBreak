import {parseCookieHeader} from '@supabase/ssr';
export function directCartToken(req, origin) {
  const name=origin.startsWith('https:')?'__Host-mb_direct':'mb_direct';
  return parseCookieHeader(req.headers.cookie || '').find(c=>c.name===name)?.value;
}
export function selectionToken(req,origin) {
  return req.query.directa==='1'||req.body?.directa===true ? directCartToken(req,origin) : req.cartToken;
}
export const validCartToken=token=>typeof token==='string'&&/^[a-f0-9]{64}$/.test(token);
