
const byId=id=>document.getElementById(id);
let data={applications:[],bookings:[],invoices:[],payments:[],checkins:[],expenses:[],categories:[],appSettings:null,invoiceSettings:null,commSettings:null,paymentConnections:[],subscription:null,plans:[],members:[]};
let loading=false,queued=false;

function core(){return window.VENTRYVO_CORE||null}
function esc(v){return core()?.esc(v)??String(v??"")}
function money(v){return core()?.money(v)??("$"+Number(v||0).toFixed(2))}
function toast(v){core()?.toast(v)}
function canManage(){return !!core()?.canManage()}
function canAdmin(){return !!core()?.canAdmin()}
function st(){return core()?.state}
function chip(status){
 const s=String(status||"unknown");
 return '<span class="chip status-'+esc(s.replace(/[^a-z0-9_]+/gi,"_").toLowerCase())+'">'+esc(s.replaceAll("_"," "))+'</span>';
}
function vendorName(id){return st()?.vendors.find(x=>x.id===id)?.business_name||"Vendor"}
function eventName(id){return st()?.events.find(x=>x.id===id)?.name||"Event"}
function spaceName(id){return st()?.spaceTypes.find(x=>x.id===id)?.name||""}
function catName(id){return data.categories.find(x=>x.id===id)?.name||""}
function fmtDate(v){return v?new Date(v).toLocaleDateString():""}
function fmtDateTime(v){return v?new Date(v).toLocaleString():""}
function appUrl(e){return location.origin+"/apply/"+encodeURIComponent(st().org.slug)+"/"+encodeURIComponent(e.public_slug||"")}
function payUrl(inv){return location.origin+"/pay/"+encodeURIComponent(inv.public_token)}
async function edge(name,body){
 const {data:x,error}=await core().sb.functions.invoke(name,{body});
 if(error)throw error;if(x?.error)throw new Error(x.error);return x;
}
async function refresh(){await core().loadWorkspace()}
function fail(e){console.error(e);toast(e?.message||String(e)||"Something went wrong.")}

async function load(){
 if(!core()?.state?.org?.id)return;
 if(loading){queued=true;return}
 loading=true;
 try{
  const sb=core().sb,org=st().org.id;
  const r=await Promise.all([
   sb.from("event_applications").select("*").eq("organization_id",org).order("submitted_at",{ascending:false}),
   sb.from("bookings").select("*").eq("organization_id",org).order("created_at",{ascending:false}),
   sb.from("invoices").select("*").eq("organization_id",org).order("created_at",{ascending:false}),
   sb.from("payments").select("*").eq("organization_id",org).order("received_at",{ascending:false}),
   sb.from("check_ins").select("*").eq("organization_id",org).order("checked_in_at",{ascending:false}),
   sb.from("expenses").select("*").eq("organization_id",org).order("occurred_on",{ascending:false}),
   sb.from("event_categories").select("*").eq("organization_id",org).order("name"),
   sb.from("application_settings").select("*").eq("organization_id",org).maybeSingle(),
   sb.from("invoice_settings").select("*").eq("organization_id",org).maybeSingle(),
   sb.from("communication_settings").select("*").eq("organization_id",org).maybeSingle(),
   sb.from("payment_connections").select("*").eq("organization_id",org).order("provider"),
   sb.from("subscriptions").select("*").eq("organization_id",org).maybeSingle(),
   sb.from("plans").select("*").eq("active",true).order("sort_order")
  ]);
  for(const x of r)if(x.error)throw x.error;
  [data.applications,data.bookings,data.invoices,data.payments,data.checkins,data.expenses,data.categories]=r.slice(0,7).map(x=>x.data||[]);
  data.appSettings=r[7].data||null;data.invoiceSettings=r[8].data||null;data.commSettings=r[9].data||null;
  data.paymentConnections=r[10].data||[];data.subscription=r[11].data||null;data.plans=r[12].data||[];
  renderAll();
 }catch(e){fail(e)}
 finally{loading=false;if(queued){queued=false;load()}}
}

function renderAll(){
 renderEvents();renderApplications();renderBookings();renderBilling();renderCheckin();renderStaff();renderReports();renderSettings();
}

