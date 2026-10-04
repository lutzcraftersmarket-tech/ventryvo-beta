
const $=id=>document.getElementById(id);
const extra={
 drafts:[],apps:[],bookings:[],invoices:[],payments:[],credits:[],redemptions:[],
 communications:[],outbox:[],rsvps:[],categories:[],spaceTypes:[],allEvents:[]
};
let busy=false,requeue=false;

function core(){return window.VENTRYVO_CORE||null}
function S(){return core()?.state}
function sb(){return core()?.sb}
function esc(v){return core()?.esc(v)??String(v??"")}
function money(v){return core()?.money(v)??("$"+Number(v||0).toFixed(2))}
function toast(v){core()?.toast(v)}
function canManage(){return !!core()?.canManage()}
function canAdmin(){return !!core()?.canAdmin()}
function chip(status){const s=String(status||"unknown");return '<span class="chip status-'+esc(s.replace(/[^a-z0-9_]+/gi,"_").toLowerCase())+'">'+esc(s.replaceAll("_"," "))+'</span>'}
function eventName(id){return extra.allEvents.find(x=>x.id===id)?.name||S()?.events.find(x=>x.id===id)?.name||"Event"}
function vendor(id){return S()?.vendors.find(x=>x.id===id)}
function vendorName(id){return vendor(id)?.business_name||vendor(id)?.contact_name||"Vendor"}
function space(id){return extra.spaceTypes.find(x=>x.id===id)||S()?.spaceTypes.find(x=>x.id===id)}
function category(id){return extra.categories.find(x=>x.id===id)}
function fmt(v){return v?new Date(v).toLocaleString():""}
function date(v){return v?new Date(v).toLocaleDateString():""}
function activeBookings(eventId){return extra.bookings.filter(b=>b.event_id===eventId&&b.status!=="cancelled")}
function rsvpUrl(e){return location.origin+"/rsvp/"+encodeURIComponent(S().org.slug)+"/"+encodeURIComponent(e.public_slug||"")}
function payUrl(inv){return location.origin+"/pay/"+encodeURIComponent(inv.public_token)}

async function edge(name,body){
 const {data,error}=await sb().functions.invoke(name,{body});
 if(error)throw error;if(data?.error)throw new Error(data.error);return data;
}
async function op(action,body={}){return edge("event-operations-api",{organization_id:S().org.id,action,...body})}
function fail(e){console.error(e);toast(e?.message||String(e)||"Something went wrong.")}

function dialog(title,bodyHtml){
 let d=$("parityDialog");
 if(!d){d=document.createElement("dialog");d.id="parityDialog";d.className="dialog-backdrop";document.body.appendChild(d)}
 d.innerHTML='<div class="dialog-body"><div class="dialog-head"><div><div class="kicker">VENTRYVO</div><h2 style="margin-top:4px">'+esc(title)+'</h2></div><button type="button" class="secondary" data-close-dialog>Close</button></div><div id="parityDialogContent">'+bodyHtml+'</div></div>';
 d.querySelector("[data-close-dialog]").onclick=()=>d.close();
 d.showModal();return d;
}

async function loadExtra(){
 if(!S()?.org?.id||busy)return;
 busy=true;
 try{
  const org=S().org.id;
  const r=await Promise.all([
   sb().from("application_drafts").select("*").eq("organization_id",org).order("last_activity_at",{ascending:false}),
   sb().from("event_applications").select("*").eq("organization_id",org).order("submitted_at",{ascending:false}),
   sb().from("bookings").select("*").eq("organization_id",org).order("created_at",{ascending:false}),
   sb().from("invoices").select("*").eq("organization_id",org).order("created_at",{ascending:false}),
   sb().from("payments").select("*").eq("organization_id",org).order("received_at",{ascending:false}),
   sb().from("vendor_credits").select("*").eq("organization_id",org).order("created_at",{ascending:false}),
   sb().from("vendor_credit_redemptions").select("*").eq("organization_id",org).order("created_at",{ascending:false}),
   sb().from("communications").select("*").eq("organization_id",org).order("created_at",{ascending:false}).limit(100),
   sb().from("email_outbox").select("*").eq("organization_id",org).order("created_at",{ascending:false}).limit(100),
   sb().from("shopper_rsvps").select("*").eq("organization_id",org).order("created_at",{ascending:false}),
   sb().from("event_categories").select("*").eq("organization_id",org).order("name"),
   sb().from("event_space_types").select("*").eq("organization_id",org).order("sort_order"),
   sb().from("events").select("*").eq("organization_id",org).order("starts_at",{ascending:true})
  ]);
  for(const x of r)if(x.error)throw x.error;
  [extra.drafts,extra.apps,extra.bookings,extra.invoices,extra.payments,extra.credits,extra.redemptions,extra.communications,extra.outbox,extra.rsvps,extra.categories,extra.spaceTypes,extra.allEvents]=r.map(x=>x.data||[]);
  renderAll();
 }catch(e){fail(e)}
 finally{busy=false;if(requeue){requeue=false;setTimeout(loadExtra,80)}}
}
async function refresh(){
 if(core()?.loadWorkspace){await core().loadWorkspace();setTimeout(loadExtra,180)}
 else loadExtra();
}
function renderAll(){
 renderApplications();renderBookings();renderBilling();renderEventDay();renderCommunications();renderShoppers();renderFloorPlan();
 augmentVendors();augmentReports();augmentEvents();
}

