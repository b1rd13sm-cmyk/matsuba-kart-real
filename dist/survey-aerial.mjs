import {project} from './survey-core.mjs';
import {createGeoFrame} from './geo-frame.mjs';
const lon=x=>x/2**18*360-180,lat=y=>Math.atan(Math.sinh(Math.PI*(1-2*y/2**18)))*180/Math.PI;
// Native GSI tiles only. No Street View, proxying, Google images or image
// scraping. The processed reference stays in this developer's IndexedDB.
export async function aerialReference(origin,camera,coordinate){
 const z=18,tx=Math.floor((coordinate.lon+180)/360*2**z),ty=Math.floor((1-Math.asinh(Math.tan(coordinate.lat*Math.PI/180))/Math.PI)/2*2**z);
 const canvas=document.createElement('canvas');canvas.width=canvas.height=768;const ctx=canvas.getContext('2d'),sources=[];
 for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++){
  const url=`https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/${z}/${tx+x}/${ty+y}.jpg`,response=await fetch(url);if(!response.ok)throw Error('国土地理院の航空写真を取得できません: '+response.status);const bitmap=await createImageBitmap(await response.blob());ctx.drawImage(bitmap,(x+1)*256,(y+1)*256);bitmap.close();sources.push(url);
 }
 const north=lat(ty-1),south=lat(ty+2),longitude=lon(tx+.5),latitude=(north+south)/2,[x,y]=project(origin,latitude,longitude),frame=createGeoFrame(origin.lat),span=(north-south)*111320*frame.northScale;
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('航空写真を書き出せません');
 return {blob,camera:{...camera,x,y,height:180,heading:0,pitch:-90,fov:60,projection:'orthographic',spanMeters:span},reference:{source:'https://maps.gsi.go.jp/#18/'+coordinate.lat+'/'+coordinate.lon+'/&base=seamlessphoto',provider:'国土地理院 seamlessphoto を加工',terms:'https://maps.gsi.go.jp/help/termsofuse.html',type:'aerial',date:null,captureDateVerified:false,photoStoredLocally:true,tileUrls:sources,note:'出典：国土地理院。PDL1.0。北向き・正射投影で比較。撮影日不明／モザイクの時期差・航空写真の屋根視差は未補正。地上写真・外壁色・実測高さの照合には使用しない。'}};
}
