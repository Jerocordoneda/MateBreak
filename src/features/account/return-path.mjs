// Exact symbolic destinations: never interpret browser input as a URL.
const destinations=new Map([['mayorista','/mayorista'],['carrito','/carrito']]);
export const returnPath=value=>destinations.get(value)??null;
export const returnQuery=value=>returnPath(value)?'?volver='+value:'';