/* APPLICATIONS + RECOVERY */
function renderApplications(){
 const panel=$("applicationsPanel");if(!panel)return;
 const view=panel.dataset.parityView||"queue",status=panel.dataset.status||"all",eventId=panel.dataset.event||"all";
 let html='<section class="panel"><div class="itemtop"><div><div class="kicker">Application management</div><h2>Vendor Applications</h2><p class="muted">Review applications, manage wait-list and cancelled records, and recover abandoned submissions.</p></div></div><div class="parity-tabs"><button data-app-view="queue" class="'+(view==="queue"?"active":"")+'">Application Queue</button><button data-app-view="recovery" class="'+(view==="recovery"?"active":"")+'">Application Recovery ('+recoveryRows().length+')</button></div>';
 if(view==="recovery")html+=recoveryHtml();else html+=queueHtml(status,eventId);
 html+='</section>';panel.innerHTML=html;
 panel.querySelectorAll("[data-app-view]").forEach(b=>b.onclick=()=>{panel.dataset.parityView=b.dataset.appView;renderApplications()});
 if(view==="recovery")wireRecovery(panel);else wireQueue(panel);
}
function recoveryRows(){
 const cutoff=Date.now()-10*60*1000;
 return extra.drafts.filter(d=>d.status!=="submitted"&&new Date(d.expires_at).getTime()>Date.now()&&(d.status==="abandoned"||new Date(d.last_activity_at).getTime()<cutoff));
}
function queueHtml(status,eventId){
 const rows=extra.apps.filter(a=>(status==="all"||a.status===status)&&(eventId==="all"||a.event_id===eventId));
 let h='<div class="vendor-toolbar"><div class="field"><label>Status</label><select id="pxAppStatus"><option value="all">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="waitlist">Wait list</option><option value="declined">Declined</option><option value="cancelled">Cancelled</option></select></div><div class="field"><label>Event</label><select id="pxAppEvent"><option value="all">All events</option>'+extra.allEvents.filter(e=>!e.archived_at).map(e=>'<option value="'+e.id+'">'+esc(e.name)+'</option>').join("")+'</select></div></div>';
 if(!rows.length)return h+'<div class="empty">No applications match this view.</div>';
 return h+'<div class="list">'+rows.map(a=>{
  const v=vendor(a.vendor_id),d=a.application_data||{},review=d.category_review||{},warning=review.needsReview||review.likelyMismatch||review.unverifiedSelection;
  return '<article class="item '+(warning?'attention':'')+'"><div class="itemtop"><div><b>'+esc(v?.business_name||"Unknown vendor")+'</b><div class="muted">'+esc(eventName(a.event_id))+' • '+esc(space(a.space_type_id)?.name||a.requested_space||"")+' • '+esc(category(a.event_category_id)?.name||a.category||"")+'</div><small class="muted">Submitted '+esc(fmt(a.submitted_at))+'</small></div>'+chip(a.status)+'</div>'
   +'<p><b>What they sell:</b> '+esc(d.what_they_sell||v?.what_they_sell||"Not provided")+'</p>'
   +(d.special_requests?'<div class="notice"><b>Special request / setup note</b><br>'+esc(d.special_requests)+'</div>':'')
   +(warning?'<div class="redflag"><b>Category review recommended.</b><br>'+esc(review.message||("Description may overlap: "+(review.matched||[]).join(", ")))+'</div>':'')
   +(d.approved_products?'<p><b>Approved to sell:</b> '+esc(d.approved_products)+'<br><b>Not approved:</b> '+esc(d.declined_products||"None")+'</p>':'')
   +(d.waitlist_reason?'<div class="notice warn"><b>Wait-list:</b> '+esc(d.waitlist_reason)+'</div>':'')
   +(d.decline_reason?'<div class="notice warn"><b>Decline reason:</b> '+esc(d.decline_reason)+'</div>':'')
   +(canManage()&&["pending","waitlist","declined"].includes(a.status)?'<div class="actions"><button class="primary" data-review="approved" data-id="'+a.id+'">Approve</button><button class="secondary" data-review="waitlist" data-id="'+a.id+'">Wait List</button><button class="danger" data-review="declined" data-id="'+a.id+'">Decline</button></div>':'')
   +'</article>';
 }).join("")+'</div>';
}
function wireQueue(panel){
 const s=$("pxAppStatus"),e=$("pxAppEvent");if(s){s.value=panel.dataset.status||"all";s.onchange=()=>{panel.dataset.status=s.value;renderApplications()}}if(e){e.value=panel.dataset.event||"all";e.onchange=()=>{panel.dataset.event=e.value;renderApplications()}}
 panel.querySelectorAll("[data-review]").forEach(b=>b.onclick=()=>reviewApp(b.dataset.id,b.dataset.review).catch(fail));
}
async function reviewApp(id,decision){
 const a=extra.apps.find(x=>x.id===id),d={...(a?.application_data||{})};
 let reason="";
 if(decision==="approved"){
  const approved=prompt("Confirm or edit what this vendor is approved to sell:",d.approved_products||d.what_they_sell||vendor(a.vendor_id)?.what_they_sell||"");if(approved===null)return;
  if(!approved.trim())throw new Error("Enter what the vendor is approved to sell.");
  const excluded=prompt("Anything NOT approved? Leave blank if none:",d.declined_products||"");if(excluded===null)return;
  d.approved_products=approved.trim();d.declined_products=excluded.trim();d.category_review_approved_at=new Date().toISOString();
  const r=await sb().from("event_applications").update({application_data:d,updated_at:new Date().toISOString()}).eq("id",id);if(r.error)throw r.error;
 }else reason=prompt(decision==="waitlist"?"Reason for wait list (optional):":"Reason for declining:","")||"";
 await edge("application-review-api",{organization_id:S().org.id,application_id:id,decision,reason});await refresh();toast(decision==="approved"?"Application approved.":decision==="waitlist"?"Moved to wait list.":"Application declined.");
}
function recoveryHtml(){
 const rows=recoveryRows();
 if(!rows.length)return '<div class="notice success">No abandoned or stalled applications need attention.</div>';
 return '<div class="list">'+rows.map(d=>{const e=extra.allEvents.find(x=>x.id===d.event_id),sent=d.draft_data?.recovery_email_sent_at;return '<article class="item attention"><div class="itemtop"><div><b>'+esc(d.business_name||d.contact_name||d.email||"Unknown applicant")+'</b><div class="muted">'+esc(e?.name||"Event")+' • '+esc(d.email||"No email")+'</div><small class="muted">Last activity '+esc(fmt(d.last_activity_at))+' • Step: '+esc(d.last_step||"unknown")+'</small></div>'+chip(d.status)+'</div>'+(d.error_message?'<div class="notice warn">'+esc(d.error_message)+'</div>':'')+(sent?'<p class="muted">Recovery email sent '+esc(fmt(sent))+'</p>':'')+'<div class="actions"><button class="primary" data-recover-email="'+d.id+'" '+(!d.email?'disabled':'')+'>Send Recovery Email</button><button class="secondary" data-copy-recover="'+d.id+'">Copy Recovery Link</button><button class="danger" data-abandon="'+d.id+'">Mark Abandoned</button></div></article>'}).join("")+'</div>';
}
function recoveryLink(d){const e=extra.allEvents.find(x=>x.id===d.event_id);return e?.public_slug?location.origin+"/apply/"+encodeURIComponent(S().org.slug)+"/"+encodeURIComponent(e.public_slug)+"?recover="+encodeURIComponent(d.recovery_token):""}
function wireRecovery(panel){
 panel.querySelectorAll("[data-recover-email]").forEach(b=>b.onclick=async()=>{try{b.disabled=true;await op("send_recovery_email",{draft_id:b.dataset.recoverEmail});await loadExtra();toast("Recovery email sent.")}catch(e){fail(e);b.disabled=false}});
 panel.querySelectorAll("[data-copy-recover]").forEach(b=>b.onclick=async()=>{const d=extra.drafts.find(x=>x.id===b.dataset.copyRecover),u=recoveryLink(d);if(!u)return toast("Publish the event application first.");await navigator.clipboard.writeText(u);toast("Recovery link copied.")});
 panel.querySelectorAll("[data-abandon]").forEach(b=>b.onclick=async()=>{const r=await sb().from("application_drafts").update({status:"abandoned",last_activity_at:new Date().toISOString()}).eq("id",b.dataset.abandon);if(r.error)return fail(r.error);await loadExtra();toast("Application marked abandoned.")});
}

