/***** CONFIG *****/
const API_URL = 'https://script.google.com/macros/s/AKfycbzLRuoTCvwVVLe7ty09dgLAzUKgv9RLFbhGPiH9sSkHpD2bCRlMQvQpUFmJQtXGQtWL-A/exec'; // <- ej: https://script.google.com/macros/s/XXXX/exec
const ADMIN_HASH = "1b5b45ad551e64e179d42862292bb8e79e5c56f34dcf29f322f145ee37316727";
const ADMIN_OK_KEY = "ingaming_admin_ok";
emailjs.init('jxwzhEr3QA9TW95Js'); // tu Public Key

/***** Horarios base *****/
const DEFAULT_SLOTS = ["10:00","11:00","12:00","13:00","15:00","16:00"];

/***** Helpers *****/
function toMinutes(hhmm){ const [h,m]=hhmm.split(':').map(Number); return h*60+m; }
function addOneHour(hhmm){ const [h,m]=hhmm.split(':').map(Number); const d=new Date(0,0,0,h,m); d.setHours(d.getHours()+1); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
function buildSlotsUntilCutoff(cutoff){ const limit = toMinutes(cutoff); return DEFAULT_SLOTS.filter(t => toMinutes(t) < limit); }
function dateToYMDLocal(d){ const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; }
function paintSelectedDay(selectedDate){ document.querySelectorAll('.fc-daygrid-day.is-selected').forEach(el=>el.classList.remove('is-selected')); if (!selectedDate) return; const cell=document.querySelector(`.fc-daygrid-day[data-date="${selectedDate}"]`); if(cell) cell.classList.add('is-selected'); }
function showToast(msg,type='ok'){ const t=document.getElementById('toast'); if(!t){ alert(msg); return;} t.textContent=msg; t.className='toast show '+(type==='err'?'err':'ok'); setTimeout(()=>{ t.className='toast'; }, 3200); }
async function sha256Hex(txt){ const enc=new TextEncoder().encode(txt); const buf=await crypto.subtle.digest("SHA-256",enc); return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join(""); }

/***** Estado en memoria *****/
let selectedDate = null;                  // YYYY-MM-DD
let dayReservations = {};                 // { 'PC-1': ['10:00', ...], ... }
let dayOverride = {};                     // { cutoff?: '14:00', blocked?: true }

/***** API calls *****/
async function apiGetDay(dateStr){
  const url = `${API_URL}?action=getDay&date=${encodeURIComponent(dateStr)}`;
  const res = await fetch(url, { method:'GET' });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Error API');
  dayReservations = data.reservations || {};
  dayOverride = data.override || {};
}
async function apiReserve(payload){
  const res = await fetch(API_URL, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ action:'reserve', ...payload })
  });
  const data = await res.json();
  return data;
}
async function apiSetOverride(dateStr, cutoff, blocked){
  const res = await fetch(API_URL, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ action:'setOverride', fecha: dateStr, cutoff, blocked })
  });
  return res.json();
}
async function apiClearOverride(dateStr){
  const res = await fetch(API_URL, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ action:'clearOverride', fecha: dateStr })
  });
  return res.json();
}

/***** Admin gate *****/
async function ensureAdmin(){
  if (localStorage.getItem(ADMIN_OK_KEY) === ADMIN_HASH) return true;
  const ingreso = prompt('🔐 Ingresa la contraseña del panel admin:');
  if (ingreso === null) return false;
  const pin = ingreso.trim();
  const hash = await sha256Hex(pin);
  if (hash === ADMIN_HASH){ localStorage.setItem(ADMIN_OK_KEY, ADMIN_HASH); return true; }
  alert('Contraseña incorrecta'); return false;
}

