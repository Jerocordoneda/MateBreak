// Bounded, PII-free signal for the operator. No notification transport or timer.
export function workerAlert(s) {
 return s.email_review>0||s.payment_review>0||s.financial_holds>0||s.email_receipt_alerts>0
  ||s.email_pending>100||s.payment_pending>100
  ||s.email_oldest_seconds>3600||s.payment_oldest_seconds>3600;
}