/* BOOKINGS, MANUAL BOOKING, RESCHEDULE, CREDITS */
function renderBookings(){
 const panel=$("bookingsPanel");if(!panel)return;
 const ev=panel.dataset.event||"all",status=panel.dataset.status||"active";
 const rows=extra.bookings.filter(b=>(ev==="all"||b.event_id===ev)&&(status==="all"||(status==="active"?b.status!=="cancelled":b.status===status)));
 let html='<section class="panel"><div class="itemtop"><div><div class="kicker">Vendor bookings</div><h2>Bookings & Vendor Credits</h2><p class="muted">Manual bookings, rescheduling, confirmations, cancellations, credits and booth assignments.</p></div><button id="pxManualToggle" class="primary">Manual Booking</button></div><div id="pxManualArea" class="hidden"></div>';
 html+='<div class="vendor-toolbar"><div class="field"><label>Event</label><select id="pxBookingEvent"><option value="all">All events</option>'+extra.allEvents.filter(e=>!e.archived_at).map(e=>'<option value="'+e.id+'">'+esc(e.name)+'</option>').join("")+'</select></div><div class="field"><label>Status</label><select id="pxBookingStatus"><option value="active">Active bookings</option><option value="all">All bookings</option><option value="reserved">Reserved / unpaid</option><option value="confirmed">Confirmed</option><option value="completed">Completed</option><option value="no_show">No show</option><option value="cancelled">Cancelled</option></select></div></div>';
 if(!rows.length)html+='<div class="empty">No bookings match this view.</div>';else html+='<div class="list">'+rows.map(b=>bookingCard(b)).join("")+'</div>';
 html+=creditsHtml()+'</section>';panel.innerHTML=html;
 $("pxBookingEvent").value=ev;$("pxBookingStatus").value=status;$("pxBookingEvent").onchange=function(){panel.dataset.event=this.value;renderBookings()};$("pxBookingStatus").onchange=function(){panel.dataset.status=this.value;renderBookings()};
 $("pxManualToggle").onclick=()=>{const x=$("pxManualArea");x.classList.toggle("hidden");if(!x.classList.contains("hidden"))renderManualForm()};
 panel.querySelectorAll("[data-booth]").forEach(b=>b.onclick=()=>assignBooth(b.dataset.booth).catch(fail));
 panel.querySelectorAll("[data-reschedule]").forEach(b=>b.onclick=()=>rescheduleDialog(b.dataset.reschedule));
 panel.querySelectorAll("[data-confirm-booking]").forEach(b=>b.onclick=()=>op("send_confirmation",{booking_id:b.dataset.confirmBooking}).then(()=>loadExtra()).then(()=>toast("Confirmation sent.")).catch(fail));
 panel.querySelectorAll("[data-missing]").forEach(b=>b.onclick=()=>missingInfo(b.dataset.missing).catch(fail));
 panel.querySelectorAll("[data-cancel-booking]").forEach(b=>b.onclick=()=>cancelBooking(b.dataset.cancelBooking).catch(fail));
 panel.querySelectorAll("[data-credit-booking]").forEach(b=>b.onclick=()=>issueCredit(b.dataset.creditBooking).catch(fail));
 panel.querySelectorAll("[data-use-credit]").forEach(b=>b.onclick=()=>creditDialog(b.dataset.useCredit));
}
function bookingCard(b){
 const v=vendor(b.vendor_id),balance=Math.max(0,Number(b.amount_due||0)-Number(b.amount_paid||0));
 return '<article class="item '+(b.status==="cancelled"?'danger-note':'')+'"><div class="itemtop"><div><b>'+esc(v?.business_name||vendorName(b.vendor_id))+'</b><div class="muted">'+esc(eventName(b.event_id))+' • '+esc(space(b.space_type_id)?.name||b.space_type||"Space")+(b.space_label?' • Booth '+esc(b.space_label):'')+'</div></div>'+chip(b.status)+'</div>'
  +'<div style="margin-top:8px"><span class="chip">Due '+money(b.amount_due)+'</span><span class="chip">Paid '+money(b.amount_paid)+'</span><span class="chip">Balance '+money(balance)+'</span></div>'
  +(b.special_requests?'<div class="notice" style="margin-top:10px"><b>Special request:</b> '+esc(b.special_requests)+'</div>':'')
  +(b.cancel_reason?'<div class="notice warn" style="margin-top:10px"><b>Cancellation:</b> '+esc(b.cancel_reason)+'</div>':'')
  +(b.missing_info_requested_at?'<p class="muted">Missing info requested '+esc(fmt(b.missing_info_requested_at))+' — '+esc((b.missing_info_fields||[]).join(", "))+'</p>':'')
  +(b.confirmation_sent_at?'<p class="muted">Confirmation sent '+esc(fmt(b.confirmation_sent_at))+'</p>':'')
  +(canManage()?'<div class="actions"><button class="secondary" data-booth="'+b.id+'">Assign Booth</button><button class="secondary" data-reschedule="'+b.id+'">Reschedule</button><button class="secondary" data-confirm-booking="'+b.id+'">Send Confirmation</button><button class="secondary" data-missing="'+b.id+'">Request Missing Info</button>'+(b.status!=="cancelled"?'<button class="danger" data-cancel-booking="'+b.id+'">Cancel</button>':'')+(Number(b.amount_paid)>0&&b.status!=="cancelled"?'<button class="secondary" data-credit-booking="'+b.id+'">Cancel + Issue Credit</button>':'')+'</div>':'')+'</article>';
}
function renderManualForm(){
 const host=$("pxManualArea");if(!host)return;
 const vendors=S().vendors.filter(v=>v.status==="active");
 host.innerHTML='<div class="item selected" style="margin:12px 0"><h3>Manual Vendor Booking</h3><p class="muted">Use this for phone, in-person or organizer-entered bookings. Paid methods are recorded as paid; Invoice creates an amount due.</p><form id="pxManualForm"><div class="grid2"><div class="field"><label>Existing vendor (optional)</label><select name="vendor_id" id="pxManualVendor"><option value="">New vendor</option>'+vendors.map(v=>'<option value="'+v.id+'">'+esc(v.business_name)+' — '+esc(v.email||"")+'</option>').join("")+'</select></div><div class="field"><label>Business name</label><input name="business_name" required></div><div class="field"><label>Contact name</label><input name="contact_name" required></div><div class="field"><label>Email</label><input name="email" type="email" required></div><div class="field"><label>Phone</label><input name="phone"></div><div class="field"><label>What they sell</label><input name="what_they_sell"></div><div class="field"><label>Event</label><select name="event_id" id="pxManualEvent" required>'+extra.allEvents.filter(e=>!e.archived_at&&e.status!=="cancelled").map(e=>'<option value="'+e.id+'">'+esc(e.name)+' — '+esc(date(e.starts_at))+'</option>').join("")+'</select></div><div class="field"><label>Space type</label><select name="space_type_id" id="pxManualSpace" required></select></div><div class="field"><label>Category</label><select name="event_category_id" id="pxManualCategory"><option value="">No category</option></select></div><div class="field"><label>Payment method</label><select name="payment_method"><option value="Invoice">Invoice / Unpaid</option><option value="Cash">Cash</option><option value="Credit Card">Credit Card</option><option value="Zelle">Zelle</option><option value="Venmo">Venmo</option><option value="Check">Check</option><option value="Other">Other</option></select></div><div class="field"><label>Amount</label><input name="amount" id="pxManualAmount" type="number" min="0" step=".01"></div><div class="field"><label>Payment reference</label><input name="payment_reference" placeholder="Optional transaction/reference"></div></div><div class="field"><label>Special request / setup notes</label><textarea name="special_requests"></textarea></div><div class="actions"><button class="primary">Save Booking & Send Confirmation</button><button type="button" class="secondary" id="pxManualCancel">Close</button></div></form></div>';
 const form=$("pxManualForm"),vsel=$("pxManualVendor");
 vsel.onchange=()=>{const v=vendors.find(x=>x.id===vsel.value);if(!v)return;for(const [n,val] of Object.entries({business_name:v.business_name,contact_name:v.contact_name,email:v.email,phone:v.phone,what_they_sell:v.what_they_sell}))form.elements.namedItem(n).value=val||""};
 $("pxManualEvent").onchange=manualOptions;$("pxManualSpace").onchange=manualPrice;$("pxManualCategory").onchange=manualPrice;manualOptions();
 $("pxManualCancel").onclick=()=>host.classList.add("hidden");
 form.onsubmit=e=>saveManual(e).catch(fail);
}
function manualOptions(){
 const eid=$("pxManualEvent")?.value;if(!eid)return;
 const spaces=extra.spaceTypes.filter(x=>x.event_id===eid&&x.status!=="hidden"),cats=extra.categories.filter(x=>x.event_id===eid&&x.status==="active");
 $("pxManualSpace").innerHTML=spaces.map(x=>'<option value="'+x.id+'" data-price="'+Number(x.price||0)+'">'+esc(x.name)+' — '+money(x.price)+'</option>').join("");
 $("pxManualCategory").innerHTML='<option value="" data-fee="0">No category</option>'+cats.map(x=>'<option value="'+x.id+'" data-fee="'+Number(x.fee||0)+'">'+esc(x.name)+(Number(x.fee||0)?' + '+money(x.fee):'')+'</option>').join("");manualPrice();
}
function manualPrice(){const s=$("pxManualSpace")?.selectedOptions[0],c=$("pxManualCategory")?.selectedOptions[0];if($("pxManualAmount"))$("pxManualAmount").value=(Number(s?.dataset.price||0)+Number(c?.dataset.fee||0)).toFixed(2)}
async function saveManual(e){
 e.preventDefault();const f=new FormData(e.currentTarget),method=String(f.get("payment_method")||"Invoice"),paid=method!=="Invoice";
 await op("manual_booking",{vendor_id:f.get("vendor_id")||null,business_name:f.get("business_name"),contact_name:f.get("contact_name"),email:f.get("email"),phone:f.get("phone"),what_they_sell:f.get("what_they_sell"),event_id:f.get("event_id"),space_type_id:f.get("space_type_id"),event_category_id:f.get("event_category_id")||null,payment_method:method,payment_reference:f.get("payment_reference"),amount:Number(f.get("amount")||0),paid,special_requests:f.get("special_requests")});
 await refresh();toast("Manual booking saved.");
}
async function assignBooth(id){const b=extra.bookings.find(x=>x.id===id),label=prompt("Booth / space label:",b?.space_label||"");if(label===null)return;const r=await sb().from("bookings").update({space_label:label.trim()||null,updated_at:new Date().toISOString()}).eq("id",id);if(r.error)throw r.error;await loadExtra();toast("Booth assignment saved.")}
function rescheduleDialog(id){
 const b=extra.bookings.find(x=>x.id===id);if(!b)return;
 const d=dialog("Reschedule Vendor",'<form id="pxReschedule"><div class="field"><label>Event</label><select name="event">'+extra.allEvents.filter(e=>!e.archived_at&&e.status!=="cancelled").map(e=>'<option value="'+e.id+'" '+(e.id===b.event_id?'selected':'')+'>'+esc(e.name)+' — '+esc(date(e.starts_at))+'</option>').join("")+'</select></div><div class="field"><label>Space type</label><select name="space"></select></div><div class="field"><label>Category</label><select name="category"></select></div><label><input name="keep" type="checkbox" checked style="width:auto"> Keep current price</label><div class="actions"><button class="primary">Move Booking</button></div></form>');
 const f=d.querySelector("#pxReschedule"),fill=()=>{const eid=f.event.value;f.space.innerHTML=extra.spaceTypes.filter(x=>x.event_id===eid&&x.status!=="hidden").map(x=>'<option value="'+x.id+'" '+(x.id===b.space_type_id?'selected':'')+'>'+esc(x.name)+' — '+money(x.price)+'</option>').join("");f.category.innerHTML='<option value="">No category</option>'+extra.categories.filter(x=>x.event_id===eid&&x.status==="active").map(x=>'<option value="'+x.id+'" '+(x.id===b.event_category_id?'selected':'')+'>'+esc(x.name)+'</option>').join("")};f.event.onchange=fill;fill();
 f.onsubmit=async e=>{e.preventDefault();try{await op("reschedule_booking",{booking_id:id,event_id:f.event.value,space_type_id:f.space.value,event_category_id:f.category.value||null,keep_price:f.keep.checked});d.close();await refresh();toast("Booking moved.")}catch(err){fail(err)}};
}
async function missingInfo(id){const raw=prompt("What information is missing? Separate items with commas.","Phone number, billing address");if(raw===null)return;const fields=raw.split(",").map(x=>x.trim()).filter(Boolean);if(!fields.length)return;await op("request_missing_info",{booking_id:id,fields});await loadExtra();toast("Missing-information request sent.")}
async function cancelBooking(id){const reason=prompt("Reason for cancellation:","Vendor requested cancellation");if(reason===null||!reason.trim())return;if(!confirm("Cancel this booking and release its space?"))return;await op("cancel_booking",{booking_id:id,reason:reason.trim()});await refresh();toast("Booking cancelled and vendor notified.")}
async function issueCredit(id){const b=extra.bookings.find(x=>x.id===id),raw=prompt("Credit amount:",Number(b?.amount_paid||0).toFixed(2));if(raw===null)return;const amount=Number(raw);if(!(amount>0))throw new Error("Enter a valid credit amount.");const reason=prompt("Reason for credit:","Vendor cancellation credit")||"Vendor cancellation credit";if(!confirm("Cancel this booking and issue "+money(amount)+" credit?"))return;await op("issue_credit",{booking_id:id,amount,reason});await refresh();toast("Vendor credit issued.")}
function creditsHtml(){
 const rows=extra.credits.filter(c=>["available","partially_used"].includes(c.status)&&Number(c.remaining_amount)>0);
 return '<div class="item selected" style="margin-top:18px"><div class="itemtop"><div><h3 style="margin:0">Vendor Credits</h3><p class="muted">Cancellation credits can be applied to a new event booking.</p></div><span class="chip">'+rows.length+' available</span></div>'+(rows.length?'<div class="list">'+rows.map(c=>'<div class="item"><div class="itemtop"><div><b>'+esc(vendorName(c.vendor_id))+'</b><div class="muted">'+money(c.remaining_amount)+' remaining • '+esc(c.reason||"Credit")+'</div></div>'+chip(c.status)+'</div><div class="actions"><button class="primary" data-use-credit="'+c.id+'">Apply Credit to Booking</button></div></div>').join("")+'</div>':'<div class="empty">No available vendor credits.</div>')+'</div>';
}
function creditDialog(id){
 const c=extra.credits.find(x=>x.id===id);if(!c)return;
 const d=dialog("Apply Vendor Credit",'<p><b>'+esc(vendorName(c.vendor_id))+'</b> has <b>'+money(c.remaining_amount)+'</b> available.</p><form id="pxCreditForm"><div class="field"><label>Event</label><select name="event">'+extra.allEvents.filter(e=>!e.archived_at&&e.status!=="cancelled").map(e=>'<option value="'+e.id+'">'+esc(e.name)+' — '+esc(date(e.starts_at))+'</option>').join("")+'</select></div><div class="field"><label>Space</label><select name="space"></select></div><div class="field"><label>Category</label><select name="category"></select></div><div class="actions"><button class="primary">Apply Credit</button></div></form>');
 const f=d.querySelector("#pxCreditForm"),fill=()=>{const eid=f.event.value;f.space.innerHTML=extra.spaceTypes.filter(x=>x.event_id===eid&&x.status!=="hidden").map(x=>'<option value="'+x.id+'">'+esc(x.name)+' — '+money(x.price)+'</option>').join("");f.category.innerHTML='<option value="">No category</option>'+extra.categories.filter(x=>x.event_id===eid&&x.status==="active").map(x=>'<option value="'+x.id+'">'+esc(x.name)+'</option>').join("")};f.event.onchange=fill;fill();
 f.onsubmit=async e=>{e.preventDefault();try{await op("apply_credit",{credit_id:id,event_id:f.event.value,space_type_id:f.space.value,event_category_id:f.category.value||null});d.close();await refresh();toast("Credit applied to new booking.")}catch(err){fail(err)}};
}

