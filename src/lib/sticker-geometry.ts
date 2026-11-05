import * as T from 'three';
/** Thin rounded vinyl sheet ; actual front/back and edge geometry. */
export function buildStickerGeometry() {
 const shape=new T.Shape();const r=.025,x=.15,y=.18;
 shape.moveTo(-x+r,-y);shape.lineTo(x-r,-y);shape.quadraticCurveTo(x,-y,x,-y+r);shape.lineTo(x,y-r);shape.quadraticCurveTo(x,y,x-r,y);shape.lineTo(-x+r,y);shape.quadraticCurveTo(-x,y,-x,y-r);shape.lineTo(-x,-y+r);shape.quadraticCurveTo(-x,-y,-x+r,-y);
 const sheet=new T.ExtrudeGeometry(shape,{depth:.0015,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.0005,bevelThickness:.0003,curveSegments:12});
 const print=new T.PlaneGeometry(.276,.336,24,32);print.translate(0,0,.0022);
 return {sheet,print};
}
