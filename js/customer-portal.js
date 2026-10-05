import {createClient} from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from "/js/supabase-config.js";

const sb=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const byId=id=>document.getElementById(id);
const state={
 user:null,membership:null,org:null,profile:null,settings:null,progress:null,
 locations:[],events:[],spaceTypes:[],vendors:[],features:[],overrides:[],release:null,editingVendorId:null,
 counts:{events:0,vendors:0,applications:0,invoices:0},
 selectedLocationId:null,selectedEventId:null,currentStep:"business"
};

function esc(value){
 return String(value??"").replace(/[&<>"']/g,function(c){
  return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
 });
}
function slugify(value){
 return String(value||"").toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,80);
}
function money(value,currency){
 const cur=currency||state.settings?.currency||"USD";
 return new Intl.NumberFormat("en-US",{style:"currency",currency:cur}).format(Number(value||0));
}
function toast(message){
 const el=byId("toast");el.textContent=message;el.classList.remove("hidden");
 clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.add("hidden"),4200);
}
function formError(error){
 console.error(error);
 toast(error?.message||String(error)||"Something went wrong.");
}
function canManage(){
 return ["owner","admin","manager"].includes(state.membership?.role);
}
function canAdmin(){
 return ["owner","admin"].includes(state.membership?.role);
}
function fullAddress(location){
 return [location?.address_line1,location?.address_line2,location?.city,location?.state_region,location?.postal_code].filter(Boolean).join(", ");
}
function eventDateLabel(iso,timeZone){
 if(!iso)return "Date not set";
 try{
  return new Intl.DateTimeFormat("en-US",{timeZone:timeZone||state.settings?.timezone||"UTC",weekday:"short",month:"long",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(iso));
 }catch{
  return new Date(iso).toLocaleString();
 }
}
function formatParts(date,timeZone){
 const parts=new Intl.DateTimeFormat("en-US",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(date);
 const out={};parts.forEach(function(p){if(p.type!=="literal")out[p.type]=p.value;});return out;
}
function zonedLocalToIso(dateText,timeText,timeZone){
 const d=String(dateText||"").split("-").map(Number),t=String(timeText||"").split(":").map(Number);
 if(d.length!==3||!d[0]||!d[1]||!d[2])throw new Error("Choose a valid event date.");
 const target=Date.UTC(d[0],d[1]-1,d[2],t[0]||0,t[1]||0,0);
 let guess=target;
 for(let i=0;i<4;i++){
  const p=formatParts(new Date(guess),timeZone);
  const shown=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute),Number(p.second||0));
  const diff=target-shown;
  guess+=diff;
  if(Math.abs(diff)<1000)break;
 }
 return new Date(guess).toISOString();
}
function setupStatus(){
 const business=!!state.profile&&!!state.settings;
 const location=state.locations.length>0;
 const event=state.events.length>0;
 const spaces=state.spaceTypes.length>0;
 const done=[business,location,event,spaces].filter(Boolean).length;
 return {business,location,event,spaces,done,complete:business&&location&&event&&spaces};
}
function nextSetupStep(){
 const s=setupStatus();
 if(!s.business)return "business";
 if(!s.location)return "location";
 if(!s.event)return "event";
 return "spaces";
}
function stepLabel(step){
 return {business:"Business settings",location:"Location",event:"Event",spaces:"Space types"}[step]||"Setup";
}
async function requireOk(result){
 if(result?.error)throw result.error;
 return result?.data;
}
async function boot(){
 const userResult=await sb.auth.getUser();
 const user=userResult.data.user;
 if(!user){
  state.user=null;
  byId("login").classList.remove("hidden");
  byId("app").classList.add("hidden");
  return;
 }
 state.user=user;
 const membershipResult=await sb.from("organization_memberships")
  .select("role,organization_id,organizations(id,name,slug,status)")
  .eq("user_id",user.id).eq("status","active").order("created_at",{ascending:true}).limit(1).maybeSingle();
 if(membershipResult.error||!membershipResult.data){
  byId("msg").textContent="Your login works, but no active VENTRYVO organization is assigned to this account.";
  await sb.auth.signOut();return;
 }
 state.membership=membershipResult.data;
 state.org=membershipResult.data.organizations;
 byId("login").classList.add("hidden");
 byId("app").classList.remove("hidden");
 byId("orgTitle").textContent=state.org.name;
 byId("roleBadge").textContent=state.membership.role;
 await loadWorkspace();
 const s=setupStatus();
 if(!state.progress?.is_complete||!s.complete){
  state.currentStep=nextSetupStep();
  setPanel("setup");
  showSetupStep(state.currentStep);
 }else{
  setPanel("dashboard");
 }
}
async function loadWorkspace(){
 const orgId=state.org.id;
 const results=await Promise.all([
  sb.from("organization_profile").select("*").eq("organization_id",orgId).maybeSingle(),
  sb.from("organization_settings").select("*").eq("organization_id",orgId).maybeSingle(),
  sb.from("onboarding_progress").select("*").eq("organization_id",orgId).maybeSingle(),
  sb.from("locations").select("*").eq("organization_id",orgId).order("created_at"),
  sb.from("events").select("*").eq("organization_id",orgId).is("archived_at",null).order("starts_at"),
  sb.from("event_space_types").select("*").eq("organization_id",orgId).order("sort_order").order("created_at"),
  sb.from("vendors").select("*").eq("organization_id",orgId).order("business_name"),
  sb.from("event_applications").select("id",{count:"exact",head:true}).eq("organization_id",orgId),
  sb.from("invoices").select("id",{count:"exact",head:true}).eq("organization_id",orgId),
  sb.from("feature_flags").select("*").order("name"),
  sb.from("organization_feature_overrides").select("feature_flag_id,enabled").eq("organization_id",orgId),
  sb.from("platform_releases").select("*").eq("status","released").order("released_at",{ascending:false}).limit(1).maybeSingle()
 ]);
 for(const x of results){if(x.error)throw x.error;}
 state.profile=results[0].data||null;
 state.settings=results[1].data||null;
 state.progress=results[2].data||null;
 state.locations=results[3].data||[];
 state.events=results[4].data||[];
 state.spaceTypes=results[5].data||[];
 state.vendors=results[6].data||[];
 state.counts={events:state.events.length,vendors:state.vendors.length,applications:results[7].count||0,invoices:results[8].count||0};
 state.features=results[9].data||[];
 state.overrides=results[10].data||[];
 state.release=results[11].data||null;
 if(!state.selectedLocationId&&state.locations[0])state.selectedLocationId=state.locations[0].id;
 if(!state.selectedEventId&&state.events[0])state.selectedEventId=state.events[0].id;
 renderAll();
}
function renderAll(){
 byId("eventsCount").textContent=state.counts.events;
 byId("vendorsCount").textContent=state.counts.vendors;
 byId("appsCount").textContent=state.counts.applications;
 byId("invoicesCount").textContent=state.counts.invoices;
 renderSetupBanner();
 renderDashboard();
 renderSetup();
 renderEvents();
 renderVendors();
 renderPlaceholders();
 window.dispatchEvent(new CustomEvent("ventryvo:workspace-rendered"));
}
function renderSetupBanner(){
 const s=setupStatus(),banner=byId("setupBanner");
 if(state.progress?.is_complete&&s.complete){banner.classList.add("hidden");return;}
 banner.classList.remove("hidden");
 byId("setupProgressBar").style.width=(s.done/4*100)+"%";
 byId("setupBannerText").textContent=s.done+" of 4 core setup steps complete • Next: "+stepLabel(nextSetupStep());
}
function renderDashboard(){
 const s=setupStatus();
 const upcoming=state.events.filter(function(e){return e.starts_at&&new Date(e.starts_at)>=new Date();}).sort(function(a,b){return String(a.starts_at).localeCompare(String(b.starts_at));})[0];
 const flagMap=new Map(state.overrides.map(function(x){return [x.feature_flag_id,x.enabled];}));
 const enabled=state.features.filter(function(f){return flagMap.has(f.id)?flagMap.get(f.id):f.default_enabled;});
 let html='<section class="panel next-card"><div class="kicker">Workspace overview</div><h2>'+esc(state.org.name)+'</h2>';
 html+='<p class="muted">Role: '+esc(state.membership.role)+' • Account status: '+esc(state.org.status)+'</p>';
 if(!s.complete){
  html+='<div class="notice warn"><b>Core setup is '+s.done+'/4 complete.</b><br>Finish '+esc(stepLabel(nextSetupStep()))+' before moving into vendor applications and billing.</div>';
 }else{
  html+='<div class="notice success"><b>Core event setup is complete.</b><br>Your first location, event, and vendor-space inventory are ready for the next build stage.</div>';
 }
 if(upcoming){
  const types=state.spaceTypes.filter(function(x){return x.event_id===upcoming.id;});
  const total=types.reduce(function(n,x){return n+Number(x.quantity||0);},0);
  html+='<h3 style="margin-top:20px">Next event</h3><div class="item"><div class="itemtop"><div><b>'+esc(upcoming.name)+'</b><div class="muted">'+esc(eventDateLabel(upcoming.starts_at,upcoming.timezone))+'</div><div class="muted">'+esc(upcoming.venue_name||"")+'</div></div><span class="chip">'+total+' spaces</span></div></div>';
 }else{
  html+='<h3 style="margin-top:20px">Next event</h3><div class="empty">No future event has been created yet.</div>';
 }
 html+='<h3 style="margin-top:20px">Enabled features</h3><div>';
 html+=enabled.length?enabled.map(function(f){return '<span class="feature">'+esc(f.name)+'</span>';}).join(""):'<span class="muted">No optional features enabled yet.</span>';
 html+='</div>';
 if(state.release)html+='<h3 style="margin-top:20px">Latest platform release</h3><p><b>'+esc(state.release.version)+' — '+esc(state.release.title)+'</b><br><span class="muted">'+esc(state.release.notes||"")+'</span></p>';
 html+='</section>';
 byId("dashboardPanel").innerHTML=html;
}
function renderSetup(){
 const tz=state.settings?.timezone||Intl.DateTimeFormat().resolvedOptions().timeZone||"America/New_York";
 byId("businessName").value=state.org.name||"";
 byId("contactName").value=state.profile?.contact_name||state.user?.user_metadata?.full_name||"";
 byId("contactEmail").value=state.profile?.contact_email||state.user?.email||"";
 byId("contactPhone").value=state.profile?.phone||"";
 byId("websiteUrl").value=state.profile?.website_url||"";
 byId("timezone").value=tz;
 byId("currency").value=state.settings?.currency||"USD";
 byId("taxRate").value=Number(state.settings?.default_tax_rate||0);

 byId("locationList").innerHTML=state.locations.length?state.locations.map(function(l){
  const selected=l.id===state.selectedLocationId;
  return '<div class="item '+(selected?'selected':'')+'"><div class="itemtop"><div><b>'+esc(l.name)+'</b><div class="muted">'+esc(fullAddress(l)||"Address not entered")+'</div></div><button type="button" class="secondary" data-use-location="'+esc(l.id)+'">'+(selected?'Selected':'Use Location')+'</button></div></div>';
 }).join(""):'<div class="empty">No locations yet. Add your first venue below.</div>';

 const locationOptions=state.locations.map(function(l){return '<option value="'+esc(l.id)+'">'+esc(l.name)+'</option>';}).join("");
 byId("eventLocation").innerHTML=locationOptions||'<option value="">Add a location first</option>';
 if(state.selectedLocationId&&state.locations.some(function(l){return l.id===state.selectedLocationId;}))byId("eventLocation").value=state.selectedLocationId;

 const eventOptions=state.events.map(function(e){return '<option value="'+esc(e.id)+'">'+esc(e.name)+(e.starts_at?' — '+esc(eventDateLabel(e.starts_at,e.timezone)):'')+'</option>';}).join("");
 byId("spaceEvent").innerHTML=eventOptions||'<option value="">Create an event first</option>';
 if(state.selectedEventId&&state.events.some(function(e){return e.id===state.selectedEventId;}))byId("spaceEvent").value=state.selectedEventId;
 renderSpaces();
 renderFinish();
 document.querySelectorAll("[data-use-location]").forEach(function(btn){
  btn.onclick=function(){state.selectedLocationId=btn.dataset.useLocation;renderSetup();showSetupStep("event");};
 });
 if(!canAdmin()){
  ["businessName","contactName","contactEmail","contactPhone","websiteUrl","timezone","currency","taxRate"].forEach(function(id){byId(id).disabled=true;});
  byId("businessForm").querySelector('button[type="submit"]').disabled=true;
 }
}
function renderSpaces(){
 const eventId=byId("spaceEvent").value||state.selectedEventId;
 const rows=state.spaceTypes.filter(function(x){return x.event_id===eventId;});
 byId("spaceList").innerHTML=rows.length?rows.map(function(x){
  return '<div class="item"><div class="itemtop"><div><b>'+esc(x.name)+'</b><div class="muted">'+esc(x.indoor_outdoor||"Other")+' • '+Number(x.quantity||0)+' available • '+money(x.price)+'</div><small class="muted">'+esc(x.description||"")+'</small></div><span class="chip">'+(x.max_tables?esc(x.max_tables)+" tables max":"Space type")+'</span></div></div>';
 }).join(""):'<div class="empty">No space types configured for this event yet.</div>';
}
function renderFinish(){
 const s=setupStatus();
 let html='<div class="notice '+(s.complete?'success':'warn')+'"><b>'+s.done+' of 4 core steps complete.</b><br>';
 if(s.complete)html+='Your workspace has the minimum configuration needed to continue.';
 else html+='Finish '+esc(stepLabel(nextSetupStep()))+' before completing setup.';
 html+='</div>';
 if(s.complete&&!state.progress?.is_complete)html+='<div class="actions"><button id="finishSetupBtn" class="primary">Complete Core Setup</button></div>';
 if(state.progress?.is_complete)html+='<p class="muted"><b>Core setup completed.</b> You can keep adding events and space types anytime.</p>';
 byId("finishSetupArea").innerHTML=html;
 const finish=byId("finishSetupBtn");if(finish)finish.onclick=finishSetup;
}
function renderEvents(){
 let html='<section class="panel"><div class="itemtop"><div><div class="kicker">Events</div><h2>Your event calendar</h2><p class="muted">These are the events currently stored for your organization.</p></div><button id="addEventBtn" class="primary">Add Event</button></div>';
 if(!state.events.length)html+='<div class="empty">No events yet. Use Setup to create your first event.</div>';
 else html+='<div class="list">'+state.events.map(function(e){
  const loc=state.locations.find(function(l){return l.id===e.location_id;});
  const types=state.spaceTypes.filter(function(x){return x.event_id===e.id;});
  const spots=types.reduce(function(n,x){return n+Number(x.quantity||0);},0);
  const potential=types.reduce(function(n,x){return n+(Number(x.quantity||0)*Number(x.price||0));},0);
  return '<article class="item"><div class="itemtop"><div><b>'+esc(e.name)+'</b><div class="muted">'+esc(eventDateLabel(e.starts_at,e.timezone))+'</div><div class="muted">'+esc(loc?.name||e.venue_name||"")+'</div></div><span class="chip">'+esc(e.status)+'</span></div><div style="margin-top:8px"><span class="chip">'+spots+' vendor spaces</span><span class="chip">'+money(potential)+' potential booth revenue</span></div><div class="actions"><button class="secondary" data-event-spaces="'+esc(e.id)+'">Configure Spaces</button></div></article>';
 }).join("")+'</div>';
 html+='</section>';
 byId("eventsPanel").innerHTML=html;
 const add=byId("addEventBtn");if(add)add.onclick=function(){setPanel("setup");showSetupStep("event");};
 document.querySelectorAll("[data-event-spaces]").forEach(function(btn){
  btn.onclick=function(){state.selectedEventId=btn.dataset.eventSpaces;setPanel("setup");renderSetup();showSetupStep("spaces");};
 });
}