/* BILLING */
function renderBilling(){
 const panel=$("billingPanel");if(!panel)return;
 const status=panel.dataset.status||"outstanding",eventId=panel.dataset.event||"all";
 const paidTotal=extra.payments.filter(p=>["completed","recorded"].includes(p.status)).reduce((n,p)=>n+Number(p.amount||0),0);
 const outstanding=extra.invoices.filter(i=>!["paid","cancelled","void"].includes(i.status)).reduce((n,i)=>n+Number(i.balance_due||0),0);
 const rows=extra.invoices.filter(i=>(eventId==="all"||i.event_id===eventId)&&(status==="all"||(status==="outstanding"?!["paid","cancelled","void"].includes(i.status):i.status===status)));
 let html='<section class="panel"><div class="kicker">Invoice center</div><h2>Billing & Payments</h2><div class="metric-row"><div class="mini-metric"><b>'+money(paidTotal)+'</b>Collected</div><div class="mini-metric"><b>'+money(outstanding)+'</b>Outstanding</div><div class="mini-metric"><b>'+extra.invoices.filter(i=>i.status==="paid").length+'</b>Paid invoices</div><div class="mini-metric"><b>'+extra.outbox.filter(o=>o.status==="failed").length+'</b>Email failures</div></div><div class="vendor-toolbar"><div class="field"><label>Status</label><select id="pxInvoiceStatus"><option value="outstanding">Outstanding</option><option value="all">All invoices</option><option value="draft">Draft</option><option value="sent">Sent</option><option value="partial">Partial</option><option value="paid">Paid</option><option value="overdue">Overdue</option><option value="cancelled">Cancelled</option></select></div><div class="field"><label>Event</label><select id="pxInvoiceEvent"><option value="all">All events</option>'+extra.allEvents.map(e=>'<option value="'+e.id+'">'+esc(e.name)+'</option>').join("")+'</select></div></div>';
 if(!rows.length)html+='<div class="empty">No invoices match this view.</div>';else html+='<div class="list">'+rows.map(inv=>invoiceCard(inv)).join("")+'</div>';
 html+='</section>';panel.innerHTML=html;$("pxInvoiceStatus").value=status;$("pxInvoiceEvent").value=eventId;$("pxInvoiceStatus").onchange=function(){panel.dataset.status=this.value;renderBilling()};$("pxInvoiceEvent").onchange=function(){panel.dataset.event=this.value;renderBilling()};
 panel.querySelectorAll("[data-save-invoice]").forEach(b=>b.onclick=()=>saveInvoiceAdjust(b.dataset.saveInvoice,false).catch(fail));
 panel.querySelectorAll("[data-mark-sent]").forEach(b=>b.onclick=()=>saveInvoiceAdjust(b.dataset.markSent,true).catch(fail));
 panel.querySelectorAll("[data-record-pay]").forEach(b=>b.onclick=()=>recordPayment(b.dataset.recordPay).catch(fail));
 panel.querySelectorAll("[data-cancel-invoice]").forEach(b=>b.onclick=()=>cancelInvoice(b.dataset.cancelInvoice).catch(fail));
 panel.querySelectorAll("[data-copy-pay]").forEach(b=>b.onclick=async()=>{await navigator.clipboard.writeText(b.dataset.copyPay);toast("Payment link copied.")});
}
function invoiceCard(inv){
 const v=vendor(inv.vendor_id);
 return '<article class="item" data-invoice-card="'+inv.id+'"><div class="itemtop"><div><b>'+esc(inv.invoice_number||"Invoice")+' — '+esc(v?.business_name||vendorName(inv.vendor_id))+'</b><div class="muted">'+esc(inv.event_id?eventName(inv.event_id):"")+(inv.due_at?' • Due '+esc(date(inv.due_at)):'')+'</div></div>'+chip(inv.status)+'</div><div style="margin:8px 0"><span class="chip">Subtotal '+money(inv.subtotal)+'</span><span class="chip">Discount '+money(inv.discount)+'</span><span class="chip">Late fee '+money(inv.late_fee)+'</span><span class="chip">Total '+money(inv.total)+'</span><span class="chip">Balance '+money(inv.balance_due)+'</span></div>'
 +'<div class="grid3"><div class="field"><label>Discount</label><input data-inv-discount type="number" min="0" step=".01" value="'+Number(inv.discount||0).toFixed(2)+'"></div><div class="field"><label>Late fee</label><input data-inv-late type="number" min="0" step=".01" value="'+Number(inv.late_fee||0).toFixed(2)+'"></div><div class="field"><label>Payment / invoice notes</label><input data-inv-comment value="'+esc(inv.payment_comment||"")+'"></div></div>'
 +(inv.sent_count?'<p class="muted">Marked sent '+inv.sent_count+' time'+(inv.sent_count===1?'':'s')+(inv.marked_sent_at?' • Last '+esc(fmt(inv.marked_sent_at)):'')+'</p>':'')
 +(inv.cancel_reason?'<div class="notice warn">'+esc(inv.cancel_reason)+'</div>':'')
 +'<div class="actions"><button class="secondary" data-save-invoice="'+inv.id+'">Save Adjustments</button><button class="secondary" data-mark-sent="'+inv.id+'">Mark Invoice Sent</button><a class="btn secondary" href="'+esc(payUrl(inv))+'" target="_blank">Payment Page</a><button class="secondary" data-copy-pay="'+esc(payUrl(inv))+'">Copy Pay Link</button>'+(Number(inv.balance_due)>0&&!["cancelled","void"].includes(inv.status)?'<button class="primary" data-record-pay="'+inv.id+'">Record Payment</button><button class="danger" data-cancel-invoice="'+inv.id+'">Cancel Invoice</button>':'')+'</div></article>';
}
async function saveInvoiceAdjust(id,markSent){
 const card=document.querySelector('[data-invoice-card="'+id+'"]');const discount=Number(card.querySelector("[data-inv-discount]").value||0),late_fee=Number(card.querySelector("[data-inv-late]").value||0),payment_comment=card.querySelector("[data-inv-comment]").value;
 await op("invoice_adjust",{invoice_id:id,discount,late_fee,payment_comment,mark_sent:markSent});await loadExtra();toast(markSent?"Invoice marked sent.":"Invoice updated.");
}
async function recordPayment(id){const inv=extra.invoices.find(x=>x.id===id),raw=prompt("Payment amount:",Number(inv?.balance_due||0).toFixed(2));if(raw===null)return;const amount=Number(raw);if(!(amount>0))throw new Error("Enter a valid amount.");const method=prompt("Payment method:","Cash")||"Manual",reference=prompt("Reference / transaction ID (optional):","")||"";await edge("billing-api",{organization_id:S().org.id,action:"record_manual_payment",invoice_id:id,amount,method,reference});await refresh();toast("Payment recorded.")}
async function cancelInvoice(id){const reason=prompt("Why is this invoice being cancelled?","Vendor cancelled");if(reason===null||!reason.trim())return;await edge("billing-api",{organization_id:S().org.id,action:"cancel_invoice",invoice_id:id,reason:reason.trim()});await refresh();toast("Invoice cancelled.")}

