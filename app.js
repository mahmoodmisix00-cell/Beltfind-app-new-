const SUPABASE_URL = 'https://cdcngtfcxeelcjootkdw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_4xQUNkaMSvAfaygACGLrCg_p3mF6RTV';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let carsData = [];
let selectedCarIds = new Set();
let editingCarId = null;

// خواندن خودروها از دیتابیس Supabase (فقط رکوردهای متعلق به کاربر لاگین‌شده، طبق RLS)
async function loadCars() {
  const { data, error } = await supabaseClient
    .from('cars')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('loadCars error:', error);
    showToast('خطا در بارگذاری اطلاعات از سرور');
    return;
  }

  carsData = (data || []).map(row => ({
    id: row.id,
    name: row.name,
    belts: row.belts || []
  }));
}

const CATEGORIES = ['کولر', 'هیدرولیک', 'دینام', 'تایم', 'پروانه'];
const MODELS = ['A', 'AX', 'B', 'BX', 'C', 'CX', 'PK'];

// ثبت Service Worker برای قابلیت آفلاین
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
});

async function checkAuth() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  const loginView = document.getElementById('loginView');
  const appView = document.getElementById('appView');

  if (session) {
    loginView.style.display = 'none';
    appView.style.display = 'block';
    await loadCars();
    updateStats();
    handleSearch();
  } else {
    loginView.style.display = 'flex';
    appView.style.display = 'none';
  }
}

document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    alert('خطا در ورود: ' + error.message);
  } else {
    checkAuth();
  }
});

document.getElementById('logoutBtn')?.addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  checkAuth();
});

