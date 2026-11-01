import test from "node:test";
import assert from "node:assert/strict";
import { MapBillboards } from "../app/js/map/MapBillboards.js";

test("héros local et distant utilisent un calque distinct des illustrations du monde", () => {
  const previousL = globalThis.L, previousDocument = globalThis.document;
  const element = () => ({ style: { setProperty() {} }, children: [], classList: {toggle() {}}, append(child) { child.parent = this; this.children.push(child); }, querySelectorAll: () => [], setAttribute() {}, addEventListener() {}, remove() { this.removed = true; } });
  const container = element(), simple = {};
  globalThis.document = {createElement: element};
  globalThis.L = {CRS:{Simple:simple}, DomUtil:{create(type, className, parent) { const node=element(); node.className=className; parent.append(node); return node; }}};
  const map = {getContainer:()=>container,on() {},off() {},getSize:()=>({x:800,y:600}),getZoom:()=>1.5,options:{crs:simple},latLngToContainerPoint:p=>p};
  const marker = point => ({getLatLng:()=>point,getElement:()=>null});
  const renderer = new MapBillboards(map);
  try {
    renderer.set("local",{kind:"hero",marker:marker({x:400,y:100}),html:"hero"});
    renderer.set("remote",{kind:"hero",remote:true,marker:marker({x:400,y:200}),html:"remote"});
    renderer.set("group",{kind:"group",marker:marker({x:400,y:550}),html:"group"});
    assert.equal(renderer.entries.get("local").element.parent,renderer.heroesRoot);
    assert.equal(renderer.entries.get("remote").element.parent,renderer.heroesRoot);
    assert.equal(renderer.entries.get("group").element.parent,renderer.root);
    assert.ok(!renderer.entries.get("remote").element.className.includes("rpg-hero-marker-host"));
  } finally { renderer.dispose(); globalThis.L=previousL; globalThis.document=previousDocument; }
});

test("les héros distants conservent leurs coordonnées courantes dans le calque et disparaissent avec la visibilité", async () => {
  const { AlliedHeroRenderer }=await import("../app/js/map/AlliedHeroRenderer.js");
  const previousL=globalThis.L, previousDocument=globalThis.document;
  globalThis.document={createElement:()=>({set textContent(value){this.innerHTML=value;}})};
  globalThis.L={divIcon:options=>({options}),marker:(position,options)=>({position,options,addTo(){return this;},bindTooltip(){return this;},on(){return this;},getElement:()=>null,setLatLng(p){this.position=p;return this;},setIcon(){return this;},setTooltipContent(){return this;},remove(){}})};
  const seen=[], removed=[];
  const renderer=new AlliedHeroRenderer({}, {billboards:{set(id,entry){seen.push({id,position:[...entry.marker.position],kind:entry.kind});},remove:id=>removed.push(id)}});
  const ally={playerId:"other",name:"Mage",heroClassId:"mage",teamColor:"green",connected:true,position:{latitude:1,longitude:2}};
  try {
    renderer.render([ally]);
    renderer.render([{...ally,position:{latitude:3,longitude:4}}]);
    assert.deepEqual(seen.map(item=>item.position),[[1,2],[3,4]]);
    assert.equal(seen[0].kind,"hero");
    renderer.render([]);
    assert.deepEqual(removed,["remote-hero:other"]);
  } finally {globalThis.L=previousL;globalThis.document=previousDocument;}
});
