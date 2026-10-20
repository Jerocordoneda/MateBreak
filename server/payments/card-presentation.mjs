// Only allowlisted non-sensitive presentation fields from the authenticated
// provider response. Never persist the card object, PAN, CVV or arbitrary data.
const brands=new Set(['visa','master','mastercard','amex']);
export function safeCardPresentation(payment){
 if(payment?.payment_type_id!=='credit_card'&&payment?.payment_type_id!=='debit_card')return null;
 const brand=payment.payment_method_id,last4=payment.card?.last_four_digits;
 return brands.has(brand)&&typeof last4==='string'&&/^\d{4}$/.test(last4)?{brand,last4}:null;
}
