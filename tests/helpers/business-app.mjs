// Legacy business unit tests isolate authorization/rate infrastructure. Their
// original business assertions remain intact; live-session/SQL quota behavior
// is covered separately, including real local Auth and direct RLS tests.
import {createApp as realCreateApp} from '../../server/app.mjs';
export {hashToken} from '../../server/app.mjs';
export function createApp(config,overrides={}){
 return realCreateApp(config,{verifyLiveSession:async()=>true,rateStore:{take:async()=>({allowed:true})},...overrides});
}