/***** DOM Ready *****/
document.addEventListener('DOMContentLoaded', function () {
  const today = new Date(); today.setHours(0,0,0,0);
  const todayStr = dateToYMDLocal(today);

  const calendarEl = document.getElementById('calendar');
  const badgeEl = document.getElementById('fechaBadge');
  const horaSel = document.getElementById('hora');
  const pcSel = document.getElementById('pc');

  function computeSlotsForDay(){
    if (dayOverride.blocked) return [];
    if (dayOverride.cutoff) return buildSlotsUntilCutoff(dayOverride.cutoff);
    return DEFAULT_SLOTS.slice();
  }

  function setHourOptions(dateStr){
    horaSel.innerHTML = '';
    const base = computeSlotsForDay();            // por override
    const pc = pcSel.value;
    let taken = [];
    if (pc) taken = (dayReservations[pc] || []);
    const available = base.filter(t => !taken.includes(t));

    if (!available.length){
      horaSel.innerHTML = `<option value="">— Sin horarios disponibles —</option>`;
      return;
    }
    horaSel.insertAdjacentHTML('beforeend', `<option value="">— Elegir —</option>`);
    for (const t of available){
      horaSel.insertAdjacentHTML('beforeend', `<option value="${t}">${t} – ${addOneHour(t)}</option>`);
    }
  }

  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'dayGridMonth',
    height: 'auto',
    firstDay: 1,
    selectable: true,
    locale: 'es',
    timeZone: 'local',
    validRange: { start: todayStr },
    headerToolbar: { left: 'prev,next', center: 'title', right: 'today' },
    datesSet(){ paintSelectedDay(selectedDate); },
    dateClick: async function(info){
      selectedDate = dateToYMDLocal(info.date);
      if (badgeEl){
        badgeEl.textContent = '📌 Día seleccionado: ' + info.date.toLocaleDateString('es-CL', {
          weekday:'long', year:'numeric', month:'long', day:'numeric'
        });
      }
      try{
        await apiGetDay(selectedDate); // carga reservas + override del día
        setHourOptions(selectedDate);
        paintSelectedDay(selectedDate);
      } catch(err){
        console.error(err);
        showToast('Error cargando disponibilidad.', 'err');
      }
    }
  });

  calendar.render();
  paintSelectedDay(selectedDate);

  // Cuando cambia el PC, recalculamos horas disponibles
  pcSel.addEventListener('change', () => {
    if (selectedDate) setHourOptions(selectedDate);
  });

  // ===== Formulario =====
  const form = document.getElementById('reservaForm');
  form.addEventListener('submit', async function(e){
    e.preventDefault();
    if (!selectedDate){ showToast('Selecciona un día en el calendario.', 'err'); return; }
    if (!form.checkValidity()){ form.reportValidity(); return; }
    if (!document.getElementById('terms').checked){
      showToast('Debes aceptar los términos y condiciones.', 'err'); return;
    }
    if (!pcSel.value){ showToast('Selecciona un PC.', 'err'); return; }
    if (!horaSel.value){ showToast('Selecciona una hora.', 'err'); return; }

    const payload = {
      fecha: selectedDate,
      hora:  horaSel.value,
      pc:    pcSel.value,
      nombre: document.getElementById('nombre').value.trim(),
      rut:    document.getElementById('rut').value.trim(),
      email:  document.getElementById('email').value.trim()
    };

    try{
      const resp = await apiReserve(payload);
      if (!resp.ok && resp.conflict){
        showToast('Ese cupo acaba de ocuparse. Elige otro.', 'err');
        // refrescamos estado del día
        await apiGetDay(selectedDate);
        setHourOptions(selectedDate);
        return;
      }
      if (!resp.ok){ throw new Error(resp.error || 'Error al reservar'); }

      // correo de confirmación (opcional)
      try {
        await emailjs.send('service_lsd9y3g', 'template_mbrl6e1', payload);
      } catch {}

      showToast('✅ Reserva registrada');
      // Refresca las horas para que desaparezca el cupo recién tomado
      await apiGetDay(selectedDate);
      setHourOptions(selectedDate);
      form.reset();
      document.getElementById('terms').checked = false;
      paintSelectedDay(selectedDate);
    } catch(err){
      console.error(err);
      showToast('No se pudo completar la reserva.', 'err');
    }
  });

  // ===== Panel Admin =====
  const adminPanel = document.getElementById('adminPanel');
  const openAdminBtn = document.getElementById('openAdmin');
  const admFecha   = document.getElementById('admFecha');
  const admCierre  = document.getElementById('admCierre');
  const admBloqueo = document.getElementById('admBloqueo');
  const admGuardar = document.getElementById('admGuardar');
  const admLimpiar = document.getElementById('admLimpiar');

  openAdminBtn.addEventListener('click', async ()=>{
    const ok = await ensureAdmin();
    if (!ok) return;
    adminPanel.hidden = !adminPanel.hidden;
    openAdminBtn.textContent = adminPanel.hidden ? '⚙️ Modo admin' : '⬆️ Ocultar admin';
  });

  admGuardar.addEventListener('click', async () => {
    const d = admFecha.value;
    if (!d){ showToast('Elige una fecha.', 'err'); return; }
    const cut = admCierre.value || '';
    const blocked = admBloqueo.checked ? true : false;
    const res = await apiSetOverride(d, cut, blocked);
    if (!res.ok){ showToast('Error guardando excepción', 'err'); return; }
    showToast('Excepción guardada ✅');
    if (d === selectedDate){
      await apiGetDay(selectedDate);
      setHourOptions(selectedDate);
    }
  });

  admLimpiar.addEventListener('click', async () => {
    const d = admFecha.value;
    if (!d){ showToast('Elige una fecha.', 'err'); return; }
    const res = await apiClearOverride(d);
    if (!res.ok){ showToast('Error quitando excepción', 'err'); return; }
    showToast('Excepción eliminada 🗑️');
    if (d === selectedDate){
      await apiGetDay(selectedDate);
      setHourOptions(selectedDate);
    }
  });
});
