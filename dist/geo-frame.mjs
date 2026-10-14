// Source/simulation coordinates stay unchanged: east/north around the recorded
// origin, using 111320*cos(latitude) and 111320 metres/degree. Rendering uses
// east/up/south with local WGS84 ellipsoid scale, not mirrored north-positive z.
export function createGeoFrame(latitude){
  const phi=latitude*Math.PI/180,a=6378137,e2=6.6943799901413165e-3;
  const w=Math.sqrt(1-e2*Math.sin(phi)**2),prime=a/w,meridian=a*(1-e2)/w**3;
  const eastScale=prime*Math.PI/180/111320,northScale=meridian*Math.PI/180/111320;
  return {eastScale,northScale,worldPoint:(east,north,height=0)=>[east*eastScale,height,-north*northScale]};
}
export const rightSide=(dx,dn,heading)=>dx*Math.sin(heading)-dn*Math.cos(heading);