/* EVENT DAY */
function renderEventDay(){
 const panel=$("checkinPanel");if(!panel)return;
 const eventId=panel.dataset.event||extra.allEvents.find(e=>!e.archived_at&&e.starts_at&&new Date(e.starts_at)>=new Date())?.id||extra.allEvents.find(e=>!e.archived_at)?.id||"";
 const rows=activeBookings(eventId);
 let html='<section class="panel"><div class="kicker">Event operations</div><h2>Event Day</h2><p class="muted">Inspection, attendance, setup arrival, special requests and featured-vendor posts in one place.</p><div class="field" style="max-width:480px"><label>Event</label><select id="pxDayEvent">'+extra.allEvents.filter(e=>!e.archived_at).map(e=>'<option value="'+e.id+'">'+esc(e.name)+' — '+esc(date(e.starts_at))+'</option>').join("")+'</select></div>';
 if(!rows.length)html+='<div class="empty">No active bookings for this event.</div>';else html+='<div class="list">'+rows.map(b=>dayCard(b)).join("")+'</div>';
 html+='</section>';panel.innerHTML=html;if($("pxDayEvent")){$("pxDayEvent").value=eventId;$("pxDayEvent").onchange=function(){panel.dataset.event=this.value;renderEventDay()}}
 panel.querySelectorAll("[data-inspection]").forEach(b=>b.onclick=()=>inspection(b.dataset.inspection,b.dataset.status).catch(fail));
 panel.querySelectorAll("[data-attendance]").forEach(b=>b.onclick=()=>attendance(b.dataset.attendance,b.dataset.state).catch(fail));
 panel.querySelectorAll("[data-setup-arrival]").forEach(b=>b.onchange=()=>saveArrival(b.dataset.setupArrival,b.value).catch(fail));
 panel.querySelectorAll("[data-feature]").forEach(b=>b.onclick=()=>featureVendor(b.dataset.feature));
}
function dayCard(b){
 const v=vendor(b.vendor_id),paid=Number(b.amount_paid||0)>=Number(b.amount_due||0),canCheck=b.inspection_status==="approved";
 return '<article class="item '+(b.inspection_status==="refused"?'danger-note':b.inspection_status==="needs_correction"?'attention':'')+'"><div class="itemtop"><div><b>'+esc(v?.business_name||vendorName(b.vendor_id))+'</b><div class="muted">'+esc(v?.contact_name||"")+' • '+esc(space(b.space_type_id)?.name||b.space_type||"")+(b.space_label?' • Booth '+esc(b.space_label):'')+'</div></div><div>'+chip(b.inspection_status)+' '+chip(b.attendance_state)+'</div></div>'
  +'<div class="grid2" style="margin-top:10px"><div><b>Everything disclosed</b><p>'+esc(v?.what_they_sell||"Not listed")+'</p></div><div><b>Payment</b><p>'+(paid?'<span class="chip status-paid">Paid</span>':'<span class="chip status-pending">Balance '+money(Math.max(0,Number(b.amount_due||0)-Number(b.amount_paid||0)))+'</span>')+'</p></div></div>'
  +(b.special_requests?'<div class="notice"><b>Special request / setup note</b><br>'+esc(b.special_requests)+'</div>':'')
  +(b.inspection_notes?'<p><b>Inspection notes:</b> '+esc(b.inspection_notes)+'</p>':'')
  +'<div class="field" style="max-width:260px;margin-top:10px"><label>Planned setup arrival</label><input type="time" data-setup-arrival="'+b.id+'" value="'+esc(b.setup_arrival_time?String(b.setup_arrival_time).slice(0,5):"")+'"><small>'+(b.setup_checkin_at?'Saved '+esc(fmt(b.setup_checkin_at)):'Not set')+'</small></div>'
  +'<div class="actions"><button class="secondary" data-inspection="'+b.id+'" data-status="approved">Inspection Approved</button><button class="secondary" data-inspection="'+b.id+'" data-status="needs_correction">Needs Correction</button><button class="danger" data-inspection="'+b.id+'" data-status="refused">Refused Compliance</button><button class="primary" data-attendance="'+b.id+'" data-state="checked_in" '+(canCheck?'':'disabled title="Approve inspection first"')+'>Check In</button><button class="secondary" data-attendance="'+b.id+'" data-state="no_show">No Show</button><button class="secondary" data-attendance="'+b.id+'" data-state="not_marked">Clear Attendance</button><button class="secondary" data-feature="'+b.id+'">'+(b.featured_posted_at?'Featured ✓':'Create Featured Vendor Post')+'</button></div></article>';
}
async function inspection(id,status){let notes="";if(status!=="approved"){notes=prompt(status==="refused"?"Reason / compliance notes (required):":"Correction needed (required):","")||"";if(!notes.trim())throw new Error("Enter inspection notes.")}else notes=prompt("Inspection notes (optional):","")||"";await op("attendance",{booking_id:id,inspection_status:status,inspection_notes:notes});await loadExtra();toast(status==="approved"?"Inspection approved.":"Inspection status saved.")}
async function attendance(id,state){await op("attendance",{booking_id:id,attendance_state:state});await loadExtra();toast(state==="checked_in"?"Vendor checked in.":state==="no_show"?"Vendor marked no-show.":"Attendance cleared.")}
async function saveArrival(id,value){await op("attendance",{booking_id:id,setup_arrival_time:value||null});await loadExtra();toast("Setup arrival saved.")}
function featureVendor(id){
 const b=extra.bookings.find(x=>x.id===id),v=vendor(b?.vendor_id),e=extra.allEvents.find(x=>x.id===b?.event_id);if(!b||!v||!e)return;
 const products=v.what_they_sell||v.category||"their locally offered products";
 const draft='🌟 FEATURED VENDOR SPOTLIGHT 🌟\n\nWe’re excited to feature '+(v.business_name||v.contact_name)+' at '+e.name+'!\n\n🛍️ What you’ll find: '+products+'\n\n📅 '+date(e.starts_at)+'\n📍 '+(e.venue_name||"")+(e.address?'\n'+e.address:'')+'\n\nCome out, support local, and be sure to stop by '+(v.business_name||v.contact_name)+'!\n\n#SupportLocal #ShopLocal #FeaturedVendor';
 const d=dialog("Featured Vendor Post",'<p><b>'+esc(v.business_name||v.contact_name)+'</b></p><textarea id="pxFeatureText" rows="14">'+esc(draft)+'</textarea><div class="actions"><button id="pxCopyFeature" class="primary">Copy Post & Mark Featured</button></div>');
 d.querySelector("#pxCopyFeature").onclick=async()=>{try{await navigator.clipboard.writeText(d.querySelector("#pxFeatureText").value);await op("mark_featured",{booking_id:id});d.close();await loadExtra();toast("Featured vendor post copied and marked featured.")}catch(e){fail(e)}};
}