function renderEvents(){
 const panel=byId("eventsPanel");if(!panel)return;
 const s=st();
 let html='<section class="panel"><div class="itemtop"><div><div class="kicker">Events</div><h2>Your event calendar</h2><p class="muted">Configure categories, inventory, and the public vendor application for each event.</p></div><button id="opsAddEvent" class="primary">Add Event</button></div>';
 if(!s.events.length)html+='<div class="empty">No events yet. Use Setup to create your first event.</div>';
 else html+='<div class="list">'+s.events.map(e=>{
  const loc=s.locations.find(l=>l.id===e.location_id),types=s.spaceTypes.filter(x=>x.event_id===e.id),cats=data.categories.filter(x=>x.event_id===e.id&&x.status==="active");
  const spots=types.reduce((n,x)=>n+Number(x.quantity||0),0),potential=types.reduce((n,x)=>n+Number(x.quantity||0)*Number(x.price||0),0);
  const link=e.status==="published"?appUrl(e):"";
  return '<article class="item"><div class="itemtop"><div><b>'+esc(e.name)+'</b><div class="muted">'+esc(core().eventDateLabel(e.starts_at,e.timezone))+'</div><div class="muted">'+esc(loc?.name||e.venue_name||"")+'</div></div>'+chip(e.status)+'</div>'
   +'<div style="margin-top:8px"><span class="chip">'+spots+' spaces</span><span class="chip">'+cats.length+' categories</span><span class="chip">'+money(potential)+' potential revenue</span></div>'
   +(link?'<div class="linkbox" style="margin-top:12px"><input readonly value="'+esc(link)+'"><button class="secondary" data-copy-app="'+esc(link)+'">Copy</button><a class="btn secondary" target="_blank" href="'+esc(link)+'">Open Application</a></div>':'')
   +'<div class="actions"><button class="secondary" data-space="'+e.id+'">Configure Spaces</button><button class="secondary" data-cat="'+e.id+'">Categories</button>'
   +(canManage()?'<button class="'+(e.status==="published"?'secondary':'primary')+'" data-publish="'+e.id+'">'+(e.status==="published"?'Unpublish':'Publish Applications')+'</button>':'')
   +'</div><div id="categoryEditor-'+e.id+'" class="hidden"></div></article>';
 }).join("")+'</div>';
 html+='</section>';panel.innerHTML=html;
 byId("opsAddEvent").onclick=()=>{core().setPanel("setup");document.querySelector('[data-step="event"]')?.click()};
 document.querySelectorAll("[data-space]").forEach(b=>b.onclick=()=>{s.selectedEventId=b.dataset.space;core().setPanel("setup");byId("spaceEvent").value=b.dataset.space;document.querySelector('[data-step="spaces"]')?.click()});
 document.querySelectorAll("[data-copy-app]").forEach(b=>b.onclick=async()=>{await navigator.clipboard.writeText(b.dataset.copyApp);toast("Application link copied.")});
 document.querySelectorAll("[data-cat]").forEach(b=>b.onclick=()=>showCategories(b.dataset.cat));
 document.querySelectorAll("[data-publish]").forEach(b=>b.onclick=()=>togglePublish(b.dataset.publish).catch(fail));
}
function showCategories(eventId){
 const host=byId("categoryEditor-"+eventId);if(!host)return;
 host.classList.toggle("hidden");if(host.classList.contains("hidden"))return;
 const rows=data.categories.filter(c=>c.event_id===eventId);
 host.innerHTML='<div class="item selected" style="margin-top:12px"><b>Vendor categories</b><p class="muted">Set a category limit to prevent too many similar vendors.</p>'
 +(rows.length?rows.map(c=>'<div class="item" style="margin-top:8px"><div class="itemtop"><div><b>'+esc(c.name)+'</b><div class="muted">'+(c.max_vendors==null?'No limit':esc(c.max_vendors)+' vendor max')+(Number(c.fee||0)?' • '+money(c.fee)+' extra fee':'')+'</div></div>'+chip(c.status)+'</div></div>').join(""):'<div class="empty">No categories yet.</div>')
 +(canManage()?'<form id="catForm-'+eventId+'" class="grid3" style="margin-top:12px"><div class="field"><label>Category</label><input name="name" required placeholder="Candles"></div><div class="field"><label>Max vendors</label><input name="max" type="number" min="1" placeholder="No limit"></div><div class="field"><label>Extra fee</label><input name="fee" type="number" min="0" step=".01" value="0"></div><div class="actions"><button class="primary">Add Category</button></div></form>':'')+'</div>';
 const form=byId("catForm-"+eventId);if(form)form.onsubmit=e=>saveCategory(e,eventId).catch(fail);
}
async function saveCategory(e,eventId){
 e.preventDefault();const f=new FormData(e.currentTarget),name=String(f.get("name")||"").trim();if(!name)throw new Error("Category name is required.");
 const existing=data.categories.find(c=>c.event_id===eventId&&c.name.toLowerCase()===name.toLowerCase());
 const payload={organization_id:st().org.id,event_id:eventId,name,max_vendors:f.get("max")?Number(f.get("max")):null,fee:Number(f.get("fee")||0),status:"active",updated_at:new Date().toISOString()};
 const q=existing?core().sb.from("event_categories").update(payload).eq("id",existing.id):core().sb.from("event_categories").insert(payload);
 const r=await q;if(r.error)throw r.error;await refresh();toast("Category saved.");
}
async function togglePublish(eventId){
 const e=st().events.find(x=>x.id===eventId);if(!e)return;
 if(e.status!=="published"){
  if(!st().spaceTypes.some(x=>x.event_id===eventId&&x.status!=="hidden"))throw new Error("Add at least one space type before publishing.");
  if(!data.categories.some(x=>x.event_id===eventId&&x.status==="active"))throw new Error("Add at least one vendor category before publishing.");
 }
 const status=e.status==="published"?"draft":"published";
 const slug=e.public_slug||String(e.name+"-"+String(e.starts_at||"").slice(0,10)).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
 const r=await core().sb.from("events").update({status,public_slug:slug,updated_at:new Date().toISOString()}).eq("id",eventId);
 if(r.error)throw r.error;await refresh();toast(status==="published"?"Vendor applications are live.":"Vendor applications unpublished.");
}

