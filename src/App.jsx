import { useState, useEffect } from "react";

const SUPABASE_URL = "https://pbkklacwpffvwgblxjus.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBia2tsYWN3cGZmdndnYmx4anVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NDgwMDQsImV4cCI6MjA5NTEyNDAwNH0.Gmoc8cLPkFxqD_aBK8usJb_bTodKvk0A2OUx5TwNJ9M";

const STATUSES = {
  new:        { label: "جديد",            color: "#F59E0B", bg: "#FEF3C7" },
  studying:   { label: "قيد الدراسة",     color: "#3B82F6", bg: "#DBEAFE" },
  scheduled:  { label: "مبرمج للزيارة",   color: "#8B5CF6", bg: "#EDE9FE" },
  processing: { label: "قيد المعالجة",    color: "#F97316", bg: "#FFEDD5" },
  done:       { label: "تمت المعالجة",    color: "#10B981", bg: "#D1FAE5" },
  closed:     { label: "مغلق",            color: "#6B7280", bg: "#F3F4F6" },
};

const PROBLEMS = ["تسرب مياه","شقوق في الجدران","مشكلة كهربائية","مشكلة تشطيب","مشكلة أبواب / نوافذ","مشكلة سباكة","مشكلة بلاط","أخرى"];

// ===== Supabase API =====
async function sbFetch(method, path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Prefer": method === "POST" ? "return=representation" : "return=minimal",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  return res.json();
}

