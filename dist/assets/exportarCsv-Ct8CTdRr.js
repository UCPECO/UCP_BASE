import{c as i}from"./index-Bg0s9xY6.js";/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const l=[["path",{d:"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",key:"1rqfz7"}],["path",{d:"M14 2v4a2 2 0 0 0 2 2h4",key:"tnqrlb"}],["path",{d:"M8 13h2",key:"yr2amv"}],["path",{d:"M14 13h2",key:"un5t4a"}],["path",{d:"M8 17h2",key:"2yhykz"}],["path",{d:"M14 17h2",key:"10kma7"}]],y=i("FileSpreadsheet",l);function v(e,n,c){const r=a=>{const t=String(a??"");return/[";\n\r]/.test(t)?`"${t.replace(/"/g,'""')}"`:t},d=n.map(a=>r(a.titulo)).join(";"),p=c.map(a=>n.map(t=>r(typeof t.valor=="function"?t.valor(a):a[t.clave])).join(";")),h=new Blob(["\uFEFF"+[d,...p].join(`\r
`)],{type:"text/csv;charset=utf-8"}),s=URL.createObjectURL(h),o=document.createElement("a");o.href=s,o.download=e.endsWith(".csv")?e:`${e}.csv`,document.body.appendChild(o),o.click(),o.remove(),setTimeout(()=>URL.revokeObjectURL(s),1e3)}function k(){const e=new Date,n=c=>String(c).padStart(2,"0");return`${e.getFullYear()}-${n(e.getMonth()+1)}-${n(e.getDate())}`}export{y as F,v as d,k as f};