function renderApplications(){
 const panel=byId("applicationsPanel");if(!panel)return;
 const status=panel.dataset.status||"all",eventId=panel.dataset.event||"all";
 const rows=data.applications.filter(a=>(status==="all"||a.status===status)&&(eventId==="all"||a.event_id===eventId));
 let html='<section class="panel"><div class="kicker">Application review</div><h2>Vendor Applications</h2><p class="muted">Approving a vendor creates a booking and, when enabled, an invoice.</p><div class="vendor-toolbar"><div class="field"><label>Status</label><select id="opsAppStatus"><option value="all">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="waitlist">Wait list</option><option value="declined">Declined</option><option value="cancelled">Cancelled</option></select></div><div class="field"><label>Event</label><select id="opsAppEvent"><option value="all">All events</option>'+st().events.map(e=>'<option value="'+e.id+'">'+esc(e.name)+'</option>').join("")+'</select></div></div>';
 if(!rows.length)html+='<div class="empty">No applications match this view.</div>';
 else html+='<div class="list">'+rows.map(a=>{const v=st().vendors.find(x=>x.id===a.vendor_id),what=a.application_data?.what_they_sell||v?.what_they_sell||"",reason=a.application_data?.waitlist_reason||a.application_data?.decline_reason||"";return '<article class="item"><div class="itemtop"><div><b>'+esc(v?.business_name||"Unknown vendor")+'</b><div class="muted">'+esc(eventName(a.event_id))+' • '+esc(spaceName(a.space_type_id)||a.requested_space||"")+' • '+esc(catName(a.event_category_id)||a.category||"")+'</div><small class="muted">Submitted '+esc(fmtDateTime(a.submitted_at))+'</small></div>'+chip(a.status)+'</div>'+(what?'<p><b>What they sell:</b> '+esc(what)+'</p>':'')+(reason?'<div class="notice warn">'+esc(reason)+'</div>':'')+(canManage()&&["pending","waitlist","declined"].includes(a.status)?'<div class="actions"><button class="primary" data-decision="approved" data-app="'+a.id+'">Approve</button><button class="secondary" data-decision="waitlist" data-app="'+a.id+'">Wait List</button><button class="danger" data-decision="declined" data-app="'+a.id+'">Decline</button></div>':'')+'</article>'}).join("")+'</div>';
 html+='</section>';panel.innerHTML=html;
 byId("opsAppStatus").value=status;byId("opsAppEvent").value=eventId;
 byId("opsAppStatus").onchange=function(){panel.dataset.status=this.value;renderApplications()};
 byId("opsAppEvent").onchange=function(){panel.dataset.event=this.value;renderApplications()};
 document.querySelectorAll("[data-decision]").forEach(b=>b.onclick=()=>reviewApplication(b.dataset.app,b.dataset.decision).catch(fail));
}
async function reviewApplication(id,decision){
 let reason="";if(decision!=="approved")reason=prompt(decision==="waitlist"?"Why is this vendor being wait-listed? (optional)":"Reason for decline (optional):","")||"";
 const x=await edge("application-review-api",{organization_id:st().org.id,application_id:id,decision,reason});
 await refresh();toast(x.decision==="approved"?"Approved. Booking created.":x.decision==="waitlist"?"Moved to wait list.":"Application declined.");
}

function renderBookings(){
 const panel=byId("bookingsPanel");if(!panel)return;
 const eventId=panel.dataset.event||"all",rows=data.bookings.filter(b=>eventId==="all"||b.event_id===eventId);
 let html='<section class="panel"><div class="kicker">Vendor bookings</div><h2>Bookings</h2><p class="muted">Approved vendors, booth assignments, and payment status.</p><div class="field" style="max-width:420px"><label>Event</label><select id="opsBookingEvent"><option value="all">All events</option>'+st().events.map(e=>'<option value="'+e.id+'">'+esc(e.name)+'</option>').join("")+'</select></div>';
 if(!rows.length)html+='<div class="empty">No bookings yet.</div>';else html+='<div class="list">'+rows.map(b=>'<article class="item"><div class="itemtop"><div><b>'+esc(vendorName(b.vendor_id))+'</b><div class="muted">'+esc(eventName(b.event_id))+' • '+esc(spaceName(b.space_type_id)||b.space_type||"Space")+'</div></div>'+chip(b.status)+'</div><div style="margin-top:8px"><span class="chip">Due '+money(b.amount_due)+'</span><span class="chip">Paid '+money(b.amount_paid)+'</span>'+(b.space_label?'<span class="chip">Booth '+esc(b.space_label)+'</span>':'')+'</div>'+(canManage()?'<div class="actions"><button class="secondary" data-booth="'+b.id+'">Assign Booth</button>'+(b.status!=="cancelled"?'<button class="danger" data-cancel-booking="'+b.id+'">Cancel Booking</button>':'')+'</div>':'')+'</article>').join("")+'</div>';
 html+='</section>';panel.innerHTML=html;byId("opsBookingEvent").value=eventId;byId("opsBookingEvent").onchange=function(){panel.dataset.event=this.value;renderBookings()};
 document.querySelectorAll("[data-booth]").forEach(b=>b.onclick=()=>assignBooth(b.dataset.booth).catch(fail));
 document.querySelectorAll("[data-cancel-booking]").forEach(b=>b.onclick=()=>cancelBooking(b.dataset.cancelBooking).catch(fail));
}
async function assignBooth(id){const b=data.bookings.find(x=>x.id===id),label=prompt("Booth / space label:",b?.space_label||"");if(label===null)return;const r=await core().sb.from("bookings").update({space_label:label.trim()||null,updated_at:new Date().toISOString()}).eq("id",id);if(r.error)throw r.error;await refresh();toast("Booth assignment saved.")}
async function cancelBooking(id){if(!confirm("Cancel this booking?"))return;const r=await core().sb.from("bookings").update({status:"cancelled",updated_at:new Date().toISOString()}).eq("id",id);if(r.error)throw r.error;await refresh();toast("Booking cancelled.")}

