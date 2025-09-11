// ====== CONFIG: Admin PIN (hash SHA-256) ======
// Genera el hash con el generador (hash-generator.html) y pégalo aquí:
const ADMIN_HASH = "1b5b45ad551e64e179d42862292bb8e79e5c56f34dcf29f322f145ee37316727"; // <-- tu hash
const ADMIN_OK_KEY = "ingaming_admin_ok";

// ====== EmailJS ======
emailjs.init('jxwzhEr3QA9TW95Js'); // tu Public Key

// ====== Horarios base & overrides ======
const DEFAULT_SLOTS = ["10:00","11:00","12:00","13:00","15:00","16:00"];
const LS_OVERRIDES = 'ingaming_overrides';

function loadOverrides() {
  try { return JSON.parse(localStorage.getItem(LS_OVERRIDES)) || {}; }
  catch { return {}; }
}
function saveOverrides(data) {
  localStorage.setItem(LS_OVERRIDES, JSON.stringify(data));
}

// ====== Helpers de hora/fecha ======
function toMinutes(hhmm){ const [h,m]=hhmm.split(':').map(Number); return h*60+m; }
function addOneHour(hhmm){
  const [h,m]=hhmm.split(':').map(Number);
  const d=new Date(0,0,0,h,m); d.setHours(d.getHours()+1);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function buildSlotsUntilCutoff(cutoff){
  const limit = toMinutes(cutoff);
  return DEFAULT_SLOTS.filter(t => toMinutes(t) < limit);
}
function getSlotsForDate(dateStr){
  const ov = loadOverrides()[dateStr];
  if (!ov) return DEFAULT_SLOTS;
  if (ov.blocked) return [];
  if (ov.slots && Array.isArray(ov.slots) && ov.slots.length) return ov.slots;
  if (ov.cutoff) return buildSlotsUntilCutoff(ov.cutoff);
  return DEFAULT_SLOTS;
}

// === FECHAS en LOCAL (arregla el desfase en móviles) ===
function dateToYMDLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function formatLocalHuman(dateStr) {
  const [y,m,d] = dateStr.split('-').map(Number);
  const dd = new Date(y, m-1, d); // Date en LOCAL (no UTC)
  return dd.toLocaleDateString('es-CL', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
}

// ====== Toast UI ======
function showToast(msg, type='ok'){
  const t = document.getElementById('toast');
  if (!t){ alert(msg); return; }
  t.textContent = msg;
  t.className = 'toast show ' + (type==='err' ? 'err' : 'ok');
  setTimeout(()=>{ t.className='toast'; }, 3500);
}

// ====== Admin gate ======
async function sha256Hex(txt){
  const enc = new TextEncoder().encode(txt);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,"0")).join("");
}

async function ensureAdmin(){
  if (localStorage.getItem(ADMIN_OK_KEY) === ADMIN_HASH) return true;
  const ingreso = prompt('🔐 Ingresa la contraseña del panel admin:');
  if (ingreso === null) return false;
  const pin = ingreso.trim();            // normaliza (evita espacios)
  const hash = await sha256Hex(pin);
  if (hash === ADMIN_HASH){
    localStorage.setItem(ADMIN_OK_KEY, ADMIN_HASH);
    return true;
  }
  alert('Contraseña incorrecta');
  return false;
}