function renderVendors(){
 const panel=byId("vendorsPanel");if(!panel)return;
 const q=(panel.dataset.search||"").trim().toLowerCase();
 const status=panel.dataset.status||"all";
 const rows=state.vendors.filter(function(v){
  const hay=[v.business_name,v.contact_name,v.email,v.phone,v.category,v.what_they_sell,v.city,v.state_region].join(" ").toLowerCase();
  return (!q||hay.includes(q))&&(status==="all"||String(v.status||"active")===status);
 });
 let html='<section class="panel"><div class="itemtop"><div><div class="kicker">Vendor database</div><h2>Vendors</h2><p class="muted">Reusable vendor records for applications, bookings, communication, and reporting.</p></div><button id="newVendorBtn" class="primary">Add Vendor</button></div>';
 html+='<div class="vendor-toolbar"><div class="field"><label>Search vendors</label><input id="vendorSearch" value="'+esc(panel.dataset.search||"")+'" placeholder="Business, contact, email, phone, products…"></div><div class="field" style="max-width:220px"><label>Status</label><select id="vendorStatusFilter"><option value="all">All vendors</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="banned">Banned</option></select></div></div>';
 html+='<div id="vendorEditor"></div>';
 if(!rows.length)html+='<div class="empty">'+(state.vendors.length?'No vendors match this filter.':'No vendors yet. Add your first vendor or wait for applications to create vendor records.')+'</div>';
 else html+='<div class="list">'+rows.map(function(v){
  const cls=v.status==="banned"?"status-banned":v.status==="inactive"?"status-inactive":"status-active";
  const place=[v.city,v.state_region].filter(Boolean).join(", ");
  return '<article class="item"><div class="itemtop"><div><b>'+esc(v.business_name)+'</b><div class="muted">'+esc(v.contact_name||"No contact name")+(v.category?' • '+esc(v.category):'')+'</div></div><span class="chip '+cls+'">'+esc(v.status||"active")+'</span></div>'
   +(v.what_they_sell?'<p style="margin:9px 0"><b>What they sell:</b> '+esc(v.what_they_sell)+'</p>':'')
   +'<div class="muted">'+[v.email,v.phone,place].filter(Boolean).map(esc).join(" • ")+'</div>'
   +(v.notes?'<p class="muted">'+esc(v.notes)+'</p>':'')
   +(v.status==="banned"&&v.banned_reason?'<div class="notice warn"><b>Banned reason:</b> '+esc(v.banned_reason)+'</div>':'')
   +'<div class="actions"><button class="secondary" data-edit-vendor="'+esc(v.id)+'">Edit Vendor</button></div></article>';
 }).join("")+'</div>';
 html+='</section>';
 panel.innerHTML=html;
 const sf=byId("vendorStatusFilter");if(sf)sf.value=status;
 const search=byId("vendorSearch");if(search)search.oninput=function(){panel.dataset.search=this.value;renderVendors();};
 if(sf)sf.onchange=function(){panel.dataset.status=this.value;renderVendors();};
 const add=byId("newVendorBtn");if(add)add.onclick=function(){state.editingVendorId=null;renderVendorEditor();};
 document.querySelectorAll("[data-edit-vendor]").forEach(function(btn){btn.onclick=function(){state.editingVendorId=btn.dataset.editVendor;renderVendorEditor();};});
}
function renderVendorEditor(){
 const host=byId("vendorEditor");if(!host)return;
 const v=state.editingVendorId?state.vendors.find(function(x){return x.id===state.editingVendorId;}):null;
 host.innerHTML='<div class="item selected" style="margin-bottom:14px"><div class="itemtop"><div><b>'+(v?'Edit Vendor':'Add Vendor')+'</b><div class="muted">'+(v?'Update the reusable vendor record.':'Create a vendor record manually.')+'</div></div><button id="cancelVendorEdit" class="secondary">Cancel</button></div>'
 +'<form id="vendorForm" style="margin-top:14px"><div class="grid2">'
 +'<div class="field"><label>Business name</label><input id="vendorBusiness" required value="'+esc(v?.business_name||"")+'"></div>'
 +'<div class="field"><label>Contact name</label><input id="vendorContact" value="'+esc(v?.contact_name||"")+'"></div>'
 +'<div class="field"><label>Email</label><input id="vendorEmail" type="email" value="'+esc(v?.email||"")+'"></div>'
 +'<div class="field"><label>Phone</label><input id="vendorPhone" value="'+esc(v?.phone||"")+'"></div>'
 +'<div class="field"><label>Category</label><input id="vendorCategory" value="'+esc(v?.category||"")+'" placeholder="Example: Candles"></div>'
 +'<div class="field"><label>Status</label><select id="vendorStatus"><option value="active">Active</option><option value="inactive">Inactive</option><option value="banned">Banned</option></select></div>'
 +'<div class="field"><label>Website</label><input id="vendorWebsite" type="url" value="'+esc(v?.website||"")+'" placeholder="https://"></div>'
 +'<div class="field"><label>Facebook</label><input id="vendorFacebook" type="url" value="'+esc(v?.facebook_url||"")+'" placeholder="https://"></div>'
 +'<div class="field"><label>Instagram</label><input id="vendorInstagram" type="url" value="'+esc(v?.instagram_url||"")+'" placeholder="https://"></div>'
 +'<div class="field"><label>Street address</label><input id="vendorAddress" value="'+esc(v?.address_line1||"")+'"></div>'
 +'<div class="field"><label>City</label><input id="vendorCity" value="'+esc(v?.city||"")+'"></div>'
 +'<div class="field"><label>State / region</label><input id="vendorState" value="'+esc(v?.state_region||"")+'"></div>'
 +'<div class="field"><label>Postal code</label><input id="vendorPostal" value="'+esc(v?.postal_code||"")+'"></div>'
 +'</div>'
 +'<div class="field" style="margin-top:12px"><label>What they sell</label><textarea id="vendorSell" placeholder="Products, services, specialties…">'+esc(v?.what_they_sell||"")+'</textarea></div>'
 +'<div class="field" style="margin-top:12px"><label>Internal notes</label><textarea id="vendorNotes" placeholder="Organizer-only notes">'+esc(v?.notes||"")+'</textarea></div>'
 +'<div id="bannedReasonWrap" class="field" style="margin-top:12px"><label>Banned reason</label><textarea id="vendorBannedReason" placeholder="Required when status is banned">'+esc(v?.banned_reason||"")+'</textarea></div>'
 +'<div class="actions"><button class="primary" type="submit">'+(v?'Save Vendor':'Add Vendor')+'</button></div></form></div>';
 byId("vendorStatus").value=v?.status||"active";
 const syncBanned=function(){byId("bannedReasonWrap").classList.toggle("hidden",byId("vendorStatus").value!=="banned");};
 byId("vendorStatus").onchange=syncBanned;syncBanned();
 byId("cancelVendorEdit").onclick=function(){state.editingVendorId=null;renderVendors();};
 byId("vendorForm").onsubmit=function(e){saveVendor(e).catch(formError);};
 setTimeout(()=>byId("vendorBusiness")?.focus(),50);
}
async function saveVendor(event){
 event.preventDefault();if(!canManage())return toast("You do not have permission to manage vendors.");
 const business=byId("vendorBusiness").value.trim();if(!business)throw new Error("Business name is required.");
 const status=byId("vendorStatus").value,bannedReason=byId("vendorBannedReason").value.trim();
 if(status==="banned"&&!bannedReason)throw new Error("Enter a reason before banning a vendor.");
 const payload={
  organization_id:state.org.id,
  business_name:business,
  contact_name:byId("vendorContact").value.trim()||null,
  email:byId("vendorEmail").value.trim().toLowerCase()||null,
  phone:byId("vendorPhone").value.trim()||null,
  category:byId("vendorCategory").value.trim()||null,
  website:byId("vendorWebsite").value.trim()||null,
  facebook_url:byId("vendorFacebook").value.trim()||null,
  instagram_url:byId("vendorInstagram").value.trim()||null,
  address_line1:byId("vendorAddress").value.trim()||null,
  city:byId("vendorCity").value.trim()||null,
  state_region:byId("vendorState").value.trim()||null,
  postal_code:byId("vendorPostal").value.trim()||null,
  what_they_sell:byId("vendorSell").value.trim()||null,
  notes:byId("vendorNotes").value.trim()||null,
  status,
  banned_reason:status==="banned"?bannedReason:null,
  updated_at:new Date().toISOString()
 };
 let result;
 if(state.editingVendorId)result=await sb.from("vendors").update(payload).eq("id",state.editingVendorId).eq("organization_id",state.org.id).select().single();
 else result=await sb.from("vendors").insert(payload).select().single();
 if(result.error)throw result.error;
 state.editingVendorId=null;
 await loadWorkspace();
 setPanel("vendors");
 toast("Vendor saved.");
}

