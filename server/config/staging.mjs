// Shared staging boundary: evaluated before client creation or any network call.
export const PROTECTED_PRODUCTION_REF = 'nwpdfqwqxrkokluqqqfs';
export function assertStagingConfig(config) {
  if (!config.staging && !config.stagingPersistMock) return;
  const ref = config.stagingProjectRef;
  if (!config.staging || !config.stagingPersistMock || config.production || !/^[a-z]{20}$/.test(ref || '') || ref === PROTECTED_PRODUCTION_REF)
    throw Error('Staging requires a separate approved Supabase project reference');
  if (config.url !== `https://${ref}.supabase.co` || new URL(config.origin).protocol !== 'https:' ||
      new URL(config.origin).origin !== config.origin || config.origin === config.url)
    throw Error('Staging requires the exact Supabase staging URL and a separate HTTPS frontend origin');
  if (config.shippingMode !== 'mock' || config.paymentsMode !== 'mock' || config.localPersistMock || config.localPickupMock)
    throw Error('Staging requires mock providers and no localhost-only flags');
  if (config.mercadoPago?.accessToken || config.mercadoPago?.webhookSecret || config.correo?.username ||
      config.correo?.password || config.correo?.customerId)
    throw Error('Real provider credentials are forbidden in staging');
}
export const persistedMock = config => Boolean(config.localPersistMock || config.stagingPersistMock);
