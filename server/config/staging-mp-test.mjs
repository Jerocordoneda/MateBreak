// Account identity is configured explicitly, never derived from credential contents.
export const STAGING_MP_TEST_SELLER = '3741487042';
// Configuration permits verification only. It never certifies remote identity.
export function stagingMpTestAllowed(config) {
 const mp=config.mercadoPago;
 return config.staging===true && config.stagingMpTestEnabled===true && !config.production &&
  !config.stagingPersistMock && !config.localPersistMock && !config.localPickupMock &&
  config.shippingMode==='mock' && config.paymentsMode==='real' &&
  mp?.environment==='test' && typeof mp.expectedLiveMode==='boolean' &&
  typeof mp.accessToken==='string' && /^(TEST-|APP_USR-).+/.test(mp.accessToken) &&
  typeof mp.webhookSecret==='string' && mp.webhookSecret.length>0 &&
  String(mp.collectorId)===STAGING_MP_TEST_SELLER;
}