function switchPage(pageName, btn) {
  document.querySelectorAll('.content-page').forEach(p => p.classList.remove('active-page'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  
  const targetPage = document.getElementById(`page-${pageName}`);
  if (targetPage) targetPage.classList.add('active-page');
  if (btn) btn.classList.add('active');

  if (pageName === 'search') {
    handleSearch();
  } else if (pageName === 'home') {
    updateStats();
  }
}

function renderCards(list) {
  const container = document.getElementById('search-results');
  if (!container) return;
  container.innerHTML = '';

  if (list.length === 0) {
    container.innerHTML = '<div class="text-center text-muted py-4">موردی یافت نشد.</div>';
    return;
  }

  list.forEach(car => {
    const isSelected = selectedCarIds.has(car.id);
    const card = document.createElement('div');
    card.className = `car-card ${isSelected ? 'selected' : ''}`;
    card.id = `car-card-${car.id}`;

    let beltsHtml = (car.belts || []).map(b => `
      <div class="belt-item d-flex justify-content-between align-items-center my-1">
        <span><strong>${b.category || 'تسمه'}:</strong></span>
        <span class="badge bg-light text-dark border font-monospace">${b.model || ''} ${b.size || '-'}</span>
      </div>
    `).join('');

    card.innerHTML = `
      <div class="car-header p-2" onclick="toggleAccordion('${car.id}')">
        <div class="d-flex align-items-center gap-2">
          <input type="checkbox" class="form-check-input" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); toggleSelectCar('${car.id}')">
          <span class="fw-bold fs-6">${car.name}</span>
          
          <button class="btn btn-sm btn-light border-0 text-primary p-1 ms-1" title="ارسال متن" onclick="event.stopPropagation(); shareAsText('${car.id}')">
            <i class="bi bi-send-fill fs-6"></i>
          </button>
          
          <button class="btn btn-sm btn-light border-0 text-success p-1" title="ارسال عکس" onclick="event.stopPropagation(); shareAsImage('${car.id}')">
            <i class="bi bi-image-fill fs-6"></i>
          </button>
        </div>
        <div class="d-flex align-items-center gap-1">
          <button class="btn btn-sm btn-outline-warning py-0 px-2" onclick="event.stopPropagation(); editCar('${car.id}')">ویرایش</button>
          <i class="bi bi-chevron-down text-muted ms-1 icon-arrow"></i>
        </div>
      </div>
      <div class="car-body p-2 border-top">
        ${beltsHtml}
      </div>
    `;

    container.appendChild(card);
  });
}

function toggleAccordion(carId) {
  const targetCard = document.getElementById(`car-card-${carId}`);
  if (!targetCard) return;
  const isOpen = targetCard.classList.contains('open');

  document.querySelectorAll('.car-card').forEach(c => c.classList.remove('open'));

  if (!isOpen) {
    targetCard.classList.add('open');
  }
}

function toggleSelectCar(id) {
  if (selectedCarIds.has(id)) {
    selectedCarIds.delete(id);
  } else {
    selectedCarIds.add(id);
  }
  updateBatchBar();
  handleSearch();
}

function selectAllCards() {
  carsData.forEach(c => selectedCarIds.add(c.id));
  updateBatchBar();
  handleSearch();
}

function deselectAllCards() {
  selectedCarIds.clear();
  updateBatchBar();
  handleSearch();
}

async function deleteSelectedCards() {
  if (!confirm(`آیا از حذف ${selectedCarIds.size} مورد مطمئن هستید؟`)) return;

  const idsToDelete = Array.from(selectedCarIds);
  const { error } = await supabaseClient
    .from('cars')
    .delete()
    .in('id', idsToDelete);

  if (error) {
    console.error('delete cars error:', error);
    showToast('خطا در حذف');
    return;
  }

  selectedCarIds.clear();
  await loadCars();
  updateBatchBar();
  handleSearch();
  updateStats();
  showToast('موارد انتخابی حذف شدند');
}

function updateBatchBar() {
  const bar = document.getElementById('batch-bar');
  const countSpan = document.getElementById('selected-count');
  if (!bar || !countSpan) return;
  if (selectedCarIds.size > 0) {
    countSpan.textContent = `${selectedCarIds.size} مورد انتخاب شد`;
    bar.classList.add('show');
  } else {
    bar.classList.remove('show');
  }
}

function handleSearch() {
  const searchInput = document.getElementById('search-input');
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
  if (!query) {
    renderCards(carsData);
    return;
  }
  const filtered = carsData.filter(car => {
    const matchName = car.name.toLowerCase().includes(query);
    const matchBelt = (car.belts || []).some(b => 
      (b.category && b.category.toLowerCase().includes(query)) ||
      (b.model && b.model.toLowerCase().includes(query)) ||
      (b.size && b.size.toLowerCase().includes(query))
    );
    return matchName || matchBelt;
  });
  renderCards(filtered);
}

function addBeltRow(category = '', model = '', size = '') {
  const container = document.getElementById('belts-container');
  if (!container) return;

  const div = document.createElement('div');
  div.className = 'row g-1 mb-2 align-items-center belt-input-row';

  let catOptions = `<option value="" ${category === '' ? 'selected' : ''} disabled>دسته...</option>` +
    CATEGORIES.map(c => `<option value="${c}" ${c === category ? 'selected' : ''}>${c}</option>`).join('');
  
  let modOptions = `<option value="" ${model === '' ? 'selected' : ''} disabled>مدل...</option>` +
    MODELS.map(m => `<option value="${m}" ${m === model ? 'selected' : ''}>${m}</option>`).join('');

  div.innerHTML = `
    <div class="col-4">
      <select class="form-select form-select-sm custom-select b-cat">${catOptions}</select>
    </div>
    <div class="col-3">
      <select class="form-select form-select-sm custom-select b-mod" onchange="handleModelChange(this)">${modOptions}</select>
    </div>
    <div class="col-4">
      <input type="text" inputmode="numeric" class="form-control form-control-sm b-siz" placeholder="سایز" value="${size}" oninput="validateSizeInput(this)">
    </div>
    <div class="col-1 text-center">
      <i class="bi bi-x-circle text-danger cursor-pointer" onclick="this.closest('.belt-input-row').remove()"></i>
    </div>
  `;
  container.appendChild(div);

  const modSelect = div.querySelector('.b-mod');
  if (modSelect) {
    handleModelChange(modSelect);
  }
}

function validateSizeInput(input) {
  const row = input.closest('.belt-input-row');
  const selectedModel = row.querySelector('.b-mod').value;
  
  if (selectedModel !== 'PK') {
    input.value = input.value.replace(/[^0-9]/g, '');
  }
}

function handleModelChange(select) {
  const row = select.closest('.belt-input-row');
  const sizeInput = row.querySelector('.b-siz');
  if (!sizeInput) return;

  if (select.value === 'PK') {
    sizeInput.setAttribute('inputmode', 'text');
  } else {
    sizeInput.setAttribute('inputmode', 'numeric');
  }

  validateSizeInput(sizeInput);
}

async function saveCar(e) {
  if (e && e.preventDefault) e.preventDefault();

  const carNameInput = document.getElementById('car-name');
  if (!carNameInput || !carNameInput.value.trim()) {
    alert('لطفا نام خودرو را وارد کنید');
    return;
  }

  const carName = carNameInput.value.trim();
  const beltRows = document.querySelectorAll('.belt-input-row');
  let belts = [];

  beltRows.forEach(row => {
    const cat = row.querySelector('.b-cat').value || '';
    const mod = row.querySelector('.b-mod').value || '';
    const siz = row.querySelector('.b-siz').value.trim();
    if (siz) {
      belts.push({ category: cat, model: mod, size: siz });
    }
  });

  const submitBtn = document.querySelector('#car-form button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;

  if (editingCarId) {
    const { error } = await supabaseClient
      .from('cars')
      .update({ name: carName, belts })
      .eq('id', editingCarId);

    if (submitBtn) submitBtn.disabled = false;
    if (error) {
      console.error('update car error:', error);
      showToast('خطا در ذخیره‌سازی');
      return;
    }
    showToast('ویرایش انجام شد');
  } else {
    const { data: userData } = await supabaseClient.auth.getUser();
    const { error } = await supabaseClient
      .from('cars')
      .insert({ name: carName, belts, user_id: userData.user.id });

    if (submitBtn) submitBtn.disabled = false;
    if (error) {
      console.error('insert car error:', error);
      showToast('خطا در ذخیره‌سازی');
      return;
    }
    showToast('خودرو ذخیره شد');
  }

  await loadCars();
  resetForm();
  updateStats();
  switchPage('search', document.querySelectorAll('.nav-btn')[1]);
}

function editCar(id) {
  const car = carsData.find(c => c.id === id);
  if (!car) return;
  
  editingCarId = id;
  const title = document.getElementById('form-title');
  if (title) title.textContent = 'ویرایش خودرو';
  
  const notice = document.getElementById('edit-notice');
  if (notice) notice.classList.remove('d-none');
  
  document.getElementById('car-name').value = car.name;
  
  const container = document.getElementById('belts-container');
  container.innerHTML = '';
  if (car.belts && car.belts.length > 0) {
    car.belts.forEach(b => addBeltRow(b.category, b.model, b.size));
  } else {
    addBeltRow();
  }
  
  switchPage('add', document.querySelectorAll('.nav-btn')[2]);
}

function resetForm() {
  editingCarId = null;
  const title = document.getElementById('form-title');
  if (title) title.textContent = 'افزودن خودرو جدید';
  
  const notice = document.getElementById('edit-notice');
  if (notice) notice.classList.add('d-none');
  
  const form = document.getElementById('car-form');
  if (form) form.reset();
  
  const container = document.getElementById('belts-container');
  if (container) container.innerHTML = '';
  
  addBeltRow();
}

function updateStats() {
  const statCars = document.getElementById('stat-cars');
  const statBelts = document.getElementById('stat-belts');
  if (statCars) statCars.textContent = carsData.length;
  
  let totalBelts = 0;
  carsData.forEach(c => totalBelts += (c.belts ? c.belts.length : 0));
  if (statBelts) statBelts.textContent = totalBelts;
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', 2500);
}

function backupData() {
  const blob = new Blob([JSON.stringify(carsData, null, 2)], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `beltfind-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
}

function exportExcel() {
  let csv = 'خودرو,دسته,مدل,سایز\n';
  carsData.forEach(c => {
    if (c.belts) {
      c.belts.forEach(b => {
        csv += `"${c.name}","${b.category || ''}","${b.model || ''}","${b.size || ''}"\n`;
      });
    }
  });
  const blob = new Blob(["\ufeff" + csv], {type: 'text/csv;charset=utf-8;'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `beltfind-excel.csv`;
  a.click();
}

async function shareAsText(carId) {
  const car = carsData.find(c => c.id === carId);
  if (!car) return;
  
  let text = `🚗 مشخصات تسمه‌های خودرو: ${car.name}\n`;
  text += `---------------------------\n`;
  if (car.belts) {
    car.belts.forEach(b => {
      text += `▪️ ${b.category || 'تسمه'}: ${b.model || ''} ${b.size || ''}\n`;
    });
  }
  text += `---------------------------\n`;
  text += `📍 تهران، ملت، آذرتوس، پاساژ مهدی، زیرزمین، پلاک ۲\n`;
  text += `⚙️ ثبت شده در اپلیکیشن تسمه یاب (BeltFind)`;

  if (navigator.share) {
    try {
      await navigator.share({ title: `تسمه‌های ${car.name}`, text: text });
    } catch (err) {}
  } else {
    navigator.clipboard.writeText(text);
    if (typeof showToast === 'function') showToast('متن مشخصات کپی شد');
  }
}

async function shareAsImage(carId) {
  const car = carsData.find(c => c.id === carId);
  if (!car) return;
  
  if (typeof html2canvas === 'undefined') {
    alert('کتابخانه html2canvas یافت نشد!');
    return;
  }

  const tempDiv = document.createElement('div');
  tempDiv.style.position = 'fixed';
  tempDiv.style.right = '-9999px';
  tempDiv.style.top = '0';
  tempDiv.style.width = '350px';
  tempDiv.style.background = '#ebf4ff';
  tempDiv.style.padding = '20px';
  tempDiv.style.boxSizing = 'border-box';
  tempDiv.style.fontFamily = "'Vazirmatn', sans-serif";
  tempDiv.style.direction = 'rtl';

  let beltsList = (car.belts || []).map(b => `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid #f1f5f9;">
      <span style="color:#1e293b; font-weight:bold; font-size:14px;">${b.category || 'تسمه'}</span>
      <span style="background:#f8fafc; color:#0f172a; border:1px solid #cbd5e1; padding:3px 10px; border-radius:6px; font-weight:bold; font-size:13px; font-family:monospace;">${b.model || ''} ${b.size || ''}</span>
    </div>
  `).join('');

  tempDiv.innerHTML = `
    <div style="background:#ffffff; border-radius:20px; padding:24px 20px; box-shadow:0 10px 30px rgba(0,0,0,0.05); text-align:center;">
      <div style="width:65px; height:65px; background:#ffffff; border-radius:16px; border:1px solid #f1f5f9; box-shadow:0 4px 12px rgba(0,0,0,0.06); display:inline-flex; align-items:center; justify-content:center; margin-bottom:12px;">
        <svg width="32" height="32" viewBox="0 0 16 16" fill="#2563eb"><path d="M8 0a8 8 0 1 0 8 8A8 8 0 0 0 8 0zm0 15a7 7 0 1 1 7-7 7 7 0 0 1-7 7z"/><path d="M8 4a4 4 0 1 0 4 4 4 4 0 0 0-4-4zm0 7a3 3 0 1 1 3-3 3 3 0 0 1-3 3z"/></svg>
      </div>
      <div style="font-size:18px; font-weight:800; color:#1e293b; margin-bottom:8px;">
        تسمه یاب | <span style="color:#2563eb;">BeltFind</span>
      </div>
      <div style="background-color:#f1f5f9; color:#64748b; font-size:11px; padding:6px 10px; border-radius:10px; margin-bottom:18px; display:flex; align-items:center; justify-content:center; gap:4px;">
        <span style="color:#2563eb; font-weight:bold;">📍</span>
        <span>تهران، ملت، آذرتوس، پاساژ مهدی، زیرزمین، پلاک ۲</span>
      </div>
      <div style="background:#2563eb; color:#ffffff; padding:8px 12px; border-radius:10px; font-size:15px; font-weight:bold; margin-bottom:15px;">
        🚗 ${car.name}
      </div>
      <div style="text-align:right;">
        ${beltsList}
      </div>
    </div>
  `;

  document.body.appendChild(tempDiv);

  try {
    const canvas = await html2canvas(tempDiv, { scale: 2, useCORS: true });
    document.body.removeChild(tempDiv);

    canvas.toBlob(async (blob) => {
      const fileName = `belt-${car.name}-${Date.now()}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `تسمه‌های ${car.name}`
        });
      } else {
        const link = document.createElement('a');
        link.download = fileName;
        link.href = canvas.toDataURL('image/png');
        link.click();
        if (typeof showToast === 'function') showToast('تصویر دانلود شد');
      }
    }, 'image/png');

  } catch (e) {
    if (document.body.contains(tempDiv)) {
      document.body.removeChild(tempDiv);
    }
  }
}