function renderPlaceholders(){
 const core=setupStatus().complete;
 const placeholders={
  applications:["Applications","Next we will connect public event applications to your configured events and space inventory, with review/approve/wait-list workflows."],
  billing:["Billing & Payments","The payment connection groundwork is in place. Next this becomes invoices, payment deadlines, Stripe/Square/PayPal checkout, receipts, credits, and refunds."],
  staff:["Staff & Permissions","Organization memberships and roles already exist. Next we will add the customer-facing staff invitation and permission controls."],
  reports:["Reports","Once bookings and payments are flowing, this will show revenue, attendance, accounts receivable, vendor activity, and event performance."]
 };
 Object.keys(placeholders).forEach(function(key){
  const p=placeholders[key];
  byId(key+"Panel").innerHTML='<section class="panel placeholder"><div class="kicker">Coming next</div><h2>'+esc(p[0])+'</h2><p class="muted">'+esc(p[1])+'</p>'+(core?'':'<div class="notice warn" style="margin-top:14px">Finish Core Setup first so these modules have an event and inventory to work with.</div>')+'</section>';
 });
}
function setPanel(name){
 document.querySelectorAll("[data-panel]").forEach(function(el){el.classList.toggle("hidden",el.dataset.panel!==name);});
 document.querySelectorAll("[data-nav]").forEach(function(btn){btn.classList.toggle("active",btn.dataset.nav===name);});
}
function showSetupStep(step){
 state.currentStep=step;
 ["business","location","event","spaces"].forEach(function(s){
  byId(s+"Step").classList.toggle("active",s===step);
  const button=document.querySelector('[data-step="'+s+'"]');if(button)button.classList.toggle("active",s===step);
 });
}
async function markProgress(completedStep,nextStep,complete){
 if(!canAdmin())return;
 const done=new Set(state.progress?.completed_steps||[]);
 if(completedStep)done.add(completedStep);
 const payload={
  organization_id:state.org.id,
  current_step:nextStep||completedStep||"welcome",
  completed_steps:Array.from(done),
  is_complete:!!complete,
  completed_at:complete?new Date().toISOString():null,
  updated_at:new Date().toISOString()
 };
 if(state.selectedEventId)payload.onboarding_event_id=state.selectedEventId;
 const result=await sb.from("onboarding_progress").upsert(payload,{onConflict:"organization_id"}).select().single();
 if(result.error)throw result.error;
 state.progress=result.data;
}
async function saveBusiness(event){
 event.preventDefault();if(!canAdmin())return toast("Only an owner or admin can change organization defaults.");
 const name=byId("businessName").value.trim(),timezone=byId("timezone").value.trim();
 if(!name)throw new Error("Organization name is required.");
 try{new Intl.DateTimeFormat("en-US",{timeZone:timezone}).format(new Date());}catch{throw new Error("Enter a valid IANA timezone, such as America/New_York.");}
 const orgUpdate=await sb.from("organizations").update({name,updated_at:new Date().toISOString()}).eq("id",state.org.id);if(orgUpdate.error)throw orgUpdate.error;
 const profileResult=await sb.from("organization_profile").upsert({
  organization_id:state.org.id,
  contact_name:byId("contactName").value.trim()||null,
  contact_email:byId("contactEmail").value.trim()||null,
  phone:byId("contactPhone").value.trim()||null,
  website_url:byId("websiteUrl").value.trim()||null,
  updated_at:new Date().toISOString()
 },{onConflict:"organization_id"});if(profileResult.error)throw profileResult.error;
 const settingsResult=await sb.from("organization_settings").upsert({
  organization_id:state.org.id,
  timezone,
  currency:byId("currency").value,
  default_tax_rate:Number(byId("taxRate").value||0),
  updated_at:new Date().toISOString()
 },{onConflict:"organization_id"});if(settingsResult.error)throw settingsResult.error;
 state.org.name=name;byId("orgTitle").textContent=name;
 await markProgress("business","location",false);
 await loadWorkspace();showSetupStep("location");toast("Business settings saved.");
}
async function saveLocation(event){
 event.preventDefault();if(!canManage())return toast("You do not have permission to add locations.");
 const name=byId("locationName").value.trim();if(!name)throw new Error("Location name is required.");
 const result=await sb.from("locations").insert({
  organization_id:state.org.id,name,
  address_line1:byId("address1").value.trim()||null,
  address_line2:byId("address2").value.trim()||null,
  city:byId("city").value.trim()||null,
  state_region:byId("stateRegion").value.trim()||null,
  postal_code:byId("postalCode").value.trim()||null,
  country_code:(byId("countryCode").value.trim()||"US").toUpperCase(),
  contact_name:byId("venueContact").value.trim()||null,
  contact_phone:byId("venuePhone").value.trim()||null,
  notes:byId("locationNotes").value.trim()||null,
  status:"active"
 }).select().single();
 if(result.error)throw result.error;
 state.selectedLocationId=result.data.id;
 await markProgress("location","event",false);
 byId("locationForm").reset();byId("countryCode").value="US";
 await loadWorkspace();showSetupStep("event");toast("Location saved.");
}
async function saveEvent(event){
 event.preventDefault();if(!canManage())return toast("You do not have permission to create events.");
 const locationId=byId("eventLocation").value,location=state.locations.find(function(l){return l.id===locationId;});
 if(!location)throw new Error("Choose a saved location first.");
 const timezone=state.settings?.timezone||Intl.DateTimeFormat().resolvedOptions().timeZone||"America/New_York";
 const startsAt=zonedLocalToIso(byId("eventDate").value,byId("startTime").value,timezone);
 const endsAt=zonedLocalToIso(byId("eventDate").value,byId("endTime").value,timezone);
 if(new Date(endsAt)<=new Date(startsAt))throw new Error("End time must be after start time.");
 const name=byId("eventName").value.trim();if(!name)throw new Error("Event name is required.");
 const dateKey=byId("eventDate").value;
 const result=await sb.from("events").insert({
  organization_id:state.org.id,
  name,
  location_id:locationId,
  venue_name:location.name,
  address:fullAddress(location)||null,
  starts_at:startsAt,
  ends_at:endsAt,
  status:"draft",
  event_type:byId("eventType").value,
  timezone,
  public_description:byId("eventDescription").value.trim()||null,
  public_slug:slugify(name+"-"+dateKey)
 }).select().single();
 if(result.error)throw result.error;
 state.selectedEventId=result.data.id;
 await markProgress("event","spaces",false);
 byId("eventForm").reset();byId("startTime").value="10:00";byId("endTime").value="15:00";
 await loadWorkspace();showSetupStep("spaces");toast("Event saved. Now add the vendor-space inventory.");
}
async function recalcEventCapacity(eventId){
 const rows=state.spaceTypes.filter(function(x){return x.event_id===eventId;});
 const capacity=rows.reduce(function(n,x){return n+Number(x.quantity||0);},0);
 const result=await sb.from("events").update({capacity,updated_at:new Date().toISOString()}).eq("id",eventId);
 if(result.error)throw result.error;
}
async function saveSpace(event){
 event.preventDefault();if(!canManage())return toast("You do not have permission to configure spaces.");
 const eventId=byId("spaceEvent").value;if(!eventId)throw new Error("Choose an event first.");
 const name=byId("spaceName").value.trim();if(!name)throw new Error("Space type name is required.");
 const payload={
  organization_id:state.org.id,event_id:eventId,name,
  description:byId("spaceDescription").value.trim()||null,
  quantity:Number(byId("spaceQuantity").value||1),
  price:Number(byId("spacePrice").value||0),
  max_tables:byId("spaceTables").value?Number(byId("spaceTables").value):null,
  indoor_outdoor:byId("spaceArea").value,
  status:"active",
  sort_order:Number(byId("spaceSort").value||0),
  updated_at:new Date().toISOString()
 };
 const result=await sb.from("event_space_types").upsert(payload,{onConflict:"event_id,name"}).select().single();
 if(result.error)throw result.error;
 state.selectedEventId=eventId;
 await loadWorkspace();
 await recalcEventCapacity(eventId);
 await markProgress("spaces","spaces",false);
 byId("spaceForm").reset();byId("spaceQuantity").value="1";byId("spacePrice").value="0";byId("spaceSort").value="0";byId("spaceArea").value="indoor";
 await loadWorkspace();showSetupStep("spaces");toast("Space type saved.");
}
async function finishSetup(){
 const s=setupStatus();if(!s.complete)return toast("Finish all four core setup steps first.");
 await markProgress("spaces","complete",true);
 await loadWorkspace();setPanel("dashboard");toast("Core VENTRYVO setup is complete.");
}

