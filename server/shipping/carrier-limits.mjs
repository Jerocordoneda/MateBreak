// Public admission reference, independent of MateBreak packing profiles and API safety bounds.
// https://www.correoargentino.com.ar/MiCorreo/public/faqs (consulted 2026-10-01)
export const MICORREO_ADMISSION_LIMITS = Object.freeze({weight:50000,maxSide:200,maxSideSum:300});
export function withinAdmissionLimits(parcel) {
 const {weight,length,width,height}=parcel||{};
 return [weight,length,width,height].every(n=>Number.isInteger(n)&&n>0) &&
  weight<=MICORREO_ADMISSION_LIMITS.weight && Math.max(length,width,height)<=MICORREO_ADMISSION_LIMITS.maxSide &&
  length+width+height<=MICORREO_ADMISSION_LIMITS.maxSideSum;
}
