const API_BASE = window.__API_BASE__ || 'http://localhost:4000';

async function fetchShipments() {
  const res = await fetch(`${API_BASE}/shipments`);
  const shipments = await res.json();
  renderShipments(shipments);
}

function renderShipments(shipments) {
  const tbody = document.getElementById('shipment-rows');
  tbody.innerHTML = '';

  for (const s of shipments) {
    const row = document.createElement('tr');
    row.dataset.testid = 'shipment-row';
    row.dataset.reference = s.reference;

    row.innerHTML = `
      <td data-testid="reference">${s.reference}</td>
      <td data-testid="carrier">${s.carrier}</td>
      <td data-testid="quoted-cost">${s.quotedCost.toFixed(2)}</td>
      <td data-testid="invoiced-cost">${s.invoicedCost.toFixed(2)}</td>
      <td data-testid="status" class="status-${s.status}">${s.status}</td>
      <td data-testid="discrepancy-flag" class="${s.discrepancy ? 'flagged' : 'ok'}">
        ${s.discrepancy ? `⚠ +${s.discrepancyAmount.toFixed(2)}` : '—'}
      </td>
      <td>
        <button data-testid="approve-btn" data-id="${s.id}" ${s.status !== 'pending' ? 'disabled' : ''}>Approve</button>
        <button data-testid="reject-btn" data-id="${s.id}" ${s.status !== 'pending' ? 'disabled' : ''}>Reject</button>
      </td>
    `;
    tbody.appendChild(row);
  }

  tbody.querySelectorAll('[data-testid="approve-btn"]').forEach((btn) =>
    btn.addEventListener('click', () => updateStatus(btn.dataset.id, 'approve'))
  );
  tbody.querySelectorAll('[data-testid="reject-btn"]').forEach((btn) =>
    btn.addEventListener('click', () => updateStatus(btn.dataset.id, 'reject'))
  );
}

function currentRole() {
  const select = document.getElementById('role-select');
  return select ? select.value : 'agent';
}

async function updateStatus(id, action) {
  const res = await fetch(`${API_BASE}/shipments/${id}/${action}`, {
    method: 'PATCH',
    headers: { 'x-user-role': currentRole() },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // Surface auth/conflict errors in a data-testid'd element so tests can assert on them.
    showActionError(body.error || `Request failed (${res.status})`);
    return;
  }

  clearActionError();
  await fetchShipments();
}

function showActionError(message) {
  let el = document.getElementById('action-error');
  if (!el) {
    el = document.createElement('p');
    el.id = 'action-error';
    el.dataset.testid = 'action-error';
    document.querySelector('.shipment-list').prepend(el);
  }
  el.textContent = message;
}

function clearActionError() {
  const el = document.getElementById('action-error');
  if (el) el.remove();
}

document.getElementById('shipment-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const payload = {
    reference: form.reference.value,
    carrier: form.carrier.value,
    quotedCost: Number(form.quotedCost.value),
    invoicedCost: Number(form.invoicedCost.value),
  };

  await fetch(`${API_BASE}/shipments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  form.reset();
  await fetchShipments();
});

fetchShipments();