function renderBilling(){
 const panel=byId("billingPanel");if(!panel)return;
 const collected=data.payments.filter(p=>["recorded","completed"].includes(p.status)).reduce((n,p)=>n+Number(p.amount||0),0);
 const outstanding=data.invoices.filter(i=>!["cancelled","void","paid"].includes(i.status)).reduce((n,i)=>n+Number(i.balance_due||0),0);
 let html='<section class="panel"><div class="kicker">Accounts receivable</div><h2>Billing & Payments</h2><div class="metric-row"><div class="mini-metric"><b>'+money(collected)+'</b>Collected</div><div class="mini-metric"><b>'+money(outstanding)+'</b>Outstanding</div><div class="mini-metric"><b>'+data.invoices.filter(i=>i.status==="paid").length+'</b>Paid invoices</div><div class="mini-metric"><b>'+data.invoices.filter(i=>i.status==="partial").length+'</b>Partial invoices</div></div>';
 if(!data.invoices.length)html+='<div class="empty">No invoices yet. Approving an application can create one automatically.</div>';else html+='<div class="list">'+data.invoices.map(inv=>'<article class="item"><div class="itemtop"><div><b>'+esc(inv.invoice_number||"Invoice")+' — '+esc(vendorName(inv.vendor_id))+'</b><div class="muted">'+esc(inv.event_id?eventName(inv.event_id):"")+(inv.due_at?' • Due '+esc(fmtDate(inv.due_at)):'')+'</div></div>'+chip(inv.status)+'</div><div style="margin-top:8px"><span class="chip">Total '+money(inv.total)+'</span><span class="chip">Balance '+money(inv.balance_due)+'</span></div><div class="actions"><a class="btn secondary" target="_blank" href="'+esc(payUrl(inv))+'">Payment Page</a><button class="secondary" data-copy-pay="'+esc(payUrl(inv))+'">Copy Pay Link</button>'+(canManage()&&Number(inv.balance_due)>0&&!["cancelled","void"].includes(inv.status)?'<button class="primary" data-manual="'+inv.id+'">Record Payment</button><button class="danger" data-cancel-invoice="'+inv.id+'">Cancel Invoice</button>':'')+'</div></article>').join("")+'</div>';
 html+='</section>';panel.innerHTML=html;
 document.querySelectorAll("[data-copy-pay]").forEach(b=>b.onclick=async()=>{await navigator.clipboard.writeText(b.dataset.copyPay);toast("Payment link copied.")});
 document.querySelectorAll("[data-manual]").forEach(b=>b.onclick=()=>recordPayment(b.dataset.manual).catch(fail));
 document.querySelectorAll("[data-cancel-invoice]").forEach(b=>b.onclick=()=>cancelInvoice(b.dataset.cancelInvoice).catch(fail));
}
async function recordPayment(id){
 const inv=data.invoices.find(x=>x.id===id),raw=prompt("Payment amount:",String(inv?.balance_due||""));if(raw===null)return;const amount=Number(raw);if(!(amount>0))throw new Error("Enter a valid amount.");
 const method=prompt("Payment method (Cash, Check, Zelle, Venmo, etc.):","Manual")||"Manual",reference=prompt("Reference / transaction number (optional):","")||"";
 await edge("billing-api",{organization_id:st().org.id,action:"record_manual_payment",invoice_id:id,amount,method,reference});await refresh();toast("Payment recorded.");
}
async function cancelInvoice(id){if(!confirm("Cancel this invoice?"))return;const reason=prompt("Cancellation reason (optional):","")||"";await edge("billing-api",{organization_id:st().org.id,action:"cancel_invoice",invoice_id:id,reason});await refresh();toast("Invoice cancelled.")}

