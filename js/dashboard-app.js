// ── MMI Lab Dashboard Application ──
(function() {
  const API = '/api';
  const token = localStorage.getItem('mmilab_token');
  const user = JSON.parse(localStorage.getItem('mmilab_user') || 'null');

  if (!token || !user) { window.location.href = 'login.html'; return; }

  // Set role class on body
  document.body.classList.add(`role-${user.role}`);
  document.getElementById('userName').textContent = user.name;
  document.getElementById('userRole').textContent = user.role === 'pi' ? 'Principal Investigator' : 'PhD Scholar';

  // ── Force password change on first login ──
  if (localStorage.getItem('mmilab_force_pw') === '1') {
    document.addEventListener('DOMContentLoaded', showForcePasswordModal);
    if (document.readyState !== 'loading') showForcePasswordModal();
  }
  function showForcePasswordModal() {
    let overlay = document.querySelector('.force-pw-overlay');
    if (overlay) return; // already showing
    overlay = document.createElement('div');
    overlay.className = 'force-pw-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
      <div style="background:var(--color-dark-surface,#1a1a1a);border:1px solid var(--brand-orange,#e65100);padding:40px;max-width:420px;width:90%;">
        <h2 style="margin:0 0 8px;color:var(--brand-orange,#e65100);font-size:1.1rem;">Change Your Password</h2>
        <p style="color:#aaa;font-size:0.85rem;margin:0 0 24px;">You must set a new personal password before continuing. The default password is no longer valid after first login.</p>
        <input type="password" id="forcePwNew" placeholder="New password (min 8 chars)" style="width:100%;padding:12px;margin-bottom:12px;background:#111;color:#fff;border:1px solid #333;font-size:0.9rem;">
        <input type="password" id="forcePwConfirm" placeholder="Confirm new password" style="width:100%;padding:12px;margin-bottom:16px;background:#111;color:#fff;border:1px solid #333;font-size:0.9rem;">
        <div id="forcePwError" style="color:#f87171;font-size:0.8rem;margin-bottom:12px;display:none;"></div>
        <button id="forcePwBtn" style="width:100%;padding:12px;background:var(--brand-orange,#e65100);color:#fff;border:none;cursor:pointer;font-weight:600;font-size:0.9rem;">Set New Password</button>
      </div>`;
    document.body.appendChild(overlay);

    document.getElementById('forcePwBtn').addEventListener('click', async () => {
      const pw = document.getElementById('forcePwNew').value;
      const pw2 = document.getElementById('forcePwConfirm').value;
      const errEl = document.getElementById('forcePwError');
      errEl.style.display = 'none';
      if (pw.length < 8) { errEl.textContent = 'Password must be at least 8 characters.'; errEl.style.display = 'block'; return; }
      if (pw !== pw2) { errEl.textContent = 'Passwords do not match.'; errEl.style.display = 'block'; return; }
      try {
        const res = await fetch('/api/auth/force-change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ newPassword: pw })
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Failed');
        localStorage.removeItem('mmilab_force_pw');
        overlay.remove();
        alert('Password changed successfully! Welcome to the dashboard.');
      } catch (e) {
        errEl.textContent = e.message || 'Error changing password. Try again.';
        errEl.style.display = 'block';
      }
    });
  }

  // ── API Helper ──
  async function api(endpoint, options = {}) {
    const res = await fetch(`${API}${endpoint}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, ...(options.headers || {}) }
    });
    if (res.status === 401) { localStorage.clear(); window.location.href = 'login.html'; return; }
    return res.json();
  }

  // ── Navigation ──
  const navItems = document.querySelectorAll('.dash-nav-item');
  const pages = document.querySelectorAll('.dash-page');

  function navigateTo(page) {
    navItems.forEach(n => n.classList.toggle('active', n.dataset.page === page));
    pages.forEach(p => p.classList.toggle('active', p.id === `page-${page}`));
    loadPage(page);
    // Close mobile sidebar
    document.getElementById('sidebar').classList.remove('open');
  }

  navItems.forEach(item => item.addEventListener('click', () => navigateTo(item.dataset.page)));

  // Handle hash navigation (for QR code links)
  function handleHash() {
    const hash = window.location.hash.replace('#', '');
    if (hash.startsWith('stock/')) {
      navigateTo('stock');
    } else if (hash.startsWith('consumables')) {
      navigateTo('consumables');
    } else if (hash) {
      navigateTo(hash);
    }
  }
  window.addEventListener('hashchange', handleHash);

  // ── Logout ──
  function logout() { localStorage.clear(); window.location.href = 'login.html'; }
  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('logoutBtnMobile')?.addEventListener('click', logout);

  // ── Mobile Menu ──
  document.getElementById('menuToggle')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  // ── Page Loaders ──
  async function loadPage(page) {
    switch(page) {
      case 'overview': return loadOverview();
      case 'stock': return loadStock();
      case 'consumables': return loadConsumables();
      case 'docs': return loadDocs();

      case 'scholars': return user.role === 'pi' ? loadScholars() : null;
      case 'profile': return loadProfile();
    }
  }

  // ══════════════════════════════════════
  // ── OVERVIEW PAGE
  // ══════════════════════════════════════
  async function loadOverview() {
    const el = document.getElementById('page-overview');

    const html = `
      <div class="dash-header" style="margin-bottom: 32px;">
        <h1>Welcome, ${user.role === 'pi' ? 'Dr. Bhattacharjee' : user.name.split(' ').pop()}</h1>
        <p>Bacteria Stock Registry — Standard Operating Procedure (SOP)</p>
      </div>

      <div style="background: white; border: var(--border-light); padding: 32px; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
        <h3 style="font-family: var(--font-display); font-size: 1.5rem; margin-bottom: 24px; color: var(--brand-orange); border-bottom: 2px solid var(--color-warm-border); padding-bottom: 12px;">How to use the Stock Registry</h3>

        <p style="color: var(--color-text-secondary); margin-bottom: 16px; line-height: 1.6;">
          The Stock Registry is the central database for all bacterial strains and vials stored in the MMI Lab <strong>-80°C freezer</strong>.
          To maintain an accurate inventory and prevent loss of critical strains, please follow these guidelines carefully.
        </p>

        <div style="background: rgba(209, 90, 43, 0.06); border: 1px solid var(--color-warm-border); padding: 16px; border-radius: 4px; margin-bottom: 24px;">
          <h4 style="margin-bottom: 8px; font-size: 0.9rem;">Our -80°C Freezer Layout</h4>
          <p style="color: var(--color-text-secondary); font-size: 0.85rem; line-height: 1.6; margin-bottom: 8px;">
            We have <strong>one -80°C freezer</strong> with two storage areas:
          </p>
          <ul style="color: var(--color-text-secondary); font-size: 0.85rem; margin-left: 20px; line-height: 1.6;">
            <li><strong>Top Shelf</strong> — Samples are stored here (cryovials in labeled boxes).</li>
            <li><strong>Below Top Shelf</strong> — Additional storage area for samples.</li>
          </ul>
          <p style="color: var(--color-text-secondary); font-size: 0.85rem; line-height: 1.6; margin-top: 8px;">
            When adding stock, always select the correct <strong>Shelf</strong>, then specify the <strong>Box</strong> (e.g., Box W1, Box M1) and <strong>Grid Position</strong> (e.g., A1, B3).
          </p>
        </div>

        <div style="display: grid; gap: 24px; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));">

          <div style="padding: 20px; background: var(--color-warm-surface); border: 1px solid var(--color-warm-border); border-radius: 4px;">
            <h4 style="margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--brand-orange)" stroke-width="2" style="width:18px;height:18px;"><path d="M12 5v14M5 12h14"/></svg>
              Step 1: Adding a New Stock
            </h4>
            <ol style="color: var(--color-text-secondary); font-size: 0.9rem; margin-left: 20px; line-height: 1.6;">
              <li>Go to <strong>"Stock Registry"</strong> in the sidebar and click <strong>"+ Add Stock"</strong>.</li>
              <li>Enter the <strong>Vial ID</strong> using the format: <code style="background: rgba(0,0,0,0.06); padding: 1px 4px;">XX-NN-T</code> (e.g., <code style="background: rgba(0,0,0,0.06); padding: 1px 4px;">VC-03-W</code> for Vibrio cholerae, vial 3, Working).</li>
              <li>Choose <strong>Master</strong> (never to be routinely cultured) or <strong>Working</strong> stock.</li>
              <li>Select the <strong>Shelf</strong> (Top Shelf or Below Top Shelf), then enter the <strong>Box</strong> and <strong>Grid position</strong>.</li>
              <li>Click <strong>"Add Stock"</strong> to save.</li>
            </ol>
          </div>

          <div style="padding: 20px; background: var(--color-warm-surface); border: 1px solid var(--color-warm-border); border-radius: 4px;">
            <h4 style="margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--brand-orange)" stroke-width="2" style="width:18px;height:18px;"><path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
              Step 2: Check-Out / Check-In
            </h4>
            <ol style="color: var(--color-text-secondary); font-size: 0.9rem; margin-left: 20px; line-height: 1.6;">
              <li>When <strong>removing</strong> a vial from the freezer, click <strong>"Check Out"</strong> on that row. The status changes to <span class="badge badge-in-use">In Use</span>.</li>
              <li>When <strong>returning</strong> the vial to its exact location, click <strong>"Check In"</strong>. The status returns to <span class="badge badge-available">Available</span>.</li>
              <li>Every check-out/in is logged with your name and timestamp for accountability.</li>
            </ol>
          </div>

          <div style="padding: 20px; background: var(--color-warm-surface); border: 1px solid var(--color-warm-border); border-radius: 4px;">
            <h4 style="margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--brand-orange)" stroke-width="2" style="width:18px;height:18px;"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/></svg>
              Depleting & Deleting
            </h4>
            <ul style="color: var(--color-text-secondary); font-size: 0.9rem; margin-left: 20px; line-height: 1.6;">
              <li>If a vial is emptied, contaminated, or destroyed — <strong>do not delete</strong> the record. Click <strong>"Mark Depleted"</strong> instead to keep the history.</li>
              <li><strong style="color: #dc2626;">Never deplete a Master Stock</strong> without permission from the PI.</li>
              <li>Only the <strong>person who added the entry</strong> (or the PI) can delete it.</li>
            </ul>
          </div>

          <div style="padding: 20px; background: var(--color-warm-surface); border: 1px solid var(--color-warm-border); border-radius: 4px;">
            <h4 style="margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--brand-orange)" stroke-width="2" style="width:18px;height:18px;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><path d="M7 7h.01M17 7h.01M7 17h.01M17 17h.01"/></svg>
              QR Codes & History
            </h4>
            <ul style="color: var(--color-text-secondary); font-size: 0.9rem; margin-left: 20px; line-height: 1.6;">
              <li>Click <strong>"QR"</strong> on any vial to generate a printable QR code label.</li>
              <li>Affix the printed QR label securely to the cryovial <strong>before</strong> freezing.</li>
              <li>Click <strong>"Log"</strong> to view the full activity history (who added, checked out, checked in, etc.).</li>
            </ul>
          </div>

        </div>
      </div>
    `;
    el.innerHTML = html;
  }

  // ══════════════════════════════════════
  // ── STOCK REGISTRY PAGE
  // ══════════════════════════════════════
  async function loadStock() {
    const el = document.getElementById('page-stock');
    el.innerHTML = `
      <div class="dash-header">
        <h1>Bacteria Stock Registry</h1>
        <p>Search, manage, and track all bacterial strains</p>
      </div>
      <div class="dash-toolbar" style="flex-wrap: wrap; gap: 12px;">
        <input class="dash-search" id="stockSearch" type="text" placeholder="Search by Phenotype (e.g. biofilm) or Location..." style="flex: 1; min-width: 200px;">
        <select class="dash-select" id="organismFilter" style="min-width: 150px;">
          <option value="all">All Organisms</option>
        </select>
        <select class="dash-select" id="typeFilter" style="min-width: 140px;">
          <option value="all">All Types</option>
          <option value="Master">Master Stocks</option>
          <option value="Working" selected>Working Stocks</option>
        </select>
        <select class="dash-select" id="stockFilter" style="min-width: 130px;">
          <option value="all">All Status</option>
          <option value="Available">Available</option>
          <option value="In Use">In Use</option>
          <option value="Depleted">Depleted</option>
        </select>
        <button class="dash-btn" id="addStrainBtn">+ Add Stock</button>
      </div>
      <div id="stockTable"></div>
    `;

    let searchTimeout;
    const searchInput = document.getElementById('stockSearch');
    const orgSelect = document.getElementById('organismFilter');
    const typeSelect = document.getElementById('typeFilter');
    const filterSelect = document.getElementById('stockFilter');

    // Populate organisms
    const orgs = await api('/strains/organisms');
    orgs.forEach(o => orgSelect.add(new Option(o, o)));

    async function refreshStock() {
      const search = searchInput.value;
      const org = orgSelect.value;
      const type = typeSelect.value;
      const status = filterSelect.value;
      const strains = await api(`/strains?search=${encodeURIComponent(search)}&organism=${encodeURIComponent(org)}&stockType=${encodeURIComponent(type)}&status=${encodeURIComponent(status)}`);
      renderStrainTable(strains);
    }

    searchInput.addEventListener('input', () => { clearTimeout(searchTimeout); searchTimeout = setTimeout(refreshStock, 300); });
    orgSelect.addEventListener('change', refreshStock);
    typeSelect.addEventListener('change', refreshStock);
    filterSelect.addEventListener('change', refreshStock);
    document.getElementById('addStrainBtn').addEventListener('click', showAddStrainModal);
    refreshStock();
  }

  function renderStrainTable(strains) {
    const el = document.getElementById('stockTable');
    if (!strains.length) {
      el.innerHTML = '<div style="padding: 40px; text-align: center; border: var(--border-light); background: white;"><p style="color: var(--color-text-secondary);">No strains found.</p></div>';
      return;
    }
    el.innerHTML = `<div class="dash-table-wrap"><table class="dash-table">
      <thead><tr><th>Vial ID</th><th>Organism</th><th>Phenotype / Resistance</th><th>Location</th><th>Stock Type</th><th>Added By</th><th>Action</th></tr></thead>
      <tbody>${strains.map(s => {
        const canDelete = user.role === 'pi' || s.added_by === user.id;
        return `<tr>
        <td><strong>${s.Vial_ID}</strong></td>
        <td><em>${s.Organism}</em></td>
        <td><span style="font-size: 0.8rem;">${s.Phenotype_Notes || '—'}</span></td>
        <td><span style="font-size: 0.8rem;">${s.Freezer_Location || '—'}</span></td>
        <td><span class="badge ${s.Stock_Type === 'Master' ? 'badge-depleted' : 'badge-active'}" style="opacity:0.8">${s.Stock_Type}</span></td>
        <td><span style="font-size: 0.8rem;">${s.added_by_name || '—'}</span></td>
        <td>
          <div style="font-weight: 600; margin-bottom: 4px; font-size: 0.7rem; color: var(--color-text-secondary);">
            <span class="badge badge-${s.Status === 'Available' ? 'available' : s.Status === 'In Use' ? 'in-use' : 'depleted'}">${s.Status}</span>
          </div>
          <button class="dash-btn" style="padding: 6px 12px; font-size: 0.65rem; margin-bottom: 2px;" onclick="window.dashApp.showEditStrainModal('${s.Vial_ID}')">Edit</button>
          ${s.Status === 'Available' ? `<button class="dash-btn" style="padding: 6px 12px; font-size: 0.65rem;" onclick="window.dashApp.checkoutStrain('${s.Vial_ID}')">Check Out</button>` : ''}
          ${s.Status === 'In Use' ? `<button class="dash-btn-outline" style="padding: 6px 12px; font-size: 0.65rem;" onclick="window.dashApp.checkinStrain('${s.Vial_ID}')">Check In</button>` : ''}
          <button class="dash-btn-outline" style="padding: 6px 12px; font-size: 0.65rem; margin-top:2px;" onclick="window.dashApp.showQR('${s.Vial_ID}')">QR</button>
          <button class="dash-btn-outline" style="padding: 6px 12px; font-size: 0.65rem; margin-top:2px;" onclick="window.dashApp.showHistory('${s.Vial_ID}')">Log</button>
          ${canDelete ? `<button class="dash-btn-outline" style="padding: 6px 12px; font-size: 0.65rem; margin-top:2px; color: #dc2626; border-color: rgba(220,38,38,0.3);" onclick="window.dashApp.deleteStrain('${s.Vial_ID}')">Delete</button>` : ''}
        </td>
      </tr>`;
      }).join('')}</tbody>
    </table></div>`;
  }

  // ── Modal System ──
  function showModal(title, content, actions) {
    let overlay = document.querySelector('.dash-modal-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'dash-modal-overlay';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `<div class="dash-modal">
      <h2>${title}</h2>
      <div>${content}</div>
      <div class="dash-modal-actions">${actions || ''}</div>
    </div>`;
    overlay.classList.add('active');
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  }
  function closeModal() { document.querySelector('.dash-modal-overlay')?.classList.remove('active'); }

  // deleteStrain is now on window.dashApp below

  function showAddStrainModal() {
    showModal('Add New Stock Vial', `
      <p style="margin-bottom: 20px; padding: 12px; background: var(--color-warm-surface); border: 1px solid var(--color-warm-border); border-radius: 4px; font-size: 0.85rem; color: var(--color-text-secondary);">
        <strong>Naming convention:</strong> Use format <code>XX-NN-T</code> where XX = organism code (e.g. VC, SA, AB), NN = serial number, T = M (Master) or W (Working). Example: <code>VC-03-W</code>
      </p>
      <div class="dash-form-group"><label class="dash-form-label">Vial ID *</label><input class="dash-input" id="newVialId" placeholder="e.g. VC-03-W"></div>
      <div class="dash-form-group"><label class="dash-form-label">Organism *</label><input class="dash-input" id="newOrganism" placeholder="e.g. Vibrio cholerae O1 El Tor"></div>
      <div class="dash-form-group">
        <label class="dash-form-label">Stock Type *</label>
        <select class="dash-input" id="newStockType">
            <option value="Working">Working Stock</option>
            <option value="Master">Master Stock</option>
        </select>
      </div>
      <div class="dash-form-group"><label class="dash-form-label">Phenotype / Resistance Notes</label><textarea class="dash-input dash-textarea" id="newNotes" placeholder="e.g. Ampicillin-resistant, heavy metal tolerant, high biofilm former..."></textarea></div>
      <fieldset style="border: var(--border-light); padding: 16px; margin-bottom: 20px;">
        <legend style="font-size: 0.7rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--color-text-secondary); padding: 0 8px;">Freezer Location (-80°C)</legend>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div class="dash-form-group" style="margin-bottom: 0;">
            <label class="dash-form-label">Shelf *</label>
            <select class="dash-input" id="newShelf">
                <option value="">Select shelf...</option>
                <option value="Top Shelf">Top Shelf</option>
                <option value="Below Top Shelf">Below Top Shelf</option>
            </select>
          </div>
          <div class="dash-form-group" style="margin-bottom: 0;">
            <label class="dash-form-label">Box / Rack</label>
            <input class="dash-input" id="newBox" placeholder="e.g. Box W1">
          </div>
        </div>
        <div class="dash-form-group" style="margin-top: 12px; margin-bottom: 0;">
          <label class="dash-form-label">Grid Position</label>
          <input class="dash-input" id="newGrid" placeholder="e.g. A1, B3">
        </div>
      </fieldset>
    `, `<button class="dash-btn-outline" onclick="window.dashApp.closeModal()">Cancel</button>
       <button class="dash-btn" onclick="window.dashApp.addStrain()">Add Stock</button>`);
  }

  // ══════════════════════════════════════
  // ── CONSUMABLES TRACKING PAGE
  // ══════════════════════════════════════
  const CONSUMABLE_TYPES = ['Petri Plate 90mm', 'Cryo Vial Box', '96-Well Plate', '24-Well Plate', 'Syringe Filter 0.22um', 'Ethanol'];
  const isBoxManager = user.role === 'pi' || user.email === 'argajit05@gmail.com';

  async function loadConsumables() {
    const el = document.getElementById('page-consumables');
    el.innerHTML = `
      <div class="dash-header">
        <h1>Consumables Tracker</h1>
        <p>FIFO batch management with append-only audit ledger</p>
      </div>
      <div class="dash-toolbar" style="flex-wrap: wrap; gap: 12px;">
        <select class="dash-select" id="consTypeFilter" style="min-width: 180px;">
          <option value="all">All Item Types</option>
          ${CONSUMABLE_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
        </select>
        <button class="dash-btn-outline" id="consLedgerBtn">View Full Ledger</button>
        ${isBoxManager ? '<button class="dash-btn" id="consAddBoxBtn">+ Add New Box</button>' : ''}
      </div>
      <div id="consSummary" style="margin-bottom: 24px;"></div>
      <div id="consBoxes"></div>
    `;

    const typeFilter = document.getElementById('consTypeFilter');
    typeFilter.addEventListener('change', refreshConsumables);
    document.getElementById('consLedgerBtn').addEventListener('click', () => window.dashApp.showFullLedger());
    if (isBoxManager) {
      document.getElementById('consAddBoxBtn').addEventListener('click', () => window.dashApp.showAddBoxModal());
    }
    refreshConsumables();
  }

  async function refreshConsumables() {
    const typeVal = document.getElementById('consTypeFilter').value;
    const [boxes, summary] = await Promise.all([
      api(`/consumables?item_type=${encodeURIComponent(typeVal)}`),
      api('/consumables/summary')
    ]);
    renderConsSummary(summary);
    renderConsBoxes(boxes);
  }

  function renderConsSummary(summary) {
    const el = document.getElementById('consSummary');
    if (!summary.length) { el.innerHTML = ''; return; }
    el.innerHTML = `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
      ${summary.map(s => `
        <div style="background: white; border: var(--border-light); padding: 16px; border-radius: 4px;">
          <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-secondary); margin-bottom: 4px;">${s.item_type}</div>
          <div style="font-size: 1.5rem; font-weight: 700; color: var(--brand-orange);">${s.total_qty}</div>
          <div style="font-size: 0.75rem; color: var(--color-text-secondary);">${s.active_boxes} active box${s.active_boxes !== 1 ? 'es' : ''} &middot; ${s.empty_boxes} empty</div>
        </div>
      `).join('')}
    </div>`;
  }

  function renderConsBoxes(boxes) {
    const el = document.getElementById('consBoxes');
    if (!boxes.length) {
      el.innerHTML = '<div style="padding: 40px; text-align: center; border: var(--border-light); background: white;"><p style="color: var(--color-text-secondary);">No boxes found. ' + (isBoxManager ? 'Click "+ Add New Box" to start.' : 'Ask Argajit or the PI to add boxes.') + '</p></div>';
      return;
    }

    // Group by item type
    const grouped = {};
    boxes.forEach(b => { (grouped[b.item_type] = grouped[b.item_type] || []).push(b); });

    el.innerHTML = Object.entries(grouped).map(([type, typeBoxes]) => `
      <div style="margin-bottom: 32px;">
        <h3 style="font-family: var(--font-display); font-size: 1.1rem; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid var(--color-warm-border);">${type}</h3>
        <div class="dash-table-wrap"><table class="dash-table">
          <thead><tr><th>Box Label</th><th>Status</th><th>Remaining</th><th>Progress</th><th>Added By</th><th>Date Added</th><th>Actions</th></tr></thead>
          <tbody>${typeBoxes.map(b => {
            const pct = b.initial_qty > 0 ? Math.round((b.current_qty / b.initial_qty) * 100) : 0;
            const barColor = pct > 50 ? '#22c55e' : pct > 20 ? '#eab308' : '#ef4444';
            const statusBadge = b.status === 'active' ? 'badge-available' : b.status === 'locked' ? 'badge-in-use' : 'badge-depleted';
            const statusLabel = b.status === 'active' ? 'Active (Use This)' : b.status === 'locked' ? 'Locked (FIFO Queue)' : 'Empty';
            return `<tr style="${b.status === 'active' ? 'background: rgba(34,197,94,0.04);' : b.status === 'empty' ? 'opacity: 0.5;' : ''}">
              <td><strong>${b.box_label}</strong></td>
              <td><span class="badge ${statusBadge}">${statusLabel}</span></td>
              <td><strong>${b.current_qty}</strong> / ${b.initial_qty}</td>
              <td style="min-width: 120px;">
                <div style="background: #e5e7eb; border-radius: 4px; height: 8px; overflow: hidden;">
                  <div style="background: ${barColor}; height: 100%; width: ${pct}%; transition: width 0.3s;"></div>
                </div>
                <span style="font-size: 0.7rem; color: var(--color-text-secondary);">${pct}%</span>
              </td>
              <td style="font-size: 0.8rem;">${b.added_by_name || '—'}</td>
              <td style="font-size: 0.8rem;">${new Date(b.added_at).toLocaleDateString()}</td>
              <td>
                ${b.status === 'active' ? `<button class="dash-btn" style="padding: 6px 12px; font-size: 0.65rem;" onclick="window.dashApp.showWithdrawModal(${b.id})">Withdraw</button>` : ''}
                ${b.status === 'active' ? `<button class="dash-btn-outline" style="padding: 6px 12px; font-size: 0.65rem; margin-top:2px;" onclick="window.dashApp.showCorrectionModal(${b.id})">Correction</button>` : ''}
                <button class="dash-btn-outline" style="padding: 6px 12px; font-size: 0.65rem; margin-top:2px;" onclick="window.dashApp.showBoxLedger(${b.id}, '${b.box_label.replace(/'/g, "\\'")}')">Ledger</button>
                ${isBoxManager && b.status !== 'empty' ? `<button class="dash-btn-outline" style="padding: 6px 12px; font-size: 0.65rem; margin-top:2px; color: #dc2626; border-color: rgba(220,38,38,0.3);" onclick="window.dashApp.markBoxEmpty(${b.id})">Mark Empty</button>` : ''}
                ${isBoxManager ? `<button class="dash-btn-outline" style="padding: 6px 12px; font-size: 0.65rem; margin-top:2px; color: #dc2626; border-color: rgba(220,38,38,0.3);" onclick="window.dashApp.deleteBox(${b.id}, '${b.box_label.replace(/'/g, "\\'")}')">Delete</button>` : ''}
              </td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>
      </div>
    `).join('');
  }

  // ══════════════════════════════════════
  // ── DOCUMENTS PAGE
  // ══════════════════════════════════════
  // ── Document category & folder definitions ──
  const DOC_CATEGORIES = [
    { value: 'Protocol', label: 'Protocol / SOP' },
    { value: 'Budget', label: 'Budget' },
    { value: 'Bill', label: 'Bill / Invoice / Receipt' },
    { value: 'CV', label: 'CV / Resume' },
    { value: 'Draft', label: 'Draft / Manuscript' },
    { value: 'Forwarding Letter', label: 'Forwarding Letter' },
    { value: 'Project Proposal', label: 'Project Proposal' },
    { value: 'Report', label: 'Report' },
    { value: 'Thesis', label: 'Thesis / Dissertation' },
    { value: 'Publication', label: 'Publication / Paper' },
    { value: 'Certificate', label: 'Certificate' },
    { value: 'Agreement', label: 'MoU / Agreement' },
    { value: 'Uncategorized', label: 'Uncategorized' }
  ];

  const DOC_FOLDERS = [
    { value: '', label: 'No Folder (General)' },
    { value: 'DBT Project', label: 'DBT Project' },
    { value: 'ICMR Project', label: 'ICMR Project' },
    { value: 'DST Project', label: 'DST Project' },
    { value: 'SERB Project', label: 'SERB Project' },
    { value: 'UGC Project', label: 'UGC Project' },
    { value: 'Lab Admin', label: 'Lab Administration' },
    { value: 'Personal', label: 'Personal Documents' }
  ];

  async function loadDocs() {
    const el = document.getElementById('page-docs');

    // Fetch folder summary and projects in parallel
    let folderData = { total: 0, tagCounts: [], projectCounts: [], folderCounts: [] };
    let projects = [];
    try {
      [folderData, projects] = await Promise.all([
        api('/docs/folders'),
        api('/projects')
      ]);
    } catch(e) { /* continue with defaults */ }

    const catOptions = DOC_CATEGORIES.map(c => `<option value="${c.value}">${c.label}</option>`).join('');
    const folderOptions = DOC_FOLDERS.map(f => `<option value="${f.value}">${f.label}</option>`).join('');
    const projectOptions = (projects || []).map(p => `<option value="${p.id}">${p.title}</option>`).join('');

    el.innerHTML = `
      <div class="dash-header">
        <h1>Document Repository</h1>
        <p>Organize, search, and manage all lab documents by category, project, or folder</p>
      </div>

      <div style="display: flex; gap: 20px; flex-wrap: wrap;">
        <!-- Left sidebar: Folder navigation -->
        <div id="docSidebar" style="min-width: 220px; max-width: 260px; flex-shrink: 0;">
          <div style="border: var(--border-light); background: white;">
            <div style="padding: 14px 16px; border-bottom: var(--border-light); font-weight: 700; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-secondary);">Browse</div>

            <div class="doc-folder-item active" data-filter="all" data-type="all" style="padding: 12px 16px; cursor: pointer; font-size: 0.9rem; display: flex; justify-content: space-between; border-bottom: var(--border-light);">
              <span>All Documents</span>
              <span style="background: var(--brand-orange); color: white; font-size: 0.75rem; padding: 2px 8px; border-radius: 10px;">${folderData.total || 0}</span>
            </div>

            <div style="padding: 10px 16px 6px; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-secondary);">By Category</div>
            ${(folderData.tagCounts || []).map(t => `
              <div class="doc-folder-item" data-filter="${t.tag}" data-type="tag" style="padding: 8px 16px 8px 24px; cursor: pointer; font-size: 0.85rem; display: flex; justify-content: space-between;">
                <span>${t.tag}</span>
                <span style="color: var(--color-text-secondary); font-size: 0.8rem;">${t.count}</span>
              </div>
            `).join('')}

            ${(folderData.folderCounts || []).length ? `
              <div style="padding: 10px 16px 6px; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-secondary); border-top: var(--border-light); margin-top: 4px;">By Folder</div>
              ${(folderData.folderCounts || []).map(f => `
                <div class="doc-folder-item" data-filter="${f.folder}" data-type="folder" style="padding: 8px 16px 8px 24px; cursor: pointer; font-size: 0.85rem; display: flex; justify-content: space-between;">
                  <span>${f.folder}</span>
                  <span style="color: var(--color-text-secondary); font-size: 0.8rem;">${f.count}</span>
                </div>
              `).join('')}
            ` : ''}

            ${(folderData.projectCounts || []).length ? `
              <div style="padding: 10px 16px 6px; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-secondary); border-top: var(--border-light); margin-top: 4px;">By Project</div>
              ${(folderData.projectCounts || []).map(p => `
                <div class="doc-folder-item" data-filter="${p.project_id}" data-type="project" style="padding: 8px 16px 8px 24px; cursor: pointer; font-size: 0.85rem; display: flex; justify-content: space-between;">
                  <span>${p.project_title || 'Unnamed Project'}</span>
                  <span style="color: var(--color-text-secondary); font-size: 0.8rem;">${p.count}</span>
                </div>
              `).join('')}
            ` : ''}
          </div>
        </div>

        <!-- Right content: Search + documents -->
        <div style="flex: 1; min-width: 0;">
          <div class="dash-toolbar" style="flex-wrap: wrap; gap: 12px; margin-bottom: 16px;">
            <input class="dash-search" id="docSearch" type="text" placeholder="Search inside documents (full-text search)..." style="flex: 1; min-width: 200px;">
            <button class="dash-btn" id="uploadDocBtn">+ Upload Document</button>
          </div>
          <div id="docCurrentFilter" style="margin-bottom: 12px; font-size: 0.85rem; color: var(--color-text-secondary);"></div>
          <div id="docsContainer" class="dash-cards" style="grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));"></div>
        </div>
      </div>
    `;

    // Current filter state
    let currentFilter = { type: 'all', value: 'all' };
    let searchTimeout;
    const searchInput = document.getElementById('docSearch');

    async function refreshDocs() {
      const search = searchInput.value;
      let url = `/docs?search=${encodeURIComponent(search)}`;
      if (currentFilter.type === 'tag') url += `&tag=${encodeURIComponent(currentFilter.value)}`;
      else if (currentFilter.type === 'folder') url += `&folder=${encodeURIComponent(currentFilter.value)}`;
      else if (currentFilter.type === 'project') url += `&project_id=${encodeURIComponent(currentFilter.value)}`;

      const docs = await api(url);
      renderDocs(docs, search);

      // Update filter label
      const filterEl = document.getElementById('docCurrentFilter');
      if (currentFilter.type === 'all') filterEl.textContent = '';
      else if (currentFilter.type === 'tag') filterEl.textContent = `Showing: ${currentFilter.value}`;
      else if (currentFilter.type === 'folder') filterEl.textContent = `Folder: ${currentFilter.value}`;
      else if (currentFilter.type === 'project') filterEl.textContent = `Project documents`;
    }

    // Sidebar click handlers
    el.querySelectorAll('.doc-folder-item').forEach(item => {
      item.addEventListener('click', () => {
        el.querySelectorAll('.doc-folder-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        currentFilter = { type: item.dataset.type, value: item.dataset.filter };
        refreshDocs();
      });
    });

    searchInput.addEventListener('input', () => { clearTimeout(searchTimeout); searchTimeout = setTimeout(refreshDocs, 400); });
    document.getElementById('uploadDocBtn').addEventListener('click', () => showUploadDocModal(projects));

    refreshDocs();
  }

  function getFileIcon(mimetype) {
    if (mimetype.includes('pdf')) return '<svg viewBox="0 0 24 24" fill="none" stroke="#e65100" stroke-width="1.5" style="width:28px;height:28px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>';
    if (mimetype.includes('word') || mimetype.includes('document')) return '<svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="1.5" style="width:28px;height:28px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>';
    if (mimetype.includes('image')) return '<svg viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="1.5" style="width:28px;height:28px;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:28px;height:28px;"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>';
  }

  function formatBytes(bytes) {
    if (bytes == 0) return '0 Bytes';
    var k = 1024, dm = 2, sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'], i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  function renderDocs(docs, searchPhrase) {
    const el = document.getElementById('docsContainer');
    if (!docs || !docs.length) {
      el.innerHTML = '<div style="grid-column: 1 / -1; padding: 40px; text-align: center; border: var(--border-light); background: white;"><p style="color: var(--color-text-secondary);">No documents found. Upload one to get started.</p></div>';
      return;
    }

    const highlight = (text) => {
      if (!searchPhrase) return text;
      try {
        const regex = new RegExp(`(${searchPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return text.replace(regex, '<span class="doc-search-highlight">$1</span>');
      } catch(e) { return text; }
    };

    const currentToken = localStorage.getItem('mmilab_token');

    el.innerHTML = docs.map(d => `
      <div class="doc-card" style="display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <div style="display: flex; align-items: flex-start; gap: 10px; margin-bottom: 10px;">
            <div style="flex-shrink: 0;">${getFileIcon(d.mimetype)}</div>
            <div style="min-width: 0;">
              <div class="doc-title" style="font-weight: 600; font-size: 0.9rem; word-break: break-word;">${highlight(d.original_name)}</div>
            </div>
          </div>
          <div class="doc-meta" style="font-size: 0.8rem; color: var(--color-text-secondary); line-height: 1.6;">
            <span class="badge badge-active" style="margin-right: 4px;">${d.tag}</span>
            ${d.folder ? `<span class="badge" style="background: #e0e7ff; color: #3730a3; margin-right: 4px;">${d.folder}</span>` : ''}
            ${d.project_title ? `<span class="badge" style="background: #fef3c7; color: #92400e;">${d.project_title}</span>` : ''}<br>
            Uploaded by <strong>${d.uploader_name || 'Unknown'}</strong><br>
            ${new Date(d.upload_date).toLocaleDateString()} &bull; ${formatBytes(d.size)}
          </div>
        </div>
        <div class="doc-actions" style="display: flex; gap: 8px; margin-top: 12px;">
          <a href="/api/docs/${d.id}/download?token=${currentToken}" target="_blank" class="dash-btn" style="text-decoration: none; flex: 1; text-align: center; font-size: 0.85rem;">Download</a>
          ${(d.uploader_id === user.id || user.role === 'pi') ? `<button class="dash-btn-outline" style="padding: 8px 10px;" onclick="window.dashApp.deleteDoc(${d.id})" title="Delete document"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:16px;height:16px;"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/></svg></button>` : ''}
        </div>
      </div>
    `).join('');
  }

  function showUploadDocModal(projects) {
    const catOptions = DOC_CATEGORIES.map(c => `<option value="${c.value}" ${c.value === 'Uncategorized' ? 'selected' : ''}>${c.label}</option>`).join('');
    const folderOptions = DOC_FOLDERS.map(f => `<option value="${f.value}">${f.label}</option>`).join('');
    const projectOptions = (projects || []).map(p => `<option value="${p.id}">${p.title}</option>`).join('');

    showModal('Upload Document', `
      <form id="uploadDocForm">
        <p style="margin-bottom: 16px; color: var(--color-text-secondary); font-size: 0.85rem;">Upload PDFs, Word Documents, Images, or Text files. They will be scanned and fully indexed for searching.</p>

        <div class="dash-form-group">
          <label class="dash-form-label">Document File *</label>
          <input type="file" id="docFile" class="dash-input" accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.xls,.xlsx,.csv" required>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div class="dash-form-group">
            <label class="dash-form-label">Category *</label>
            <select class="dash-input" id="docTag">${catOptions}</select>
          </div>
          <div class="dash-form-group">
            <label class="dash-form-label">Folder</label>
            <select class="dash-input" id="docFolder">${folderOptions}</select>
          </div>
        </div>

        ${projectOptions ? `
        <div class="dash-form-group">
          <label class="dash-form-label">Link to Project (optional)</label>
          <select class="dash-input" id="docProject">
            <option value="">-- None --</option>
            ${projectOptions}
          </select>
        </div>
        ` : ''}

        <div class="dash-form-group">
          <label style="display: flex; align-items: center; gap: 8px; font-size: 0.9rem;">
            <input type="checkbox" id="docIsPublic" checked> Make available to all scholars in the lab
          </label>
        </div>

        <div id="uploadStatus" style="margin-top: 12px; font-weight: 600; color: var(--brand-orange); display: none;">Uploading and indexing...</div>
      </form>
    `, `<button class="dash-btn-outline" onclick="window.dashApp.closeModal()">Cancel</button>
       <button class="dash-btn" onclick="document.getElementById('uploadDocForm').dispatchEvent(new Event('submit'))">Upload & Index</button>`);

    document.getElementById('uploadDocForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fileInput = document.getElementById('docFile');
      if (!fileInput.files.length) return alert('Please select a file.');

      document.getElementById('uploadStatus').style.display = 'block';

      const formData = new FormData();
      formData.append('document', fileInput.files[0]);
      formData.append('tag', document.getElementById('docTag').value);
      formData.append('folder', document.getElementById('docFolder').value);
      formData.append('isPublic', document.getElementById('docIsPublic').checked);
      const projSelect = document.getElementById('docProject');
      if (projSelect && projSelect.value) formData.append('project_id', projSelect.value);

      try {
        const res = await fetch('/api/docs', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });

        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error((data && data.error) || 'Upload failed');
        }

        closeModal();

        // Show indexing feedback
        if (data && data.indexed_chars !== undefined) {
          if (data.indexed_chars > 0) {
            console.log(`Document indexed: ${data.indexed_chars} characters extracted for search.`);
          } else {
            alert('Document uploaded, but no searchable text could be extracted. The file may be scanned/image-based or in an unsupported format. You can still download it.');
          }
        }

        loadDocs();
      } catch (err) {
        alert('Upload failed: ' + err.message);
        document.getElementById('uploadStatus').style.display = 'none';
      }
    });
  }

  // ══════════════════════════════════════
  // ── PROJECTS PAGE
  // ══════════════════════════════════════
  async function loadProjects() {
    const el = document.getElementById('page-projects');
    const projects = await api('/projects');
    el.innerHTML = `
      <div class="dash-header">
        <h1>Projects</h1>
        <p>Active and completed funded research projects</p>
      </div>
      ${user.role === 'pi' ? `<div style="margin-bottom: 20px;"><button class="dash-btn" onclick="window.dashApp.showAddProject()">+ Add Project</button></div>` : ''}
      <div class="dash-cards">
        ${projects.length ? projects.map(p => `
          <div class="dash-card">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
              <div class="dash-card-title">${p.title}</div>
              <span class="badge badge-${p.status}">${p.status}</span>
            </div>
            ${p.funding_agency ? `<div style="font-size: 0.8rem; color: var(--color-text-secondary); margin-bottom: 8px;">Funded by: <strong>${p.funding_agency}</strong></div>` : ''}
            ${p.description ? `<p style="font-size: 0.85rem; color: var(--color-text-secondary); margin-bottom: 12px;">${p.description}</p>` : ''}
            <div style="font-size: 0.75rem; color: var(--color-text-secondary);">
              ${p.start_date ? `${p.start_date}${p.end_date ? ' → ' + p.end_date : ''}` : ''}
            </div>
            ${p.member_names ? `<div style="margin-top: 12px; font-size: 0.8rem;">Team: ${p.member_names}</div>` : ''}
          </div>
        `).join('') : '<p style="color: var(--color-text-secondary);">No projects yet. ${user.role === "pi" ? "Click the button above to add one." : ""}</p>'}
      </div>
    `;
  }

  // ══════════════════════════════════════
  // ── ALL SCHOLARS PAGE (PI only)
  // ══════════════════════════════════════
  async function loadScholars() {
    const el = document.getElementById('page-scholars');
    const data = await api('/dashboard/pi/overview');
    el.innerHTML = `
      <div class="dash-header">
        <h1>All Scholars</h1>
        <p>Overview of all lab members and their activity</p>
      </div>
      <div class="dash-cards">
        ${data.scholars.map(s => `
          <div class="dash-card">
            <div class="dash-card-header">
              <img class="dash-card-avatar" src="${s.photo_url || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%23E0D8CF%22 width=%22100%22 height=%22100%22/><text x=%2250%22 y=%2255%22 font-size=%2240%22 text-anchor=%22middle%22 fill=%22%236B6560%22>${s.name.charAt(0)}</text></svg>'}" alt="${s.name}">
              <div>
                <div class="dash-card-title">${s.name}</div>
                <div class="dash-card-subtitle">${s.email}</div>
              </div>
            </div>
            ${s.research_topic ? `<div style="font-size: 0.85rem; color: var(--color-text-secondary); margin-bottom: 8px;"><strong>Research:</strong> ${s.research_topic}</div>` : ''}
            ${s.enrollment_date ? `<div style="font-size: 0.8rem; color: var(--color-text-secondary);">Enrolled: ${s.enrollment_date}</div>` : ''}
          </div>
        `).join('')}
      </div>
    `;
  }

  // ══════════════════════════════════════
  // ── PROFILE PAGE
  // ══════════════════════════════════════
  async function loadProfile() {
    const el = document.getElementById('page-profile');
    const data = await api(`/dashboard/${user.id}`);
    const p = data.profile || {};

    el.innerHTML = `
      <div class="dash-header">
        <h1>My Profile</h1>
        <p>Edit your dashboard and research information</p>
      </div>
      <div style="border: var(--border-light); background: white; padding: 32px; max-width: 640px;">
        <div style="display: flex; align-items: center; gap: 20px; margin-bottom: 32px; padding-bottom: 24px; border-bottom: var(--border-light);">
          <img style="width: 72px; height: 72px; border-radius: 50%; object-fit: cover; background: var(--color-warm-surface);" src="${user.photo_url || ''}" alt="${user.name}">
          <div>
            <div style="font-size: 1.25rem; font-weight: 600;">${user.name}</div>
            <div style="font-size: 0.85rem; color: var(--color-text-secondary);">${user.email}</div>
            <span class="badge badge-${user.role}" style="margin-top: 6px;">${user.role === 'pi' ? 'Principal Investigator' : 'Scholar'}</span>
          </div>
        </div>
        <form id="profileForm">
          <div class="dash-form-group"><label class="dash-form-label">Research Topic</label><textarea class="dash-input dash-textarea" id="profTopic">${p.research_topic || ''}</textarea></div>
          <div class="dash-form-group"><label class="dash-form-label">Enrollment Date</label><input class="dash-input" id="profEnrollment" type="date" value="${p.enrollment_date || ''}"></div>
          <div class="dash-form-group"><label class="dash-form-label">Current Experiments</label><textarea class="dash-input dash-textarea" id="profExperiments">${p.current_experiments || ''}</textarea></div>
          <div class="dash-form-group"><label class="dash-form-label">Notes</label><textarea class="dash-input dash-textarea" id="profNotes">${p.notes || ''}</textarea></div>
          <button type="submit" class="dash-btn">Save Changes</button>
        </form>
        <div style="margin-top: 32px; padding-top: 24px; border-top: var(--border-light);">
          <h3 style="font-family: var(--font-display); margin-bottom: 16px;">Change Password</h3>
          <form id="passwordForm">
            <div class="dash-form-group"><label class="dash-form-label">Current Password</label><input class="dash-input" id="currentPw" type="password"></div>
            <div class="dash-form-group"><label class="dash-form-label">New Password</label><input class="dash-input" id="newPw" type="password" minlength="6"></div>
            <button type="submit" class="dash-btn-outline">Change Password</button>
          </form>
        </div>
      </div>
    `;

    document.getElementById('profileForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      await api(`/dashboard/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          research_topic: document.getElementById('profTopic').value,
          enrollment_date: document.getElementById('profEnrollment').value,
          current_experiments: document.getElementById('profExperiments').value,
          notes: document.getElementById('profNotes').value
        })
      });
      alert('Profile saved!');
    });

    document.getElementById('passwordForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const result = await api('/auth/change-password', {
          method: 'POST',
          body: JSON.stringify({
            currentPassword: document.getElementById('currentPw').value,
            newPassword: document.getElementById('newPw').value
          })
        });
        if (result.error) throw new Error(result.error);
        alert('Password changed!');
        document.getElementById('passwordForm').reset();
      } catch (err) {
        alert('Error: ' + err.message);
      }
    });
  } // <-- End of loadProfile

  // ══════════════════════════════════════
  // ── GLOBAL ACTIONS (exposed to window)
  // ══════════════════════════════════════
  window.dashApp = {
    closeModal,

    async addStrain() {
      const organism = document.getElementById('newOrganism').value.trim();
      const vialId = document.getElementById('newVialId').value.trim();
      const shelf = document.getElementById('newShelf').value;
      if (!organism || !vialId) return alert('Vial ID and Organism are required.');
      if (!shelf) return alert('Please select a shelf location (Top Shelf or Below Top Shelf).');

      // Build location string: "-80°C / Top Shelf / Box W1, A1"
      const box = document.getElementById('newBox').value.trim();
      const grid = document.getElementById('newGrid').value.trim();
      let location = `-80°C / ${shelf}`;
      if (box) location += ` / ${box}`;
      if (grid) location += `, ${grid}`;

      const result = await api('/strains', {
        method: 'POST',
        body: JSON.stringify({
          Vial_ID: vialId,
          Organism: organism,
          Stock_Type: document.getElementById('newStockType').value,
          Freezer_Location: location,
          Phenotype_Notes: document.getElementById('newNotes').value
        })
      });
      if (result.error) return alert(result.error);
      closeModal();
      loadStock();
    },

    async showEditStrainModal(id) {
      const strain = await api(`/strains/${id}`);
      // Parse existing location to pre-fill fields
      const loc = strain.Freezer_Location || '';
      let editShelf = '', editBox = '', editGrid = '';
      if (loc.includes('Top Shelf') && !loc.includes('Below')) editShelf = 'Top Shelf';
      else if (loc.includes('Below Top Shelf')) editShelf = 'Below Top Shelf';
      // Extract box and grid from location string like "-80°C / Top Shelf / Box W1, A1"
      const locParts = loc.split('/').map(p => p.trim());
      if (locParts.length >= 3) {
        const boxGrid = locParts.slice(2).join('/').trim();
        const commaIdx = boxGrid.indexOf(',');
        if (commaIdx > -1) {
          editBox = boxGrid.substring(0, commaIdx).trim();
          editGrid = boxGrid.substring(commaIdx + 1).trim();
        } else {
          editBox = boxGrid;
        }
      }

      showModal('Edit Stock Vial', `
        <div class="dash-form-group"><label class="dash-form-label">Vial ID</label><input class="dash-input" value="${strain.Vial_ID}" disabled></div>
        <div class="dash-form-group"><label class="dash-form-label">Organism *</label><input class="dash-input" id="editOrganism" value="${strain.Organism}"></div>
        <div class="dash-form-group">
          <label class="dash-form-label">Stock Type *</label>
          <select class="dash-input" id="editStockType">
              <option value="Working" ${strain.Stock_Type === 'Working' ? 'selected' : ''}>Working Stock</option>
              <option value="Master" ${strain.Stock_Type === 'Master' ? 'selected' : ''}>Master Stock</option>
          </select>
        </div>
        <div class="dash-form-group"><label class="dash-form-label">Phenotype / Resistance Notes</label><textarea class="dash-input dash-textarea" id="editNotes">${strain.Phenotype_Notes || ''}</textarea></div>
        <fieldset style="border: var(--border-light); padding: 16px; margin-bottom: 20px;">
          <legend style="font-size: 0.7rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--color-text-secondary); padding: 0 8px;">Freezer Location (-80°C)</legend>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="dash-form-group" style="margin-bottom: 0;">
              <label class="dash-form-label">Shelf</label>
              <select class="dash-input" id="editShelf">
                  <option value="">Select shelf...</option>
                  <option value="Top Shelf" ${editShelf === 'Top Shelf' ? 'selected' : ''}>Top Shelf</option>
                  <option value="Below Top Shelf" ${editShelf === 'Below Top Shelf' ? 'selected' : ''}>Below Top Shelf</option>
              </select>
            </div>
            <div class="dash-form-group" style="margin-bottom: 0;">
              <label class="dash-form-label">Box / Rack</label>
              <input class="dash-input" id="editBox" value="${editBox}">
            </div>
          </div>
          <div class="dash-form-group" style="margin-top: 12px; margin-bottom: 0;">
            <label class="dash-form-label">Grid Position</label>
            <input class="dash-input" id="editGrid" value="${editGrid}">
          </div>
        </fieldset>
      `, `<button class="dash-btn-outline" onclick="window.dashApp.closeModal()">Cancel</button>
         <button class="dash-btn" onclick="window.dashApp.editStrain('${strain.Vial_ID}')">Save Changes</button>`);
    },

    async editStrain(id) {
      const organism = document.getElementById('editOrganism').value.trim();
      if (!organism) return alert('Organism is required');
      const shelf = document.getElementById('editShelf').value;
      const box = document.getElementById('editBox').value.trim();
      const grid = document.getElementById('editGrid').value.trim();
      let location = '';
      if (shelf) {
        location = `-80°C / ${shelf}`;
        if (box) location += ` / ${box}`;
        if (grid) location += `, ${grid}`;
      }
      await api(`/strains/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          Organism: organism,
          Stock_Type: document.getElementById('editStockType').value,
          Freezer_Location: location,
          Phenotype_Notes: document.getElementById('editNotes').value
        })
      });
      closeModal();
      loadStock();
    },

    async checkoutStrain(id) {
      if (!confirm('Check out this strain?')) return;
      await api(`/strains/${id}/checkout`, { method: 'POST', body: JSON.stringify({}) });
      loadStock();
    },

    async checkinStrain(id) {
      const passage = prompt('Updated passage number (leave blank to skip):');
      await api(`/strains/${id}/checkin`, {
        method: 'POST',
        body: JSON.stringify({ passage_number: passage ? parseInt(passage) : null })
      });
      // Refresh current page
      const activePage = document.querySelector('.dash-nav-item.active')?.dataset.page;
      loadPage(activePage || 'overview');
    },

    async showQR(id) {
      const data = await api(`/strains/${id}/qrcode`);
      showModal('QR Code Label', `
        <div class="qr-container">
          <img src="${data.qr}" alt="QR Code">
          <div class="qr-label">${data.strain_id}</div>
          <div class="qr-sublabel">${data.organism}</div>
          <div style="margin-top: 16px;"><button class="dash-btn-outline" onclick="window.print()">Print Label</button></div>
        </div>
      `, `<button class="dash-btn-outline" onclick="window.dashApp.closeModal()">Close</button>`);
    },

    async showHistory(id) {
      const logs = await api(`/strains/${id}/history`);
      const strain = await api(`/strains/${id}`);
      showModal(`History — ${strain.strain_id}`, `
        <p style="margin-bottom: 16px; color: var(--color-text-secondary);"><em>${strain.organism}</em></p>
        ${logs.length ? logs.map(l => `
          <div class="activity-item">
            <div class="activity-dot"></div>
            <div><div class="activity-text"><span class="badge badge-${l.action === 'checkout' ? 'in-use' : l.action === 'checkin' ? 'available' : l.action === 'depleted' ? 'depleted' : 'active'}">${l.action}</span> by ${l.user_name}</div>
            <div class="activity-time">${new Date(l.timestamp).toLocaleString()}${l.notes ? ' — ' + l.notes : ''}</div></div>
          </div>
        `).join('') : '<p style="color: var(--color-text-secondary);">No history yet.</p>'}
      `, `<button class="dash-btn-outline" onclick="window.dashApp.closeModal()">Close</button>`);
    },

    async showAddProject() {
      const users = await api('/auth/users');
      const scholars = users.filter(u => u.role === 'scholar');
      showModal('Add New Project', `
        <div class="dash-form-group"><label class="dash-form-label">Project Title *</label><input class="dash-input" id="projTitle"></div>
        <div class="dash-form-group"><label class="dash-form-label">Funding Agency</label><input class="dash-input" id="projFunding" placeholder="e.g. DBT, DST-SERB, ICMR"></div>
        <div class="dash-form-group"><label class="dash-form-label">Description</label><textarea class="dash-input dash-textarea" id="projDesc"></textarea></div>
        <div class="dash-form-group"><label class="dash-form-label">Start Date</label><input class="dash-input" id="projStart" type="date"></div>
        <div class="dash-form-group"><label class="dash-form-label">End Date</label><input class="dash-input" id="projEnd" type="date"></div>
        <div class="dash-form-group"><label class="dash-form-label">Team Members</label>
          <div id="projMembers">${scholars.map(s => `<label style="display: block; padding: 6px 0; font-size: 0.9rem;"><input type="checkbox" value="${s.id}" style="margin-right: 8px;">${s.name}</label>`).join('')}</div>
        </div>
      `, `<button class="dash-btn-outline" onclick="window.dashApp.closeModal()">Cancel</button>
         <button class="dash-btn" onclick="window.dashApp.addProject()">Create Project</button>`);
    },

    async deleteStrain(id) {
      if (!confirm(`Are you sure you want to permanently delete strain "${id}"?\n\nThis action cannot be undone. Only the person who added this entry (or the PI) can delete it.`)) return;
      const result = await api(`/strains/${id}`, { method: 'DELETE' });
      if (result.error) return alert('Delete failed: ' + result.error);
      loadStock();
    },

    async deleteDoc(id) {
      if (!confirm('Are you sure you want to permanently delete this document?\n\nThis action cannot be undone.')) return;
      try {
        const result = await api(`/docs/${id}`, { method: 'DELETE' });
        if (result && result.error) {
          alert('Delete failed: ' + result.error);
          return;
        }
        loadDocs();
      } catch(e) {
        alert('Delete failed: ' + (e.message || 'Unknown error'));
      }
    },

    async addProject() {
      const title = document.getElementById('projTitle').value.trim();
      if (!title) return alert('Project title is required');
      const memberCheckboxes = document.querySelectorAll('#projMembers input:checked');
      const member_ids = Array.from(memberCheckboxes).map(cb => parseInt(cb.value));

      await api('/projects', {
        method: 'POST',
        body: JSON.stringify({
          title,
          funding_agency: document.getElementById('projFunding').value,
          description: document.getElementById('projDesc').value,
          start_date: document.getElementById('projStart').value,
          end_date: document.getElementById('projEnd').value,
          member_ids
        })
      });
      closeModal();
      loadProjects();
    },

    // ── Consumables Modal Actions ──
    showAddBoxModal() {
      showModal('Add New Consumable Box', `
        <div class="dash-form-group">
          <label class="dash-form-label">Item Type *</label>
          <select class="dash-input" id="newBoxType">
            ${CONSUMABLE_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
          </select>
        </div>
        <div class="dash-form-group">
          <label class="dash-form-label">Box Label *</label>
          <input class="dash-input" id="newBoxLabel" placeholder="e.g. Petri Box #3 (HiMedia, Mar 2026)">
        </div>
        <div class="dash-form-group">
          <label class="dash-form-label">Initial Quantity *</label>
          <input class="dash-input" id="newBoxQty" type="number" min="1" placeholder="e.g. 200">
        </div>
        <p style="font-size: 0.8rem; color: var(--color-text-secondary); margin-top: 8px;">
          If an active box of this type already exists, the new box will be <strong>locked</strong> until the current one is empty (FIFO).
        </p>
      `, `<button class="dash-btn-outline" onclick="window.dashApp.closeModal()">Cancel</button>
         <button class="dash-btn" onclick="window.dashApp.addBox()">Add Box</button>`);
    },

    async addBox() {
      const item_type = document.getElementById('newBoxType').value;
      const box_label = document.getElementById('newBoxLabel').value.trim();
      const initial_qty = document.getElementById('newBoxQty').value;
      if (!box_label) return alert('Box label is required.');
      if (!initial_qty || parseInt(initial_qty) <= 0) return alert('Enter a valid quantity.');
      const result = await api('/consumables/boxes', {
        method: 'POST',
        body: JSON.stringify({ item_type, box_label, initial_qty: parseInt(initial_qty) })
      });
      if (result.error) return alert(result.error);
      closeModal();
      refreshConsumables();
    },

    showWithdrawModal(boxId) {
      showModal('Withdraw from Box', `
        <div class="dash-form-group">
          <label class="dash-form-label">Quantity to withdraw *</label>
          <input class="dash-input" id="withdrawQty" type="number" min="1" placeholder="e.g. 5">
        </div>
        <div class="dash-form-group">
          <label class="dash-form-label">Purpose / Notes</label>
          <input class="dash-input" id="withdrawNotes" placeholder="e.g. Plating V. cholerae isolates">
        </div>
        <p style="font-size: 0.8rem; color: var(--color-text-secondary); margin-top: 8px;">
          Timestamp is set automatically by the server. You cannot backdate entries.
        </p>
      `, `<button class="dash-btn-outline" onclick="window.dashApp.closeModal()">Cancel</button>
         <button class="dash-btn" onclick="window.dashApp.withdraw(${boxId})">Confirm Withdrawal</button>`);
    },

    async withdraw(boxId) {
      const qty = document.getElementById('withdrawQty').value;
      const notes = document.getElementById('withdrawNotes').value;
      if (!qty || parseInt(qty) <= 0) return alert('Enter a valid quantity.');
      const result = await api(`/consumables/${boxId}/withdraw`, {
        method: 'POST',
        body: JSON.stringify({ qty: parseInt(qty), notes })
      });
      if (result.error) return alert(result.error);
      closeModal();
      refreshConsumables();
    },

    showCorrectionModal(boxId) {
      showModal('Submit Correction', `
        <p style="font-size: 0.85rem; color: var(--color-text-secondary); margin-bottom: 16px;">
          Use this to fix mistakes. <strong>Positive</strong> number = return items. <strong>Negative</strong> number = remove more (e.g. breakage).
          <br>Entries cannot be edited or deleted — corrections create a new audit trail entry.
        </p>
        <div class="dash-form-group">
          <label class="dash-form-label">Correction Quantity *</label>
          <input class="dash-input" id="corrQty" type="number" placeholder="e.g. -3 (broke 3) or +5 (return 5)">
        </div>
        <div class="dash-form-group">
          <label class="dash-form-label">Reason (required) *</label>
          <input class="dash-input" id="corrNotes" placeholder="e.g. Accidentally broke 3 plates during autoclaving">
        </div>
      `, `<button class="dash-btn-outline" onclick="window.dashApp.closeModal()">Cancel</button>
         <button class="dash-btn" onclick="window.dashApp.submitCorrection(${boxId})">Submit Correction</button>`);
    },

    async submitCorrection(boxId) {
      const qty = document.getElementById('corrQty').value;
      const notes = document.getElementById('corrNotes').value.trim();
      if (!qty || parseInt(qty) === 0) return alert('Correction quantity cannot be 0.');
      if (!notes) return alert('You must provide a reason for the correction.');
      const result = await api(`/consumables/${boxId}/correction`, {
        method: 'POST',
        body: JSON.stringify({ qty: parseInt(qty), notes })
      });
      if (result.error) return alert(result.error);
      closeModal();
      refreshConsumables();
    },

    async showBoxLedger(boxId, boxLabel) {
      const logs = await api(`/consumables/${boxId}/ledger`);
      const actionBadge = (a) => a === 'withdraw' ? 'badge-in-use' : a === 'return' ? 'badge-available' : a === 'correction' ? 'badge-depleted' : 'badge-active';
      showModal(`Ledger — ${boxLabel}`, `
        <div style="max-height: 400px; overflow-y: auto;">
        ${logs.length ? `<table class="dash-table" style="font-size: 0.85rem;">
          <thead><tr><th>Time</th><th>Action</th><th>Qty</th><th>After</th><th>By</th><th>Notes</th></tr></thead>
          <tbody>${logs.map(l => `<tr>
            <td style="font-size: 0.75rem; white-space: nowrap;">${new Date(l.timestamp).toLocaleString()}</td>
            <td><span class="badge ${actionBadge(l.action)}">${l.action}</span></td>
            <td>${l.action === 'withdraw' || l.action === 'correction' ? '-' : '+'}${l.qty}</td>
            <td><strong>${l.qty_after}</strong></td>
            <td style="font-size: 0.8rem;">${l.user_name}</td>
            <td style="font-size: 0.8rem;">${l.notes || '—'}</td>
          </tr>`).join('')}</tbody>
        </table>` : '<p style="color: var(--color-text-secondary);">No entries yet.</p>'}
        </div>
      `, `<button class="dash-btn-outline" onclick="window.dashApp.closeModal()">Close</button>`);
    },

    async showFullLedger() {
      const typeVal = document.getElementById('consTypeFilter')?.value || 'all';
      const logs = await api(`/consumables/ledger/all?item_type=${encodeURIComponent(typeVal)}`);
      const actionBadge = (a) => a === 'withdraw' ? 'badge-in-use' : a === 'return' ? 'badge-available' : a === 'correction' ? 'badge-depleted' : 'badge-active';
      showModal('Full Consumables Ledger', `
        <p style="font-size: 0.8rem; color: var(--color-text-secondary); margin-bottom: 12px;">Last 200 entries. All entries are permanent and cannot be edited or deleted.</p>
        <div style="max-height: 450px; overflow-y: auto;">
        ${logs.length ? `<table class="dash-table" style="font-size: 0.8rem;">
          <thead><tr><th>Time</th><th>Item</th><th>Box</th><th>Action</th><th>Qty</th><th>After</th><th>By</th><th>Notes</th></tr></thead>
          <tbody>${logs.map(l => `<tr>
            <td style="font-size: 0.7rem; white-space: nowrap;">${new Date(l.timestamp).toLocaleString()}</td>
            <td style="font-size: 0.75rem;">${l.item_type || ''}</td>
            <td style="font-size: 0.75rem;">${l.box_label || ''}</td>
            <td><span class="badge ${actionBadge(l.action)}">${l.action}</span></td>
            <td>${l.action === 'withdraw' || l.action === 'correction' ? '-' : '+'}${l.qty}</td>
            <td><strong>${l.qty_after}</strong></td>
            <td style="font-size: 0.75rem;">${l.user_name}</td>
            <td style="font-size: 0.75rem;">${l.notes || '—'}</td>
          </tr>`).join('')}</tbody>
        </table>` : '<p style="color: var(--color-text-secondary);">No entries yet.</p>'}
        </div>
      `, `<button class="dash-btn-outline" onclick="window.dashApp.closeModal()">Close</button>`);
    },

    async markBoxEmpty(boxId) {
      if (!confirm('Mark this box as empty? The next queued box will become active (FIFO).')) return;
      const result = await api(`/consumables/${boxId}/mark-empty`, { method: 'POST', body: JSON.stringify({}) });
      if (result.error) return alert(result.error);
      refreshConsumables();
    },

    async deleteBox(boxId, boxLabel) {
      if (!confirm(`Permanently delete box "${boxLabel}" and ALL its ledger entries?\n\nThis action cannot be undone.`)) return;
      const result = await api(`/consumables/${boxId}`, { method: 'DELETE' });
      if (result.error) return alert('Delete failed: ' + result.error);
      refreshConsumables();
    }
  };

  // ── Initial Load ──
  handleHash();
  if (!window.location.hash) loadOverview();
})();