/* COMMUNICATIONS */
function recipients(mode,eventId){
 if(mode==="all")return S().vendors.filter(v=>v.status==="active"&&v.email);
 const ids=new Set(activeBookings(eventId).map(b=>b.vendor_id));return S().vendors.filter(v=>ids.has(v.id)&&v.status==="active"&&v.email);
}
function renderCommunications(){
 const panel=$("communicationsPanel");if(!panel)return;
 const mode=panel.dataset.mode||"event",eventId=panel.dataset.event||extra.allEvents.find(e=>!e.archived_at)?.id||"",list=recipients(mode,eventId),unique=new Map(list.map(v=>[String(v.email).trim().toLowerCase(),v]));
 let html='<section class="panel"><div class="kicker">Vendor email</div><h2>Communications</h2><p class="muted">Send event updates or announcements to the entire vendor database. Duplicate email addresses are removed automatically.</p><div class="grid2"><div class="field"><label>Recipients</label><select id="pxCommMode"><option value="event">Market / Event Date</option><option value="all">All Vendors</option></select></div><div class="field" id="pxCommEventWrap"><label>Event</label><select id="pxCommEvent">'+extra.allEvents.filter(e=>!e.archived_at).map(e=>'<option value="'+e.id+'">'+esc(e.name)+' — '+esc(date(e.starts_at))+'</option>').join("")+'</select></div></div><div class="notice"><b>'+unique.size+' unique vendor email'+(unique.size===1?'':'s')+'</b><br>'+esc([...unique.values()].slice(0,8).map(v=>v.business_name).join(", "))+(unique.size>8?'…':'')+'</div><div class="field" style="margin-top:12px"><label>Subject</label><input id="pxCommSubject" placeholder="Important update for our vendors"></div><div class="field"><label>Message</label><textarea id="pxCommBody" rows="12" placeholder="Use {{name}} and {{business}} to personalize the email."></textarea></div><div class="actions"><button class="primary" id="pxCommSend">Send Email</button><button class="secondary" data-template="weather">Weather Template</button><button class="secondary" data-template="reminder">Event Reminder Template</button></div></section>';
 html+='<section class="panel"><h2>Recent Vendor Emails</h2><div class="list">'+(extra.communications.filter(c=>c.channel==="email").slice(0,30).map(c=>'<div class="item"><div class="itemtop"><div><b>'+esc(c.subject||"Email")+'</b><div class="muted">'+esc(c.recipient||"")+' • '+esc(fmt(c.sent_at||c.created_at))+'</div></div>'+chip(c.status||"sent")+'</div><p class="muted">'+esc(c.body_preview||"")+'</p></div>').join("")||'<div class="empty">No vendor emails recorded yet.</div>')+'</div>';
 const failed=extra.outbox.filter(o=>["failed","waiting_configuration"].includes(o.status));if(failed.length)html+='<h3>Email Delivery Problems</h3><div class="list">'+failed.map(o=>'<div class="item danger-note"><b>'+esc(o.subject)+'</b><div class="muted">'+esc(o.recipient_email)+'</div><p>'+esc(o.last_error||o.status)+'</p><button class="secondary" data-retry-email="'+o.id+'">Retry Email</button></div>').join("")+'</div>';
 html+='</section>';panel.innerHTML=html;$("pxCommMode").value=mode;$("pxCommEvent").value=eventId;$("pxCommEventWrap").classList.toggle("hidden",mode==="all");
 $("pxCommMode").onchange=function(){panel.dataset.mode=this.value;renderCommunications()};$("pxCommEvent").onchange=function(){panel.dataset.event=this.value;renderCommunications()};
 $("pxCommSend").onclick=()=>sendMass(mode,eventId).catch(fail);
 panel.querySelectorAll("[data-template]").forEach(b=>b.onclick=()=>{if(b.dataset.template==="weather"){$("pxCommSubject").value="Weather update for our upcoming event";$("pxCommBody").value="Hello {{name}},\n\nHere is an important weather update for our upcoming event. Please review the latest event details and reply if you have any questions.\n\nThank you!"}else{$("pxCommSubject").value="Reminder for our upcoming event";$("pxCommBody").value="Hello {{name}},\n\nThis is a reminder about our upcoming event. Please make sure your setup, inventory and arrival plans are ready.\n\nWe look forward to seeing {{business}} there!"}});
 panel.querySelectorAll("[data-retry-email]").forEach(b=>b.onclick=async()=>{try{await edge("email-service",{organization_id:S().org.id,action:"retry",outbox_id:b.dataset.retryEmail});await loadExtra();toast("Email retry processed.")}catch(e){fail(e)}});
}
async function sendMass(mode,eventId){const subject=$("pxCommSubject").value.trim(),message=$("pxCommBody").value.trim();if(!subject||!message)throw new Error("Enter a subject and message.");if(!confirm("Send this message to the current recipient list?"))return;const x=await op("send_mass_email",{mode,event_id:mode==="event"?eventId:null,subject,message});await loadExtra();toast("Email processed: "+x.sent+" sent"+(x.failed?" • "+x.failed+" failed":"")+".")}