// ====== DOM Ready ======
document.addEventListener('DOMContentLoaded', function () {
  // ===== Calendario =====
  if (!window.FullCalendar){
    showToast('FullCalendar no cargó. Revisa los <script> del <head>.', 'err');
    return;
  }

  let selectedDate = null; // YYYY-MM-DD (LOCAL)
  const today = new Date(); today.setHours(0,0,0,0);
  const todayStr = dateToYMDLocal(today); // LOCAL, no UTC

  const calendarEl = document.getElementById('calendar');
  const badgeEl = document.getElementById('fechaBadge');
  const horaSel = document.getElementById('hora');

  function setHourOptions(dateStr){
    horaSel.innerHTML = '';
    const slots = getSlotsForDate(dateStr);
    if (!slots.length){
      horaSel.innerHTML = `<option value="">— Sin horarios disponibles —</option>`;
      return;
    }
    horaSel.insertAdjacentHTML('beforeend', `<option value="">— Elegir —</option>`);
    for (const t of slots){
      horaSel.insertAdjacentHTML('beforeend', `<option value="${t}">${t} – ${addOneHour(t)}</option>`);
    }
  }

  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'dayGridMonth',
    height: 'auto',
    firstDay: 1,
    selectable: true,
    locale: 'es',
    timeZone: 'local',                 // 🔧 clave para móviles
    validRange: { start: todayStr },   // 🔧 usar LOCAL, no toISOString()
    headerToolbar: { left: 'prev,next', center: 'title', right: 'today' },
    dateClick: function(info){
      // info.date ya es Date en LOCAL → convertir a YYYY-MM-DD local
      selectedDate = dateToYMDLocal(info.date);

      if (badgeEl){
        badgeEl.textContent = '📌 Día seleccionado: ' + info.date.toLocaleDateString('es-CL', {
          weekday:'long', year:'numeric', month:'long', day:'numeric'
        });
      }
      setHourOptions(selectedDate);
    }
  });

  calendar.render();

  // ===== Formulario =====
  const form = document.getElementById('reservaForm');
  form.addEventListener('submit', async function(e){
    e.preventDefault();
    if (!selectedDate){ showToast('Selecciona un día en el calendario.', 'err'); return; }
    if (!form.checkValidity()){ form.reportValidity(); return; }
    if (!document.getElementById('terms').checked){
      showToast('Debes aceptar los términos y condiciones.', 'err'); return;
    }
    if (!getSlotsForDate(selectedDate).length){
      showToast('No hay horarios disponibles para ese día.', 'err'); return;
    }

    const templateParams = {
      nombre: document.getElementById('nombre').value.trim(),
      rut:    document.getElementById('rut').value.trim(),
      email:  document.getElementById('email').value.trim(),
      pc:     document.getElementById('pc').value,
      hora:   document.getElementById('hora').value,
      fecha:  selectedDate // YYYY-MM-DD local
    };

    try{
      await emailjs.send('service_lsd9y3g', 'template_mbrl6e1', templateParams);
      showToast('✅ Reserva enviada con éxito');
      form.reset();
      selectedDate = null;
      horaSel.innerHTML = `<option value="">— Elige un día primero —</option>`;
      if (badgeEl) badgeEl.textContent = '📌 Día no seleccionado';
    } catch(err){
      console.error(err);
      showToast('Error al enviar la reserva. Revisa EmailJS.', 'err');
    }
  });

  // ===== Panel Admin (misma página, protegido) =====
  const adminPanel = document.getElementById('adminPanel');
  const openAdminBtn = document.getElementById('openAdmin');
  const admFecha   = document.getElementById('admFecha');
  const admCierre  = document.getElementById('admCierre');
  const admBloqueo = document.getElementById('admBloqueo');
  const admGuardar = document.getElementById('admGuardar');
  const admLimpiar = document.getElementById('admLimpiar');
  const admExport  = document.getElementById('admExport');
  const admImpFile = document.getElementById('admImportFile');
  const admImport  = document.getElementById('admImport');

  openAdminBtn.addEventListener('click', async ()=>{
    const ok = await ensureAdmin();
    if (!ok) return;
    adminPanel.hidden = !adminPanel.hidden;
    openAdminBtn.textContent = adminPanel.hidden ? '⚙️ Modo admin' : '⬆️ Ocultar admin';
  });

  admGuardar.addEventListener('click', () => {
    const d = admFecha.value; // YYYY-MM-DD del input
    if (!d){ showToast('Elige una fecha para guardar la excepción.', 'err'); return; }

    const overrides = loadOverrides();
    if (admBloqueo.checked){
      overrides[d] = { blocked: true };
    } else if (admCierre.value){
      overrides[d] = { blocked: false, cutoff: admCierre.value };
    } else {
      overrides[d] = {}; // horario base
    }
    saveOverrides(overrides);
    showToast('Excepción guardada ✅');

    if (d === (selectedDate || '')) setHourOptions(selectedDate);
  });

  admLimpiar.addEventListener('click', () => {
    const d = admFecha.value;
    if (!d){ showToast('Elige una fecha para quitar la excepción.', 'err'); return; }
    const overrides = loadOverrides();
    delete overrides[d];
    saveOverrides(overrides);
    showToast('Excepción eliminada 🗑️');
    if (d === (selectedDate || '')) setHourOptions(selectedDate);
  });

  admExport.addEventListener('click', () => {
    const data = loadOverrides();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'excepciones_ingaming.json'; a.click();
    URL.revokeObjectURL(url);
  });

  admImport.addEventListener('click', async () => {
    const file = admImpFile.files?.[0];
    if (!file){ showToast('Selecciona un archivo JSON para importar.', 'err'); return; }
    try{
      const text = await file.text();
      const data = JSON.parse(text);
      if (typeof data !== 'object' || Array.isArray(data)) throw new Error('Formato inválido');
      saveOverrides(data);
      showToast('Excepciones importadas ✅');
      if (selectedDate) setHourOptions(selectedDate);
    } catch(e){
      console.error(e);
      showToast('Archivo inválido. Debe ser JSON.', 'err');
    }
  });
});