function renderCheckin(){
 const panel=byId("checkinPanel");if(!panel)return;
 const eventId=panel.dataset.event||st().events.find(e=>e.starts_at&&new Date(e.starts_at)>=new Date())?.id||st().events[0]?.id||"";
 const rows=data.bookings.filter(b=>b.event_id===eventId&&b.status!=="cancelled");
 let html='<section class="panel"><div class="kicker">Event day</div><h2>Vendor Check-In</h2><div class="field" style="max-width:440px"><label>Event</label><select id="opsCheckEvent">'+st().events.map(e=>'<option value="'+e.id+'">'+esc(e.name)+'</option>').join("")+'</select></div>';
 if(!rows.length)html+='<div class="empty">No active bookings for this event.</div>';else html+='<div class="list">'+rows.map(b=>{const ci=data.checkins.find(c=>c.booking_id===b.id||(!c.booking_id&&c.vendor_id===b.vendor_id&&c.event_id===b.event_id));return '<article class="item"><div class="itemtop"><div><b>'+esc(vendorName(b.vendor_id))+'</b><div class="muted">'+esc(b.space_label?"Booth "+b.space_label:(spaceName(b.space_type_id)||b.space_type||""))+' • '+money(b.amount_paid)+' paid</div></div>'+(ci?'<span class="chip status-approved">Checked in '+esc(new Date(ci.checked_in_at).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"}))+'</span>':'<span class="chip">Not checked in</span>')+'</div><div class="actions">'+(!ci?'<button class="primary" data-checkin="'+b.id+'">Check In</button>':(canManage()?'<button class="secondary" data-undo-checkin="'+ci.id+'">Undo</button>':''))+'</div></article>'}).join("")+'</div>';
 html+='</section>';panel.innerHTML=html;if(byId("opsCheckEvent")){byId("opsCheckEvent").value=eventId;byId("opsCheckEvent").onchange=function(){panel.dataset.event=this.value;renderCheckin()}}
 document.querySelectorAll("[data-checkin]").forEach(b=>b.onclick=()=>checkin(b.dataset.checkin).catch(fail));document.querySelectorAll("[data-undo-checkin]").forEach(b=>b.onclick=()=>undoCheckin(b.dataset.undoCheckin).catch(fail));
}
async function checkin(id){const b=data.bookings.find(x=>x.id===id);if(!b)return;const r=await core().sb.from("check_ins").insert({organization_id:st().org.id,event_id:b.event_id,vendor_id:b.vendor_id,booking_id:b.id,checked_in_by:st().user.id});if(r.error)throw r.error;await refresh();toast("Vendor checked in.")}
async function undoCheckin(id){const r=await core().sb.from("check_ins").delete().eq("id",id);if(r.error)throw r.error;await refresh();toast("Check-in removed.")}

function renderStaff(){
 const panel=byId("staffPanel");if(!panel)return;
 let html='<section class="panel"><div class="itemtop"><div><div class="kicker">Permissions</div><h2>Staff & Team</h2><p class="muted">Owners and admins manage access. Managers can operate events; staff can perform check-in.</p></div>'+(canAdmin()?'<button id="opsLoadTeam" class="primary">Load Team</button>':'')+'</div><div id="opsTeam">'+(data.members.length?teamHtml():'<div class="empty">Load the team directory to manage staff.</div>')+'</div>';
 if(canAdmin())html+='<div class="item selected" style="margin-top:14px"><b>Invite team member</b><form id="opsInviteTeam" class="grid2" style="margin-top:10px"><div class="field"><label>Name</label><input name="name"></div><div class="field"><label>Email</label><input name="email" type="email" required></div><div class="field"><label>Role</label><select name="role"><option value="admin">Admin</option><option value="manager">Manager</option><option value="staff">Staff</option><option value="read_only">Read only</option></select></div><div class="actions"><button class="primary">Send Invitation</button></div></form></div>';
 html+='</section>';panel.innerHTML=html;
 if(byId("opsLoadTeam"))byId("opsLoadTeam").onclick=()=>loadTeam().catch(fail);if(byId("opsInviteTeam"))byId("opsInviteTeam").onsubmit=e=>inviteTeam(e).catch(fail);wireTeam();
}
function teamHtml(){return '<div class="list">'+data.members.map(m=>{const p=m.profiles||{};return '<div class="item"><div class="itemtop"><div><b>'+esc(p.full_name||p.email||m.user_id)+'</b><div class="muted">'+esc(p.email||"")+'</div></div>'+chip(m.status)+'</div><div class="actions"><span class="chip">'+esc(m.role)+'</span>'+(canAdmin()&&m.role!=="owner"?'<select data-role="'+m.id+'" style="max-width:180px"><option value="admin">Admin</option><option value="manager">Manager</option><option value="staff">Staff</option><option value="read_only">Read only</option></select><button class="secondary" data-toggle-member="'+m.id+'" data-status="'+m.status+'">'+(m.status==="active"?"Disable":"Enable")+'</button>':'')+'</div></div>'}).join("")+'</div>'}
async function loadTeam(){const x=await edge("customer-admin-api",{organization_id:st().org.id,action:"list_members"});data.members=x.members||[];renderStaff()}
function wireTeam(){document.querySelectorAll("[data-role]").forEach(s=>{const m=data.members.find(x=>x.id===s.dataset.role);if(m)s.value=m.role;s.onchange=()=>updateMember(s.dataset.role,{role:s.value}).catch(fail)});document.querySelectorAll("[data-toggle-member]").forEach(b=>b.onclick=()=>updateMember(b.dataset.toggleMember,{status:b.dataset.status==="active"?"disabled":"active"}).catch(fail))}
async function inviteTeam(e){e.preventDefault();const f=new FormData(e.currentTarget);await edge("customer-admin-api",{organization_id:st().org.id,action:"invite_member",email:String(f.get("email")||"").trim(),full_name:String(f.get("name")||"").trim(),role:f.get("role")});e.currentTarget.reset();await loadTeam();toast("Team invitation processed.")}
async function updateMember(id,patch){await edge("customer-admin-api",{organization_id:st().org.id,action:"update_member",membership_id:id,...patch});await loadTeam();toast("Team access updated.")}

function renderReports(){
 const collected=data.payments.filter(p=>["recorded","completed"].includes(p.status)).reduce((n,p)=>n+Number(p.amount||0),0),outstanding=data.invoices.filter(i=>!["paid","cancelled","void"].includes(i.status)).reduce((n,i)=>n+Number(i.balance_due||0),0),expenses=data.expenses.filter(e=>e.status!=="cancelled").reduce((n,e)=>n+Number(e.amount||0),0);
 let html='<section class="panel"><div class="kicker">Performance</div><h2>Reports</h2><div class="metric-row"><div class="mini-metric"><b>'+money(collected)+'</b>Collected</div><div class="mini-metric"><b>'+money(outstanding)+'</b>Accounts receivable</div><div class="mini-metric"><b>'+money(expenses)+'</b>Expenses</div><div class="mini-metric"><b>'+money(collected-expenses)+'</b>Net cash</div></div><div class="split"><div><h3>Applications</h3>'+["pending","approved","waitlist","declined","cancelled"].map(x=>'<div class="item"><b>'+data.applications.filter(a=>a.status===x).length+'</b> '+esc(x)+'</div>').join("")+'</div><div><h3>Operations</h3><div class="item"><b>'+st().vendors.length+'</b> vendors</div><div class="item"><b>'+data.bookings.filter(b=>b.status!=="cancelled").length+'</b> active bookings</div><div class="item"><b>'+data.checkins.length+'</b> check-ins</div><div class="item"><b>'+data.invoices.length+'</b> invoices</div></div></div>';
 if(canManage())html+='<div class="item selected" style="margin-top:14px"><b>Record expense</b><form id="opsExpense" class="grid3" style="margin-top:10px"><div class="field"><label>Payee</label><input name="payee" required></div><div class="field"><label>Amount</label><input name="amount" type="number" min="0" step=".01" required></div><div class="field"><label>Category</label><input name="category" placeholder="Venue, advertising…"></div><div class="field"><label>Date</label><input name="date" type="date" value="'+new Date().toISOString().slice(0,10)+'"></div><div class="field"><label>Event</label><select name="event"><option value="">General</option>'+st().events.map(e=>'<option value="'+e.id+'">'+esc(e.name)+'</option>').join("")+'</select></div><div class="actions"><button class="primary">Record Expense</button></div></form></div>';
 html+='</section>';byId("reportsPanel").innerHTML=html;if(byId("opsExpense"))byId("opsExpense").onsubmit=e=>saveExpense(e).catch(fail);
}
async function saveExpense(e){e.preventDefault();const f=new FormData(e.currentTarget),r=await core().sb.from("expenses").insert({organization_id:st().org.id,event_id:f.get("event")||null,payee:String(f.get("payee")||"").trim(),amount:Number(f.get("amount")||0),category:String(f.get("category")||"").trim()||null,occurred_on:f.get("date")||new Date().toISOString().slice(0,10),status:"recorded",recorded_by:st().user.id});if(r.error)throw r.error;await refresh();toast("Expense recorded.")}

function renderSettings(){
 const a=data.appSettings||{},i=data.invoiceSettings||{},c=data.commSettings||{},sub=data.subscription,plan=data.plans.find(p=>p.id===sub?.plan_id);
 let html='<section class="panel"><div class="kicker">Workspace configuration</div><h2>Settings</h2><div class="subnav"><button class="secondary" data-jump="applications">Applications</button><button class="secondary" data-jump="invoices">Invoices</button><button class="secondary" data-jump="email">Emails</button><button class="secondary" data-jump="payments">Vendor Payments</button><button class="secondary" data-jump="subscription">VENTRYVO Subscription</button></div>';
 html+='<div id="ops-applications" class="item"><h3>Application rules</h3><form id="opsAppSettings"><div class="grid2"><div class="field"><label>Application title</label><input name="title" value="'+esc(a.application_title||"Vendor Application")+'"></div><div class="field"><label>Minimum photos</label><input name="photos" type="number" min="0" value="'+Number(a.minimum_photos??1)+'"></div><div class="field"><label>Auto-cancel unpaid after hours</label><input name="hours" type="number" min="1" value="'+esc(a.auto_cancel_unpaid_hours||"")+'" placeholder="24"></div><div class="field"><label><input name="requirePhotos" type="checkbox" '+(a.require_photos!==false?"checked":"")+' style="width:auto"> Require photos</label><label><input name="readyRequired" type="checkbox" '+(a.require_payment_readiness_acknowledgement?"checked":"")+' style="width:auto"> Require payment-readiness acknowledgement</label></div></div><div class="field"><label>Intro text</label><textarea name="intro">'+esc(a.intro_text||"")+'</textarea></div><div class="field"><label>Vendor terms</label><textarea name="terms">'+esc(a.terms_text||"")+'</textarea></div><div class="field"><label>Payment readiness wording</label><textarea name="ready">'+esc(a.payment_readiness_text||"If approved, I am prepared to pay my invoice promptly.")+'</textarea></div>'+(canAdmin()?'<div class="actions"><button class="primary">Save Application Rules</button></div>':'')+'</form></div>';
 html+='<div id="ops-invoices" class="item" style="margin-top:12px"><h3>Invoice rules</h3><form id="opsInvoiceSettings"><div class="grid3"><div class="field"><label>Invoice prefix</label><input name="prefix" value="'+esc(i.invoice_prefix||"INV")+'"></div><div class="field"><label>Default due hours</label><input name="due" type="number" min="1" value="'+Number(i.default_due_hours||24)+'"></div><div class="field"><label>Tax rate %</label><input name="tax" type="number" min="0" step=".01" value="'+Number(i.tax_rate||0)+'"></div></div><label><input name="auto" type="checkbox" '+(i.auto_create_on_approval!==false?"checked":"")+' style="width:auto"> Auto-create invoice on approval</label><br><label><input name="manual" type="checkbox" '+(i.allow_manual_payments!==false?"checked":"")+' style="width:auto"> Allow manual payment records</label>'+(canAdmin()?'<div class="actions"><button class="primary">Save Invoice Rules</button></div>':'')+'</form></div>';
 html+='<div id="ops-email" class="item" style="margin-top:12px"><h3>Email settings</h3><form id="opsEmailSettings"><div class="grid2"><div class="field"><label>Sender name</label><input name="sender" value="'+esc(c.sender_name||st().org.name)+'"></div><div class="field"><label>Reply-to email</label><input name="reply" type="email" value="'+esc(c.reply_to_email||st().profile?.contact_email||"")+'"></div></div><div class="grid2"><label><input name="confirmation" type="checkbox" '+(c.send_application_confirmation!==false?"checked":"")+' style="width:auto"> Application confirmations</label><label><input name="approval" type="checkbox" '+(c.send_approval_email!==false?"checked":"")+' style="width:auto"> Approval emails</label><label><input name="waitlist" type="checkbox" '+(c.send_waitlist_email!==false?"checked":"")+' style="width:auto"> Wait-list emails</label><label><input name="decline" type="checkbox" '+(c.send_decline_email!==false?"checked":"")+' style="width:auto"> Decline emails</label><label><input name="receipt" type="checkbox" '+(c.send_payment_receipt!==false?"checked":"")+' style="width:auto"> Payment receipts</label></div>'+(canAdmin()?'<div class="actions"><button class="primary">Save Email Settings</button></div>':'')+'</form></div>';
 html+='<div id="ops-payments" class="item" style="margin-top:12px"><h3>Vendor payment processors</h3><p class="muted">Connect the organizer’s own merchant account. Vendor funds go directly to that organizer.</p><div class="provider-grid">'+["stripe","square","paypal"].map(p=>{const x=data.paymentConnections.find(z=>z.provider===p),connected=x?.status==="connected"&&x?.payments_enabled;return '<div class="provider-card"><b>'+p[0].toUpperCase()+p.slice(1)+'</b><p>'+chip(x?.status||"not connected")+'</p><small class="muted">'+(connected?"Payments enabled.":"Not connected.")+'</small>'+(canAdmin()?'<div class="actions"><button class="'+(connected?"secondary":"primary")+'" data-connect="'+p+'">'+(connected?"Reconnect":"Connect")+'</button>'+(x&&x.status!=="disabled"?'<button class="danger" data-disconnect="'+p+'">Disconnect</button>':'')+'</div>':'')+'</div>'}).join("")+'</div></div>';
 html+='<div id="ops-subscription" class="item" style="margin-top:12px"><h3>VENTRYVO subscription</h3><p>'+chip(sub?.status||"not configured")+' '+(plan?'<b>'+esc(plan.name)+'</b> • '+money(Number(plan.price_cents||0)/100)+' / '+esc(plan.billing_interval||""):'No plan assigned')+'</p><p class="muted">This is separate from vendor payments and pays VENTRYVO for the software.</p><div id="opsPlans"></div>'+(sub?.provider_customer_id?'<div class="actions"><button id="opsBillingPortal" class="secondary">Manage Subscription Billing</button></div>':'')+'</div>';
 html+='</section>';byId("settingsPanel").innerHTML=html;
 document.querySelectorAll("[data-jump]").forEach(b=>b.onclick=()=>byId("ops-"+b.dataset.jump)?.scrollIntoView({behavior:"smooth"}));
 if(byId("opsAppSettings"))byId("opsAppSettings").onsubmit=e=>saveAppSettings(e).catch(fail);
 if(byId("opsInvoiceSettings"))byId("opsInvoiceSettings").onsubmit=e=>saveInvoiceSettings(e).catch(fail);
 if(byId("opsEmailSettings"))byId("opsEmailSettings").onsubmit=e=>saveEmailSettings(e).catch(fail);
 document.querySelectorAll("[data-connect]").forEach(b=>b.onclick=()=>connect(b.dataset.connect).catch(fail));document.querySelectorAll("[data-disconnect]").forEach(b=>b.onclick=()=>disconnect(b.dataset.disconnect).catch(fail));
 if(byId("opsBillingPortal"))byId("opsBillingPortal").onclick=()=>billingPortal().catch(fail);
 loadPlans().catch(()=>{});
}
async function saveAppSettings(e){e.preventDefault();const f=new FormData(e.currentTarget),r=await core().sb.from("application_settings").upsert({organization_id:st().org.id,application_title:String(f.get("title")||"Vendor Application"),intro_text:String(f.get("intro")||"")||null,require_photos:f.get("requirePhotos")==="on",minimum_photos:Number(f.get("photos")||0),require_terms_acknowledgement:true,terms_text:String(f.get("terms")||"")||null,require_payment_readiness_acknowledgement:f.get("readyRequired")==="on",payment_readiness_text:String(f.get("ready")||"")||null,auto_cancel_unpaid_hours:f.get("hours")?Number(f.get("hours")):null,updated_at:new Date().toISOString()},{onConflict:"organization_id"});if(r.error)throw r.error;await refresh();toast("Application rules saved.")}
async function saveInvoiceSettings(e){e.preventDefault();const f=new FormData(e.currentTarget),r=await core().sb.from("invoice_settings").upsert({organization_id:st().org.id,invoice_prefix:String(f.get("prefix")||"INV"),default_due_hours:Number(f.get("due")||24),tax_rate:Number(f.get("tax")||0),auto_create_on_approval:f.get("auto")==="on",auto_send_on_approval:true,allow_manual_payments:f.get("manual")==="on",updated_at:new Date().toISOString()},{onConflict:"organization_id"});if(r.error)throw r.error;await refresh();toast("Invoice rules saved.")}
async function saveEmailSettings(e){e.preventDefault();const f=new FormData(e.currentTarget),r=await core().sb.from("communication_settings").upsert({organization_id:st().org.id,sender_name:String(f.get("sender")||st().org.name),reply_to_email:String(f.get("reply")||"")||null,send_application_confirmation:f.get("confirmation")==="on",send_approval_email:f.get("approval")==="on",send_waitlist_email:f.get("waitlist")==="on",send_decline_email:f.get("decline")==="on",send_invoice_email:true,send_payment_receipt:f.get("receipt")==="on",updated_at:new Date().toISOString()},{onConflict:"organization_id"});if(r.error)throw r.error;await refresh();toast("Email settings saved.")}
async function connect(provider){const x=await edge("payment-connect",{organization_id:st().org.id,action:provider+"_start"});if(x.url)location.assign(x.url);else throw new Error("No onboarding link returned.")}
async function disconnect(provider){if(!confirm("Disconnect "+provider+"?"))return;await edge("payment-connect",{organization_id:st().org.id,action:"disconnect",provider});await refresh();toast("Payment processor disconnected.")}
async function loadPlans(){const host=byId("opsPlans");if(!host)return;const x=await edge("subscription-billing",{organization_id:st().org.id,action:"list_plans"}),plans=x.plans||[];host.innerHTML=plans.length?'<div class="provider-grid">'+plans.map(p=>'<div class="provider-card"><b>'+esc(p.name)+'</b><p>'+money(p.price_cents/100)+' / '+esc(p.billing_interval||"")+'</p><small class="muted">'+esc(p.description||"")+'</small>'+(canAdmin()?'<div class="actions"><button class="primary" data-plan="'+p.id+'">Choose Plan</button></div>':'')+'</div>').join("")+'</div>':'<p class="muted">No paid self-service plans are published yet.</p>';document.querySelectorAll("[data-plan]").forEach(b=>b.onclick=()=>startSubscription(b.dataset.plan).catch(fail))}
async function startSubscription(planId){const x=await edge("subscription-billing",{organization_id:st().org.id,action:"create_checkout",plan_id:planId});if(x.url)location.assign(x.url)}
async function billingPortal(){const x=await edge("subscription-billing",{organization_id:st().org.id,action:"billing_portal"});if(x.url)location.assign(x.url)}

window.addEventListener("ventryvo:workspace-rendered",load);
if(core()?.state?.org?.id)load();
