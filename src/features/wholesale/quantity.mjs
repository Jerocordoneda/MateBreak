// Empty means zero; reject fractional, exponent and out-of-range quantities.
export function quantity(value) {
 if(value==='')return 0;
 if(!/^\d+$/.test(value))return null;
 const amount=Number(value);
 return Number.isSafeInteger(amount)&&amount<=1000?amount:null;
}