/* SHOPPER RSVPS */
function renderShoppers(){
 const panel=$("shoppersPanel");if(!panel)return;
 const eventId=panel.dataset.event||extra.allEvents.find(e=>!e.archived_at&&e.public_slug)?.id||"",e=extra.allEvents.find(x=>x.id===eventId),rows=extra.rsvps.filter(r=>r.event_id===eventId),party=rows.reduce((n,r)=>n+Number(r.party_size||1),0),link=e?.public_slug?rsvpUrl(e):"";
 let html='<section class="panel"><div class="kicker">Public attendance</div><h2>Shopper RSVPs</h2><p class="muted">Offer shoppers a free RSVP page, track estimated party size and referral source.</p><div class="field" style="max-width:480px"><label>Event</label><select id="pxRsvpEvent">'+extra.allEvents.filter(x=>!x.archived_at).map(x=>'<option value="'+x.id+'">'+esc(x.name)+' — '+esc(date(x.starts_at))+'</option>').join("")+'</select></div>';
 if(!e)html+='<div class="empty">Create an event first.</div>';else html+='<div class="grid2"><label class="item"><input id="pxRsvpEnabled" type="checkbox" style="width:auto" '+(e.shopper_rsvp_enabled?'checked':'')+'> Enable public shopper RSVP</label><div class="field"><label>Optional RSVP capacity</label><input id="pxRsvpCapacity" type="number" min="1" value="'+esc(e.shopper_rsvp_capacity||"")+'" placeholder="Unlimited"></div></div><div class="actions"><button id="pxSaveRsvp" class="primary">Save RSVP Settings</button></div>'+(link?'<div class="linkbox" style="margin-top:12px"><input readonly value="'+esc(link)+'"><button id="pxCopyRsvp" class="secondary">Copy RSVP Link</button><a class="btn secondary" target="_blank" href="'+esc(link)+'">Open RSVP Page</a></div>':'<div class="notice warn" style="margin-top:12px">Publish the event application first so the event has a public URL slug.</div>')+'<div class="metric-row"><div class="mini-metric"><b>'+rows.length+'</b>RSVP records</div><div class="mini-metric"><b>'+party+'</b>Expected shoppers</div><div class="mini-metric"><b>'+new Set(rows.map(r=>r.email.toLowerCase())).size+'</b>Unique emails</div><div class="mini-metric"><b>'+rows.filter(r=>r.referral_source).length+'</b>Referral answers</div></div><div class="actions"><button id="pxExportRsvp" class="secondary">Export CSV</button></div><div class="table-wrap"><table class="compact-table"><thead><tr><th>Name</th><th>Email</th><th>Party</th><th>Referral</th><th>Date</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(r.name)+'</td><td>'+esc(r.email)+'</td><td>'+esc(r.party_size)+'</td><td>'+esc([r.referral_source,r.referral_detail].filter(Boolean).join(" — "))+'</td><td>'+esc(fmt(r.created_at))+'</td></tr>').join("")+'</tbody></table></div>';
 html+='</section>';panel.innerHTML=html;if($("pxRsvpEvent")){$("pxRsvpEvent").value=eventId;$("pxRsvpEvent").onchange=function(){panel.dataset.event=this.value;renderShoppers()}}
 if($("pxSaveRsvp"))$("pxSaveRsvp").onclick=()=>saveRsvpSettings(eventId).catch(fail);if($("pxCopyRsvp"))$("pxCopyRsvp").onclick=async()=>{await navigator.clipboard.writeText(link);toast("RSVP link copied.")};if($("pxExportRsvp"))$("pxExportRsvp").onclick=()=>exportRsvp(rows,e);
}
async function saveRsvpSettings(eventId){const enabled=$("pxRsvpEnabled").checked,cap=$("pxRsvpCapacity").value?Number($("pxRsvpCapacity").value):null,r=await sb().from("events").update({shopper_rsvp_enabled:enabled,shopper_rsvp_capacity:cap,updated_at:new Date().toISOString()}).eq("id",eventId);if(r.error)throw r.error;await refresh();toast("RSVP settings saved.")}
function exportRsvp(rows,e){const data=[["Name","Email","Party Size","Referral Source","Referral Detail","Notes","Created"],...rows.map(r=>[r.name,r.email,r.party_size,r.referral_source,r.referral_detail,r.notes,r.created_at])],csv=data.map(row=>row.map(v=>'"'+String(v??"").replaceAll('"','""')+'"').join(",")).join("\n"),a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download=(e?.name||"event").replace(/[^a-z0-9]+/gi,"-").toLowerCase()+"-rsvps.csv";a.click();URL.revokeObjectURL(a.href)}

/* FLOOR PLAN + SETUP EMAIL */
function defaultSetup(e){return 'Hello Vendors,\n\nHere are the setup instructions for '+(e?.name||"our upcoming event")+'.\n\nLocation:\n'+(e?.venue_name||"")+(e?.address?'\n'+e.address:'')+'\n\nEvent Date: '+date(e?.starts_at)+'\nEvent Hours: '+(e?.starts_at?new Date(e.starts_at).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}):"")+'–'+(e?.ends_at?new Date(e.ends_at).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}):"")+'\n\nPlease arrive with enough time to be completely set up before the event opens. Follow your assigned booth location on the floor plan if one is attached.\n\nPlease do not display or sell products that were not approved for this event.\n\nIf you need to cancel or have a setup concern, contact the event organizer as soon as possible.\n\nThank you.'}
function renderFloorPlan(){
 const panel=$("floorplanPanel");if(!panel)return;
 const eventId=panel.dataset.event||extra.allEvents.find(e=>!e.archived_at&&new Date(e.starts_at||0)>=new Date())?.id||extra.allEvents.find(e=>!e.archived_at)?.id||"",e=extra.allEvents.find(x=>x.id===eventId),rows=activeBookings(eventId);
 const inside=rows.filter(b=>String(space(b.space_type_id)?.indoor_outdoor||"").toLowerCase()==="indoor"),outside=rows.filter(b=>String(space(b.space_type_id)?.indoor_outdoor||"").toLowerCase()==="outdoor"),emails=new Set(rows.map(b=>String(vendor(b.vendor_id)?.email||"").toLowerCase()).filter(Boolean));
 let html='<section class="panel"><div class="kicker">Setup operations</div><h2>Setup Instructions & Floor Plan</h2><p class="muted">Drag inside vendors into place, save a floor-plan snapshot, and email setup instructions. Floor plans attach only to inside-vendor emails.</p><div class="field" style="max-width:520px"><label>Event</label><select id="pxFloorEvent">'+extra.allEvents.filter(x=>!x.archived_at).map(x=>'<option value="'+x.id+'">'+esc(x.name)+' — '+esc(date(x.starts_at))+'</option>').join("")+'</select></div>';
 if(!e)html+='<div class="empty">Create an event first.</div>';else html+='<div class="notice"><b>'+rows.length+'</b> active vendors • <b>'+inside.length+'</b> inside • <b>'+outside.length+'</b> outside • <b>'+emails.size+'</b> unique recipient emails</div><div class="field" style="margin-top:12px"><label>Email subject</label><input id="pxSetupSubject" value="'+esc(e.setup_email_subject||((e.name||"Event")+" Setup Instructions — "+date(e.starts_at)))+'"></div><div class="field"><label>Setup instructions</label><textarea id="pxSetupBody" rows="18">'+esc(e.setup_instructions||defaultSetup(e))+'</textarea></div><label><input id="pxAttachFloor" type="checkbox" style="width:auto" checked> Attach saved floor-plan image to inside-vendor emails</label><div class="actions"><button class="primary" id="pxSendSetup">Send Setup Instructions</button><button class="secondary" id="pxSaveFloor">Save Floor Plan</button><button class="secondary" id="pxPreviewFloor">Preview Saved Image</button><button class="secondary" id="pxPrintFloor">Print Floor Plan</button></div>'+(e.setup_sent_at?'<p class="muted">Last setup email sent '+esc(fmt(e.setup_sent_at))+'</p>':'')+'<div id="pxFloorBoard" class="floor-plan"></div>';
 html+='</section>';panel.innerHTML=html;if($("pxFloorEvent")){$("pxFloorEvent").value=eventId;$("pxFloorEvent").onchange=function(){panel.dataset.event=this.value;renderFloorPlan()}}
 if(e){drawFloor(e,inside);$("pxSaveFloor").onclick=()=>saveFloor(e,inside).catch(fail);$("pxSendSetup").onclick=()=>sendSetup(e).catch(fail);$("pxPreviewFloor").onclick=()=>previewFloor(e);$("pxPrintFloor").onclick=()=>printFloor(e)}
}
function drawFloor(e,rows){
 const board=$("pxFloorBoard");if(!board)return;const saved=e.floor_plan?.nodes||{};
 board.innerHTML=rows.map((b,i)=>{const p=saved[b.id]||{x:4+(i%3)*31,y:6+Math.floor(i/3)*10};return '<div class="vendor-node" data-floor-booking="'+b.id+'" style="left:'+Number(p.x||0)+'%;top:'+Number(p.y||0)+'%"><b>'+esc(vendorName(b.vendor_id))+'</b><small>'+esc(b.space_label?("Booth "+b.space_label):(space(b.space_type_id)?.name||"Inside"))+'</small></div>'}).join("");
 board.querySelectorAll("[data-floor-booking]").forEach(node=>makeDraggable(node,board));
}
function makeDraggable(node,board){
 let start=null;node.onpointerdown=e=>{e.preventDefault();node.setPointerCapture(e.pointerId);node.classList.add("dragging");const nr=node.getBoundingClientRect(),br=board.getBoundingClientRect();start={x:e.clientX,y:e.clientY,left:nr.left-br.left,top:nr.top-br.top,bw:br.width,bh:br.height,nw:nr.width,nh:nr.height}};
 node.onpointermove=e=>{if(!start)return;let left=start.left+(e.clientX-start.x),top=start.top+(e.clientY-start.y);left=Math.max(0,Math.min(start.bw-start.nw,left));top=Math.max(0,Math.min(start.bh-start.nh,top));node.style.left=(left/start.bw*100)+"%";node.style.top=(top/start.bh*100)+"%"};
 const done=e=>{if(!start)return;start=null;node.classList.remove("dragging");try{node.releasePointerCapture(e.pointerId)}catch{}};node.onpointerup=done;node.onpointercancel=done;
}
async function saveFloor(e,rows){
 const board=$("pxFloorBoard"),nodes={};board.querySelectorAll("[data-floor-booking]").forEach(n=>{nodes[n.dataset.floorBooking]={x:parseFloat(n.style.left)||0,y:parseFloat(n.style.top)||0}});
 let snapshot=e.floor_plan_snapshot||null;
 try{const mod=await import("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm"),html2canvas=mod.default||mod;const canvas=await html2canvas(board,{backgroundColor:"#f7f5e8",scale:1.4});snapshot=canvas.toDataURL("image/png")}catch(err){console.warn("Floor snapshot unavailable",err)}
 const r=await sb().from("events").update({floor_plan:{version:1,nodes},floor_plan_snapshot:snapshot,floor_plan_updated_at:new Date().toISOString(),setup_email_subject:$("pxSetupSubject").value.trim()||null,setup_instructions:$("pxSetupBody").value.trim()||null,updated_at:new Date().toISOString()}).eq("id",e.id);if(r.error)throw r.error;await refresh();toast(snapshot?"Floor plan and image saved.":"Floor positions saved; image snapshot was unavailable.");
}
async function sendSetup(e){
 const subject=$("pxSetupSubject").value.trim(),message=$("pxSetupBody").value.trim();if(!subject||!message)throw new Error("Enter a subject and setup instructions.");if(!confirm("Send setup instructions to all active vendors for this event?"))return;
 const x=await op("send_setup",{event_id:e.id,subject,message,attach_floor_plan:$("pxAttachFloor").checked,batch_key:crypto.randomUUID()});await refresh();toast("Setup email processed: "+x.sent+" sent"+(x.failed?" • "+x.failed+" failed":"")+".");
}
function previewFloor(e){if(!e.floor_plan_snapshot)return toast("Save the floor plan image first.");const w=window.open("","_blank");if(!w)return toast("Allow pop-ups to preview the floor plan.");w.document.write('<title>Floor Plan</title><style>body{margin:0;background:#eee;display:grid;place-items:center;min-height:100vh}img{max-width:96vw;max-height:96vh}</style><img src="'+e.floor_plan_snapshot+'">');w.document.close()}
function printFloor(e){if(!e.floor_plan_snapshot)return toast("Save the floor plan image first.");const w=window.open("","_blank");if(!w)return toast("Allow pop-ups to print the floor plan.");w.document.write('<title>Floor Plan</title><style>@page{size:letter portrait;margin:.25in}body{margin:0;text-align:center}img{max-width:100%;max-height:10in}</style><img src="'+e.floor_plan_snapshot+'"><script>window.onload=()=>window.print()<\/script>');w.document.close()}

