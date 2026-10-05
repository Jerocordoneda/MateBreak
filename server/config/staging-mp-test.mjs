// Account identity is configured explicitly, never derived from credential contents.
export function stagingMpTestAllowed(config) {
 const mp=config.mercadoPago;
 return config.staging===true && config.stagingMpTestEnabled===true && !config.production &&
  !config.stagingPersistMock && !config.localPersistMock && !config.localPickupMock &&
  config.shippingMode==='mock' && config.paymentsMode==='real' &&
  mp?.environment==='test' && mp.expectedLiveMode===false &&
  typeof mp.accessToken==='string' && mp.accessToken.startsWith('TEST-') &&
  typeof mp.webhookSecret==='string' && mp.webhookSecret.length>0 &&
  /^\d{1,30}$/.test(String(mp.collectorId||''));
}
