import{c as r}from"./index-Bwd7tdzF.js";/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const p=[["path",{d:"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",key:"1rqfz7"}],["path",{d:"M14 2v4a2 2 0 0 0 2 2h4",key:"tnqrlb"}],["path",{d:"M12 18v-6",key:"17g6i2"}],["path",{d:"m9 15 3 3 3-3",key:"1npd3o"}]],h=r("FileDown",p);function d(e,i,o,t,l,a=5,n=280){const s=e.splitTextToSize(String(i??"—"),l);for(const c of s)t>n&&(e.addPage(),t=20),e.text(c,o,t),t+=a;return t}function g(e,i,o,t,l){const a=e.splitTextToSize(String(i??"—"),l);let n=a[0]||"—";a.length>1&&n.length>1&&(n=n.slice(0,-1)+"…"),e.text(n,o,t)}export{h as F,g as c,d as t};
