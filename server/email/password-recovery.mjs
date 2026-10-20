// Actions registered by server/auth/recovery.mjs with explicit opt-in. Auth
// emails remain owned by Supabase SMTP; no alternative registration channel.
const fail=(status,message)=>Object.assign(Error(message),{status});
export async function requestPasswordRecovery({auth,email,origin,enabled=false,allowLocal=false,onProviderOutcome=()=>{}}) {
 if(!enabled)throw fail(503,'Recuperación de contraseña no habilitada');
 const u=new URL(origin);if((u.protocol!=='https:'&&!(allowLocal&&u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)))||u.origin!==origin||u.username||u.password)throw fail(400,'Origen inválido');
 if(typeof email!=='string'||email.length>254||! /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email.trim()))throw fail(400,'Indicá un email válido');
 // The future callback is exact and requires independent allowlist approval.
 let accepted=false;try{const result=await auth.auth.resetPasswordForEmail(email.trim().toLowerCase(),{redirectTo:origin+'/auth/recuperar'});accepted=!result.error;}catch{}
 // Same customer response whether the account exists or the provider declines.
 // Supervisor must monitor provider error counts without recipient/body logs.
 onProviderOutcome({accepted});
 return {mensaje:'Si corresponde, recibirás un enlace para recuperar tu contraseña.'};
}
export async function completePasswordRecovery({auth,password,verifyLiveSession,enabled=false}) {
 if(!enabled)throw fail(503,'Recuperación de contraseña no habilitada');
 if(typeof password!=='string'||password.length<10||password.length>128)throw fail(400,'Usá entre 10 y 128 caracteres');
 if(typeof verifyLiveSession!=='function')throw fail(503,'Control de sesión requerido');
 const verified=await auth.auth.getUser();if(verified.error||!verified.data?.user||verified.data.user.is_anonymous)throw fail(401,'Sesión inválida');
 if(await verifyLiveSession(verified.data.user,auth)!==true)throw fail(401,'Sesión vencida');
 const result=await auth.auth.updateUser({password});if(result.error)throw fail(400,'No se pudo cambiar la contraseña');
 return {ok:true};
}
