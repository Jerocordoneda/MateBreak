export const publicCsp="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'";
export function publicCspFor({production,url}) {
 if(!production&&url){try{const u=new URL(url);if(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname))return publicCsp.replace("img-src 'self' data: https:;", "img-src 'self' data: https: "+u.origin+';');}catch{}}
 return publicCsp;
}