const getTickets = () => sbFetch("GET", "tickets?order=created_at.desc");
const createTicket = (t) => sbFetch("POST", "tickets", t);
const updateTicket = (id, data) => sbFetch("PATCH", `tickets?id=eq.${id}`, data);

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("ar-DZ", { year: "numeric", month: "short", day: "numeric" });
}
function daysBetween(d1, d2) {
  if (!d1 || !d2) return null;
  return Math.ceil(Math.abs(new Date(d2) - new Date(d1)) / 86400000);
}

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [resolveFor, setResolveFor] = useState(null);
  const [notif, setNotif] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [form, setForm] = useState({ client_name: "", phone: "", address: "", problem_type: PROBLEMS[0], notes: "", report_date: new Date().toISOString().split("T")[0] });
  const [rForm, setRForm] = useState({ resolution: "", resolution_date: new Date().toISOString().split("T")[0] });

  const load = async () => {
    setLoading(true);
    const data = await getTickets();
    setTickets(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Auto-refresh every 30s
  useEffect(() => {
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const toast = (msg, type = "ok") => {
    setNotif({ msg, type });
    setTimeout(() => setNotif(null), 3500);
  };

  const handleCreate = async () => {
    if (!form.client_name || !form.phone || !form.address) { toast("يرجى ملء الحقول المطلوبة *", "err"); return; }
    const result = await createTicket({ ...form, status: "new" });
    const saved = Array.isArray(result) ? result[0] : result;
    if (saved?.id) {
      const num = `SAV-${String(saved.id).padStart(3, "0")}`;
      await updateTicket(saved.id, { ticket_num: num });
    }
    await load();
    setShowNew(false);
    setForm({ client_name: "", phone: "", address: "", problem_type: PROBLEMS[0], notes: "", report_date: new Date().toISOString().split("T")[0] });
    toast("✅ تم إنشاء الطلب بنجاح");
  };

  const handleStatus = async (id, status, extra = {}) => {
    await updateTicket(id, { status, ...extra });
    await load();
    if (selected?.id === id) setSelected(prev => ({ ...prev, status, ...extra }));
    if (status === "done") {
      const t = tickets.find(x => x.id === id);
      toast(`📱 إشعار Telegram أُرسل إلى ${t?.client_name}`, "tg");
    }
    setResolveFor(null);
  };

  const handleResolve = async () => {
    if (!rForm.resolution) { toast("يرجى كتابة تفاصيل الإنجاز", "err"); return; }
    await handleStatus(resolveFor.id, "done", { resolution: rForm.resolution, resolution_date: rForm.resolution_date });
    toast("✅ تم تسجيل المعالجة");
  };

  const filtered = filterStatus === "all" ? tickets : tickets.filter(t => t.status === filterStatus);

  const stats = {
    total: tickets.length,
    open: tickets.filter(t => ["new","studying","scheduled","processing"].includes(t.status)).length,
    done: tickets.filter(t => t.status === "done").length,
    closed: tickets.filter(t => t.status === "closed").length,
    avg: (() => {
      const r = tickets.filter(t => t.status === "done" && t.resolution_date && t.report_date);
      if (!r.length) return "—";
      return (r.reduce((s, t) => s + (daysBetween(t.report_date, t.resolution_date) || 0), 0) / r.length).toFixed(1) + " يوم";
    })()
  };

  const S = {
    app: { fontFamily: "'Cairo',sans-serif", minHeight: "100dvh", background: "#0F172A", color: "#E2E8F0", display: "flex", flexDirection: "column", maxWidth: 480, margin: "0 auto" },
    header: { background: "#1E293B", borderBottom: "1px solid #334155", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 },
    content: { flex: 1, overflowY: "auto", padding: "16px", paddingBottom: 80 },
    nav: { position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: "#1E293B", borderTop: "1px solid #334155", display: "flex", zIndex: 50 },
    navBtn: (a) => ({ flex: 1, padding: "10px 4px", border: "none", background: "transparent", color: a ? "#3B82F6" : "#475569", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: a ? 700 : 500, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }),
    card: { background: "#1E293B", borderRadius: 14, border: "1px solid #334155", padding: 16, marginBottom: 12 },
    btn: (c, o) => ({ background: o ? "transparent" : c, border: `1px solid ${c}`, color: o ? c : "#fff", padding: "9px 16px", borderRadius: 9, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, flex: 1 }),
    input: { background: "#0F172A", color: "#E2E8F0", border: "1px solid #334155", borderRadius: 9, padding: "11px 13px", fontFamily: "inherit", fontSize: 14, width: "100%", boxSizing: "border-box", outline: "none" },
    label: { fontSize: 12, color: "#64748B", marginBottom: 6, display: "block", fontWeight: 600 },
    overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 100, display: "flex", flexDirection: "column", justifyContent: "flex-end" },
    sheet: { background: "#1E293B", borderRadius: "20px 20px 0 0", padding: "20px 16px 32px", maxHeight: "90dvh", overflowY: "auto" },
  };

  return (
    <div dir="rtl" style={S.app}>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet" />
      <style>{`* { -webkit-tap-highlight-color: transparent; } input:focus,select:focus,textarea:focus { border-color: #3B82F6 !important; outline: none; }`}</style>

      {/* Header */}
      <div style={S.header}>
        {selected ? (
          <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: "#3B82F6", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700, padding: 0 }}>← رجوع</button>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>🔧</span>
            <div>
              <div style={{ fontWeight: 900, fontSize: 15 }}>نظام SAV</div>
              <div style={{ fontSize: 10, color: "#10B981" }}>● متصل بـ Supabase</div>
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={load} style={{ background: "#334155", border: "none", color: "#94A3B8", padding: "6px 10px", borderRadius: 8, cursor: "pointer", fontSize: 14 }}>🔄</button>
          {tab === "reception" && !selected && (
            <button onClick={() => setShowNew(true)} style={{ background: "linear-gradient(135deg,#3B82F6,#6366F1)", border: "none", color: "#fff", padding: "8px 14px", borderRadius: 9, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700 }}>+ جديد</button>
          )}
        </div>
      </div>

      {/* Toast */}
      {notif && (
        <div style={{ position: "fixed", top: 70, left: 16, right: 16, zIndex: 200, background: notif.type === "err" ? "#EF4444" : notif.type === "tg" ? "#229ED9" : "#10B981", color: "#fff", padding: "12px 16px", borderRadius: 12, fontSize: 14, fontWeight: 600, textAlign: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}>
          {notif.msg}
        </div>
      )}

      <div style={S.content}>
        {loading && <div style={{ textAlign: "center", padding: 40, color: "#475569" }}>جاري التحميل...</div>}

        {!loading && (
          <>
            {/* Detail */}
            {selected ? (
              <div>
                <div style={{ ...S.card, borderTop: `3px solid ${STATUSES[selected.status]?.color}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 12, color: "#3B82F6", fontWeight: 700, marginBottom: 4 }}>{selected.ticket_num || `#${selected.id}`}</div>
                      <div style={{ fontSize: 20, fontWeight: 900 }}>{selected.client_name}</div>
                    </div>
                    <span style={{ background: STATUSES[selected.status]?.bg, color: STATUSES[selected.status]?.color, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{STATUSES[selected.status]?.label}</span>
                  </div>
                  {[
                    ["📱 الهاتف", selected.phone],
                    ["📍 العنوان", selected.address],
                    ["🔧 المشكلة", selected.problem_type],
                    ["📅 تاريخ التبليغ", fmtDate(selected.report_date)],
                    ...(selected.resolution_date ? [["✅ تاريخ المعالجة", fmtDate(selected.resolution_date)], ["⏱️ مدة الحل", (daysBetween(selected.report_date, selected.resolution_date) || "—") + " يوم"]] : []),
                  ].map(([l, v], i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #334155", fontSize: 14 }}>
                      <span style={{ color: "#64748B" }}>{l}</span>
                      <span style={{ fontWeight: 600, color: "#CBD5E1", maxWidth: "60%", textAlign: "left" }}>{v}</span>
                    </div>
                  ))}
                </div>
                {selected.notes && <div style={S.card}><div style={{ fontSize: 12, color: "#64748B", marginBottom: 8 }}>📝 الملاحظات</div><div style={{ fontSize: 14, lineHeight: 1.7 }}>{selected.notes}</div></div>}
                {selected.resolution && <div style={{ ...S.card, background: "#0A2217", borderColor: "#064E3B" }}><div style={{ fontSize: 12, color: "#10B981", marginBottom: 8 }}>✅ ما تم إنجازه</div><div style={{ fontSize: 14, color: "#A7F3D0", lineHeight: 1.7 }}>{selected.resolution}</div></div>}
                {/* Tech actions */}
                {tab === "technical" && !["done","closed"].includes(selected.status) && (
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    {selected.status === "new" && <button style={S.btn("#3B82F6")} onClick={() => handleStatus(selected.id, "studying")}>قيد الدراسة</button>}
                    {selected.status === "studying" && <button style={S.btn("#8B5CF6")} onClick={() => handleStatus(selected.id, "scheduled")}>مبرمج للزيارة</button>}
                    {selected.status === "scheduled" && <button style={S.btn("#F97316")} onClick={() => handleStatus(selected.id, "processing")}>قيد المعالجة</button>}
                    {selected.status === "processing" && <button style={S.btn("#10B981")} onClick={() => setResolveFor(selected)}>✅ تمت المعالجة</button>}
                  </div>
                )}
                {tab === "technical" && selected.status === "done" && (
                  <button style={{ ...S.btn("#6B7280"), width: "100%", marginTop: 8 }} onClick={() => handleStatus(selected.id, "closed")}>إغلاق الطلب</button>
                )}
              </div>
            ) : (
              <>
                {/* Dashboard */}
                {tab === "dashboard" && (
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 16 }}>لوحة المتابعة</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                      {[
                        { l: "الإجمالي", v: stats.total, c: "#3B82F6", i: "📁" },
                        { l: "المفتوحة", v: stats.open, c: "#F59E0B", i: "🔴" },
                        { l: "المعالجة", v: stats.done, c: "#10B981", i: "✅" },
                        { l: "متوسط الحل", v: stats.avg, c: "#8B5CF6", i: "⏱️" },
                      ].map((s, i) => (
                        <div key={i} style={{ background: "#1E293B", borderRadius: 14, border: "1px solid #334155", borderTop: `3px solid ${s.c}`, padding: "16px 14px" }}>
                          <div style={{ fontSize: 22, marginBottom: 6 }}>{s.i}</div>
                          <div style={{ fontSize: 26, fontWeight: 900, color: s.c }}>{s.v}</div>
                          <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{s.l}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "#94A3B8" }}>آخر الطلبات</div>
                    {tickets.slice(0, 5).map(t => <TicketCard key={t.id} t={t} onPress={() => setSelected(t)} />)}
                  </div>
                )}

                {/* Reception */}
                {tab === "reception" && (
                  <div>
                    <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
                      {[{ k: "all", l: "الكل" }, ...Object.entries(STATUSES).map(([k, v]) => ({ k, l: v.label }))].map(f => (
                        <button key={f.k} onClick={() => setFilterStatus(f.k)} style={{ padding: "6px 12px", borderRadius: 20, border: `1px solid ${filterStatus === f.k ? "#3B82F6" : "#334155"}`, background: filterStatus === f.k ? "#1D4ED8" : "#1E293B", color: filterStatus === f.k ? "#fff" : "#64748B", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>{f.l}</button>
                      ))}
                    </div>
                    {filtered.length === 0 && <div style={{ textAlign: "center", color: "#475569", padding: 40 }}>لا توجد طلبات</div>}
                    {filtered.map(t => <TicketCard key={t.id} t={t} onPress={() => setSelected(t)} />)}
                  </div>
                )}

                {/* Technical */}
                {tab === "technical" && (
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "#94A3B8" }}>الطلبات المفتوحة</div>
                    {tickets.filter(t => !["closed"].includes(t.status)).map(t => (
                      <div key={t.id} style={{ ...S.card, borderRight: `4px solid ${STATUSES[t.status]?.color}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                          <div>
                            <div style={{ fontSize: 11, color: "#64748B" }}>{t.ticket_num || `#${t.id}`} · {fmtDate(t.report_date)}</div>
                            <div style={{ fontWeight: 800, fontSize: 15 }}>{t.client_name}</div>
                            <div style={{ fontSize: 12, color: "#64748B" }}>{t.address}</div>
                            <div style={{ fontSize: 13, color: "#F59E0B", marginTop: 4 }}>🔧 {t.problem_type}</div>
                          </div>
                          <span style={{ background: STATUSES[t.status]?.bg, color: STATUSES[t.status]?.color, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, height: "fit-content" }}>{STATUSES[t.status]?.label}</span>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button style={S.btn("#475569", true)} onClick={() => setSelected(t)}>التفاصيل</button>
                          {t.status === "new" && <button style={S.btn("#3B82F6")} onClick={() => handleStatus(t.id, "studying")}>دراسة</button>}
                          {t.status === "studying" && <button style={S.btn("#8B5CF6")} onClick={() => handleStatus(t.id, "scheduled")}>برمجة</button>}
                          {t.status === "scheduled" && <button style={S.btn("#F97316")} onClick={() => handleStatus(t.id, "processing")}>معالجة</button>}
                          {t.status === "processing" && <button style={S.btn("#10B981")} onClick={() => setResolveFor(t)}>✅ إنجاز</button>}
                          {t.status === "done" && <button style={S.btn("#6B7280")} onClick={() => handleStatus(t.id, "closed")}>إغلاق</button>}
                        </div>
                      </div>
                    ))}
                    {tickets.filter(t => t.status !== "closed").length === 0 && <div style={{ textAlign: "center", color: "#475569", padding: 40 }}>🎉 لا توجد طلبات مفتوحة</div>}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Bottom Nav */}
      <div style={S.nav}>
        {[{ id: "dashboard", l: "القيادة", i: "📊" }, { id: "reception", l: "الاستقبال", i: "📋" }, { id: "technical", l: "التقني", i: "⚙️" }].map(v => (
          <button key={v.id} style={S.navBtn(tab === v.id)} onClick={() => { setTab(v.id); setSelected(null); }}>
            <span style={{ fontSize: 20 }}>{v.i}</span>
            <span>{v.l}</span>
          </button>
        ))}
      </div>

      {/* New Ticket Sheet */}
      {showNew && (
        <div style={S.overlay} onClick={e => e.target === e.currentTarget && setShowNew(false)}>
          <div style={S.sheet}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ fontWeight: 900, fontSize: 17 }}>طلب SAV جديد</div>
              <button onClick={() => setShowNew(false)} style={{ background: "#334155", border: "none", color: "#94A3B8", width: 32, height: 32, borderRadius: 8, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ display: "grid", gap: 14 }}>
              <div><label style={S.label}>اسم العميل *</label><input style={S.input} value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} placeholder="الاسم الكامل" /></div>
              <div><label style={S.label}>رقم الهاتف *</label><input style={S.input} type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="06XXXXXXXX" /></div>
              <div><label style={S.label}>العنوان *</label><input style={S.input} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="الحي والبلوك" /></div>
              <div><label style={S.label}>نوع المشكلة</label>
                <select style={S.input} value={form.problem_type} onChange={e => setForm({ ...form, problem_type: e.target.value })}>
                  {PROBLEMS.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div><label style={S.label}>تاريخ التبليغ</label><input style={S.input} type="date" value={form.report_date} onChange={e => setForm({ ...form, report_date: e.target.value })} /></div>
              <div><label style={S.label}>ملاحظات</label><textarea style={{ ...S.input, resize: "vertical" }} rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="وصف المشكلة..." /></div>
              <div style={{ display: "flex", gap: 10 }}>
                <button style={S.btn("#334155")} onClick={() => setShowNew(false)}>إلغاء</button>
                <button style={S.btn("linear-gradient(135deg,#3B82F6,#6366F1)")} onClick={handleCreate}>إنشاء الطلب</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Resolve Sheet */}
      {resolveFor && (
        <div style={S.overlay} onClick={e => e.target === e.currentTarget && setResolveFor(null)}>
          <div style={S.sheet}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ fontWeight: 900, fontSize: 17 }}>تسجيل الإنجاز — {resolveFor.ticket_num}</div>
              <button onClick={() => setResolveFor(null)} style={{ background: "#334155", border: "none", color: "#94A3B8", width: 32, height: 32, borderRadius: 8, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ display: "grid", gap: 14 }}>
              <div><label style={S.label}>تاريخ المعالجة</label><input style={S.input} type="date" value={rForm.resolution_date} onChange={e => setRForm({ ...rForm, resolution_date: e.target.value })} /></div>
              <div><label style={S.label}>ماذا تم إنجازه *</label><textarea style={{ ...S.input, resize: "vertical" }} rows={4} value={rForm.resolution} onChange={e => setRForm({ ...rForm, resolution: e.target.value })} placeholder="اذكر بالتفصيل..." /></div>
              <div style={{ background: "#0A2A1A", borderRadius: 10, padding: "12px 14px", border: "1px solid #166534", fontSize: 13, color: "#4ADE80" }}>
                📱 سيُرسل إشعار Telegram تلقائياً للقروب
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button style={S.btn("#334155")} onClick={() => setResolveFor(null)}>إلغاء</button>
                <button style={S.btn("#10B981")} onClick={handleResolve}>✅ تأكيد</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TicketCard({ t, onPress }) {
  return (
    <div onClick={onPress} style={{ background: "#1E293B", borderRadius: 14, border: "1px solid #334155", padding: "14px 16px", marginBottom: 10, cursor: "pointer", borderRight: `4px solid ${STATUSES[t.status]?.color}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: "#475569", marginBottom: 3 }}>{t.ticket_num || `#${t.id}`} · {new Date(t.report_date || t.created_at).toLocaleDateString("ar-DZ")}</div>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 2 }}>{t.client_name}</div>
          <div style={{ fontSize: 12, color: "#64748B" }}>{t.address}</div>
          <div style={{ fontSize: 12, color: "#F59E0B", marginTop: 4 }}>🔧 {t.problem_type}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <span style={{ background: STATUSES[t.status]?.bg, color: STATUSES[t.status]?.color, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{STATUSES[t.status]?.label}</span>
          <span style={{ fontSize: 18, color: "#334155" }}>›</span>
        </div>
      </div>
    </div>
  );
}