/* VENDOR DUPLICATES */
function augmentVendors(){
 const panel=$("vendorsPanel");if(!panel||panel.querySelector("#pxDuplicateTools"))return;
 const section=document.createElement("section");section.id="pxDuplicateTools";section.className="panel";section.innerHTML='<div class="itemtop"><div><div class="kicker">Data quality</div><h2>Duplicate Vendor Checker</h2><p class="muted">Find likely duplicate vendor records by email, phone or business name. Nothing merges automatically.</p></div><button id="pxFindDup" class="secondary">Find Duplicates</button></div><div id="pxDupResults"></div>';
 panel.appendChild(section);section.querySelector("#pxFindDup").onclick=showDuplicates;
}
function duplicateGroups(){
 const vs=S().vendors,keyMap=new Map();
 const add=(key,v)=>{if(!key)return;if(!keyMap.has(key))keyMap.set(key,new Set());keyMap.get(key).add(v)};
 vs.forEach(v=>{add("e:"+String(v.email||"").trim().toLowerCase(),v);add("p:"+String(v.phone||"").replace(/\D/g,"").slice(-10),v);add("b:"+String(v.business_name||"").toLowerCase().replace(/[^a-z0-9]+/g,"").trim(),v)});
 const sigs=new Map();for(const set of keyMap.values())if(set.size>1){const arr=[...set],sig=arr.map(v=>v.id).sort().join("|");sigs.set(sig,arr)}return [...sigs.values()];
}
function showDuplicates(){
 const host=$("pxDupResults"),groups=duplicateGroups();host.innerHTML=groups.length?'<div class="list" style="margin-top:12px">'+groups.map((g,i)=>'<div class="item"><b>'+g.length+' possible duplicate records</b>'+g.map((v,j)=>'<p>'+esc(v.business_name)+' • '+esc(v.contact_name||"")+' • '+esc(v.email||"")+' • '+esc(v.phone||"")+(j?'<br><button class="danger" data-merge="'+v.id+'" data-keep="'+g[0].id+'">Merge into '+esc(g[0].business_name)+'</button>':'<br><span class="chip">Keep this record</span>')+'</p>').join("")+'</div>').join("")+'</div>':'<div class="notice success" style="margin-top:12px">No likely duplicates found.</div>';
 host.querySelectorAll("[data-merge]").forEach(b=>b.onclick=async()=>{if(!confirm("Merge this vendor into the selected master record? Booking, invoice, payment and communication history will be moved."))return;try{await op("merge_vendors",{keep_vendor_id:b.dataset.keep,merge_vendor_id:b.dataset.merge});await refresh();toast("Vendor records merged.")}catch(e){fail(e)}});
}

/* REPORT + EVENT AUGMENTS */
function augmentReports(){
 const panel=$("reportsPanel");if(!panel||panel.querySelector("#pxParityReport"))return;
 const recovery=recoveryRows().length,noShows=extra.bookings.filter(b=>b.attendance_state==="no_show"||b.status==="no_show").length,credits=extra.credits.filter(c=>["available","partially_used"].includes(c.status)).reduce((n,c)=>n+Number(c.remaining_amount||0),0),failures=extra.outbox.filter(o=>o.status==="failed").length,shopperCount=extra.rsvps.reduce((n,r)=>n+Number(r.party_size||1),0);
 const sec=document.createElement("section");sec.id="pxParityReport";sec.className="item selected";sec.style.marginTop="14px";sec.innerHTML='<h3>Operations Health</h3><div class="metric-row"><div class="mini-metric"><b>'+recovery+'</b>Application recovery</div><div class="mini-metric"><b>'+noShows+'</b>No-shows</div><div class="mini-metric"><b>'+money(credits)+'</b>Outstanding credits</div><div class="mini-metric"><b>'+failures+'</b>Email failures</div></div><p class="muted">'+shopperCount+' shoppers currently represented by RSVP records.</p>';panel.querySelector(".panel")?.appendChild(sec);
}
function augmentEvents(){
 const panel=$("eventsPanel");if(!panel)return;
 panel.querySelectorAll("[data-space]").forEach(b=>{const card=b.closest(".item"),id=b.dataset.space;if(!card||card.querySelector('[data-archive-event]'))return;const btn=document.createElement("button");btn.className="secondary";btn.dataset.archiveEvent=id;btn.textContent="Archive Event";card.querySelector(".actions")?.appendChild(btn);btn.onclick=()=>archiveEvent(id).catch(fail)});
 if(!panel.querySelector("#pxArchivedEvents")){
  const archived=extra.allEvents.filter(e=>e.archived_at);const sec=document.createElement("section");sec.id="pxArchivedEvents";sec.className="panel";sec.innerHTML='<h2>Archived Events</h2>'+(archived.length?'<div class="list">'+archived.map(e=>'<div class="item"><div class="itemtop"><div><b>'+esc(e.name)+'</b><div class="muted">'+esc(date(e.starts_at))+' • Archived '+esc(date(e.archived_at))+'</div></div><button class="secondary" data-restore-event="'+e.id+'">Restore</button></div></div>').join("")+'</div>':'<div class="empty">No archived events.</div>');panel.appendChild(sec);sec.querySelectorAll("[data-restore-event]").forEach(b=>b.onclick=()=>restoreEvent(b.dataset.restoreEvent).catch(fail));
 }
}
async function archiveEvent(id){if(!confirm("Archive this event? It will disappear from active event lists but its history will be kept."))return;const e=extra.allEvents.find(x=>x.id===id),r=await sb().from("events").update({archived_at:new Date().toISOString(),status:e?.status==="published"?"closed":e?.status,updated_at:new Date().toISOString()}).eq("id",id);if(r.error)throw r.error;await refresh();toast("Event archived.")}
async function restoreEvent(id){const r=await sb().from("events").update({archived_at:null,status:"draft",updated_at:new Date().toISOString()}).eq("id",id);if(r.error)throw r.error;await refresh();toast("Event restored.")}

function scheduleLoad(){setTimeout(()=>{if(!S()?.org?.id){setTimeout(scheduleLoad,200);return}loadExtra();setTimeout(renderAll,450)},140)}
window.addEventListener("ventryvo:workspace-rendered",scheduleLoad);
scheduleLoad();