let pendingLoginEmail="";
async function requestLoginCode(){
 const email=byId("email").value.trim().toLowerCase();
 if(!email){byId("msg").textContent="Enter your email address.";return;}
 byId("msg").textContent="Sending your sign-in code…";
 byId("loginBtn").disabled=true;
 const result=await sb.auth.signInWithOtp({email,options:{shouldCreateUser:false}});
 byId("loginBtn").disabled=false;
 if(result.error){const raw=String(result.error.message||"");byId("msg").textContent=(raw.toLowerCase().includes("signups not allowed")||raw.toLowerCase().includes("user not found"))?"No VENTRYVO account was found for that email. Use the email that was invited or registered for this organization.":raw;return;}
 pendingLoginEmail=email;
 byId("emailStage").classList.add("hidden");
 byId("codeStage").classList.remove("hidden");
 byId("codeSentTo").textContent="We sent a one-time sign-in code to "+email+".";
 byId("msg").textContent="Enter the code from your email.";
 byId("otpCode").value="";
 setTimeout(()=>byId("otpCode").focus(),50);
}
async function verifyLoginCode(){
 const token=byId("otpCode").value.replace(/\D/g,"").slice(0,10);
 if(token.length<6||token.length>10){byId("msg").textContent="Enter the sign-in code from your email.";return;}
 byId("verifyBtn").disabled=true;
 byId("msg").textContent="Verifying code…";
 const result=await sb.auth.verifyOtp({email:pendingLoginEmail,token,type:"email"});
 byId("verifyBtn").disabled=false;
 if(result.error){byId("msg").textContent="That code is invalid or expired. Request a new code and try again.";return;}
 byId("msg").textContent="";
 await boot();
}
byId("loginBtn").onclick=requestLoginCode;
byId("verifyBtn").onclick=verifyLoginCode;
byId("resendBtn").onclick=requestLoginCode;
byId("changeEmailBtn").onclick=function(){
 pendingLoginEmail="";
 byId("codeStage").classList.add("hidden");
 byId("emailStage").classList.remove("hidden");
 byId("msg").textContent="";
 setTimeout(()=>byId("email").focus(),50);
};
byId("email").addEventListener("keydown",function(e){if(e.key==="Enter")requestLoginCode();});
byId("otpCode").addEventListener("input",function(){this.value=this.value.replace(/\D/g,"").slice(0,10);});
byId("otpCode").addEventListener("keydown",function(e){if(e.key==="Enter")verifyLoginCode();});
byId("logoutBtn").onclick=async function(){await sb.auth.signOut();location.reload();};
byId("continueSetupBtn").onclick=function(){setPanel("setup");showSetupStep(nextSetupStep());};
document.querySelectorAll("[data-nav]").forEach(function(btn){btn.onclick=function(){setPanel(btn.dataset.nav);};});
document.querySelectorAll("[data-step]").forEach(function(btn){btn.onclick=function(){showSetupStep(btn.dataset.step);};});
byId("businessForm").onsubmit=function(e){saveBusiness(e).catch(formError);};
byId("locationForm").onsubmit=function(e){saveLocation(e).catch(formError);};
byId("eventForm").onsubmit=function(e){saveEvent(e).catch(formError);};
byId("spaceForm").onsubmit=function(e){saveSpace(e).catch(formError);};
byId("spaceEvent").onchange=function(){state.selectedEventId=byId("spaceEvent").value;renderSpaces();renderFinish();};

window.VENTRYVO_CORE={sb,state,esc,money,toast,formError,canManage,canAdmin,eventDateLabel,loadWorkspace,setPanel};

sb.auth.onAuthStateChange(function(){setTimeout(function(){boot().catch(formError);},0);});
boot().catch(formError);
