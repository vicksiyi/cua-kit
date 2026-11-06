import test from "node:test";
import assert from "node:assert/strict";
import { createBrowserDirectoryClass } from "../packages/browser/src/service/runtime/browser_directory";
import { originalServiceBindings, serviceClassMethod, serviceClassWithMethods } from "./service-source";

// Evaluate only inspected pure selectors + three methods, never the service bootstrap.
const selectors=originalServiceBindings(["_b","Sb","j6","KM","W6","cs","vb","oce","H6"]);
const sourceClass=serviceClassWithMethods(["getBrowsers","getDefault","getForUrl","getDotBrowser","refresh"]);
const restored=createBrowserDirectoryClass({} as any).prototype;
for(const [method,args,message] of [
  ["get",["chrome"],"Browser is not available: chrome"],
  ["getDefault",[],"No browser is available"],
  ["getForUrl",["https://example.invalid/"],"No browser is available"],
  ["getForUrl",["http://localhost/"],"No browser is available"],
] as const) {
  test(`installed and restored ${method} reject an empty inventory without launching a backend: ${args.join()}`,async()=>{
    const original=new Function(...Object.keys(selectors),`return ({${serviceClassMethod(sourceClass,method)}}).${method};`)(...Object.values(selectors));
    for(const implementation of [original,(restored as any)[method]]){
      const trace:string[]=[];
      const receiver=new Proxy({getBrowsers:async()=>{trace.push("inventory");return [];},browserPreference:null},{
        get(target,key){
          if(key in target)return Reflect.get(target,key);
          throw Error(`Unexpected operation ${String(key)}`);
        },
      });
      await assert.rejects(implementation.apply(receiver,args),error=>error instanceof Error && error.message===message);
      assert.deepEqual(trace,["inventory"]);
    }
  });
}
