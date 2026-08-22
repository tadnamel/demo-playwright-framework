// scripts/qase-setup.mjs
//
// One-time setup script: creates a fresh Qase project for CargoAudit Lite,
// builds a suite tree mirroring test-suites/, and creates manual test cases
// with steps/expected results matching each Playwright spec — so manual
// testers can follow the same coverage without reading TypeScript.
//
// Each case is created with automation: 2 ("Automated") since every one of
// these already has a corresponding Playwright test. Run once; re-running
// will create duplicate cases (it does not check for existing ones).
//
// Usage:
//   1. cp .env.example .env, then paste YOUR OWN Qase token into
//      QASE_TESTOPS_API_TOKEN in .env (gitignored — never committed).
//   2. npm run qase:setup
//   (Or skip .env entirely and pass the token as an inline env var — see README.)
//
// This creates a brand-new project under YOUR token/account — it is not
// tied to the repo owner's Qase project in any way.
//
// Output: qase-case-map.json — maps each spec test title to its new Qase
// case ID, used later to annotate specs with qase.id(N) for result reporting.

import 'dotenv/config';

const TOKEN = process.env.QASE_TESTOPS_API_TOKEN;
const PROJECT_CODE = process.env.QASE_TESTOPS_PROJECT_CODE || 'CARGO';
const BASE_URL = 'https://api.qase.io/v1';

if (!TOKEN) {
  console.error('Missing QASE_TESTOPS_API_TOKEN env var. Aborting.');
  process.exit(1);
}

async function qase(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Token: TOKEN,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.status === false) {
    throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(json)}`);
  }
  return json.result;
}

async function createProject() {
  console.log(`Creating project ${PROJECT_CODE}...`);
  try {
    return await qase('POST', '/project', {
      title: 'CargoAudit Lite',
      code: PROJECT_CODE,
      description:
        'Freight cost audit demo app — QA automation portfolio project. ' +
        'Manual test cases mirror the Playwright suite in demo-playwright-framework ' +
        '(github.com/tadnamel/demo-playwright-framework).',
    });
  } catch (e) {
    if (String(e).includes('409') || String(e).toLowerCase().includes('already')) {
      console.log(`Project ${PROJECT_CODE} already exists, continuing.`);
      return { code: PROJECT_CODE };
    }
    throw e;
  }
}

async function createSuite(title, parentId) {
  const body = parentId ? { title, parent_id: parentId } : { title };
  const result = await qase('POST', `/suite/${PROJECT_CODE}`, body);
  console.log(`  suite "${title}" -> id ${result.id}`);
  return result.id;
}

async function createCase({ title, suiteId, preconditions, steps }) {
  const result = await qase('POST', `/case/${PROJECT_CODE}`, {
    title,
    suite_id: suiteId,
    preconditions,
    automation: 2, // Automated
    steps_type: 'classic',
    steps: steps.map((s, i) => ({
      position: i + 1,
      action: s.action,
      expected_result: s.expected,
    })),
  });
  console.log(`    case "${title}" -> ${PROJECT_CODE}-${result.id}`);
  return { title, id: result.id };
}

// --- Case definitions, grouped by suite, mirroring test-suites/ 1:1 --------

const RESET_PRECONDITION = 'Backend reset to seeded state (POST /__reset). Seeded shipments: SHP-1001 (950/950, clean), SHP-1002 (950/1100, flagged), SHP-1003 (3000/3050, clean).';

const apiCrud = [
  {
    title: 'GET /shipments returns seeded shipments with discrepancy flags computed',
    steps: [
      { action: 'Send GET /shipments', expected: '200 response with 3 shipments' },
      { action: 'Inspect SHP-1002 in the response', expected: 'discrepancy=true, discrepancyAmount≈150' },
      { action: 'Inspect SHP-1001 in the response', expected: 'discrepancy=false' },
    ],
  },
  {
    title: 'GET /shipments/:id returns 404 for a non-existent shipment',
    steps: [{ action: 'Send GET /shipments/9999', expected: '404 Not Found' }],
  },
  {
    title: 'POST /shipments creates a shipment and evaluates discrepancy',
    steps: [
      { action: 'POST /shipments with reference SHP-3001, quotedCost 1000, invoicedCost 1300', expected: '201 Created; response has discrepancy=true, discrepancyAmount=300' },
    ],
  },
  {
    title: 'POST /shipments rejects a payload missing required fields',
    steps: [
      { action: 'POST /shipments with only { reference: "SHP-3002" }', expected: '400 Bad Request' },
    ],
  },
  {
    title: 'PATCH /shipments/:id/approve sets status to approved (non-flagged, any role)',
    steps: [
      { action: 'PATCH /shipments/1/approve (SHP-1001, not flagged, no role header)', expected: '200 OK; response status = "approved"' },
    ],
  },
  {
    title: 'PATCH /shipments/:id/reject sets status to rejected (flagged, requires manager)',
    steps: [
      { action: 'PATCH /shipments/2/reject with header x-user-role: manager (SHP-1002, flagged)', expected: '200 OK; response status = "rejected"' },
    ],
  },
  {
    title: 'DELETE /shipments/:id removes a shipment',
    steps: [
      { action: 'DELETE /shipments/3', expected: '204 No Content' },
      { action: 'GET /shipments/3', expected: '404 Not Found' },
    ],
  },
];

const apiEdgeCases = [
  {
    title: 'Zero-cost shipment is not flagged and does not error',
    steps: [
      { action: 'POST /shipments with quotedCost 0, invoicedCost 0', expected: '201 Created; discrepancy=false, discrepancyAmount=0' },
    ],
  },
  {
    title: 'Zero quoted cost with a positive invoiced cost is flagged',
    steps: [
      { action: 'POST /shipments with quotedCost 0, invoicedCost 50', expected: '201 Created; discrepancy=true, discrepancyAmount=50' },
    ],
  },
  {
    title: 'Negative cost values are rejected on creation',
    steps: [
      { action: 'POST /shipments with quotedCost -100, invoicedCost 50', expected: '400 Bad Request' },
    ],
  },
  {
    title: 'A credit (invoiced below quote) is never flagged as a discrepancy',
    steps: [
      { action: 'POST /shipments with quotedCost 1000, invoicedCost 800', expected: '201 Created; discrepancy=false, discrepancyAmount=0' },
    ],
  },
  {
    title: 'An extremely large discrepancy is flagged with the correct amount',
    steps: [
      { action: 'POST /shipments with quotedCost 500, invoicedCost 5000', expected: '201 Created; discrepancy=true, discrepancyAmount=4500' },
    ],
  },
  {
    title: 'A carrier with a wider tolerance override is not flagged within that band',
    steps: [
      { action: 'POST /shipments with carrier "Pacific Rim Shipping", quotedCost 1000, invoicedCost 1080 (8% over, within their 10% override but above the 5% default)', expected: '201 Created; discrepancy=false' },
    ],
  },
  {
    title: 'Concurrent status-change attempts: second action on an already-actioned shipment returns 409',
    steps: [
      { action: 'PATCH /shipments/1/approve', expected: '200 OK' },
      { action: 'PATCH /shipments/1/reject (same shipment, already actioned)', expected: '409 Conflict' },
    ],
  },
];

const apiRbac = [
  {
    title: 'Agent role cannot approve a flagged shipment',
    steps: [
      { action: 'PATCH /shipments/2/approve with header x-user-role: agent (SHP-1002, flagged)', expected: '403 Forbidden' },
    ],
  },
  {
    title: 'Manager role can approve a flagged shipment',
    steps: [
      { action: 'PATCH /shipments/2/approve with header x-user-role: manager', expected: '200 OK; response status = "approved"' },
    ],
  },
  {
    title: 'Missing role header defaults to agent behavior',
    steps: [
      { action: 'PATCH /shipments/2/approve with no x-user-role header', expected: '403 Forbidden (treated as agent)' },
    ],
  },
];

const apiAuditLog = [
  {
    title: 'Approving a shipment creates an audit log entry',
    steps: [
      { action: 'PATCH /shipments/1/approve with header x-user-role: agent', expected: '200 OK' },
      { action: 'GET /audit-log', expected: '200 OK; 1 entry with shipmentId=1, action="approve", role="agent", and a timestamp' },
    ],
  },
  {
    title: 'Rejecting a flagged shipment as manager logs the correct role',
    steps: [
      { action: 'PATCH /shipments/2/reject with header x-user-role: manager', expected: '200 OK' },
      { action: 'GET /audit-log', expected: '1 entry with shipmentId=2, action="reject", role="manager"' },
    ],
  },
  {
    title: 'A rejected authorization attempt is not logged',
    steps: [
      { action: 'PATCH /shipments/2/approve with header x-user-role: agent (expect 403)', expected: '403 Forbidden' },
      { action: 'GET /audit-log', expected: '0 entries — blocked attempts are not logged' },
    ],
  },
];

const e2eWorkflow = [
  {
    title: 'Displays seeded shipments on load [@smoke]',
    steps: [{ action: 'Load the app', expected: '3 shipment rows are displayed' }],
  },
  {
    title: 'Flags a shipment when invoiced cost exceeds quoted cost beyond tolerance [@smoke]',
    steps: [{ action: 'Locate SHP-1002 (quoted 950 / invoiced 1100, ~15.8% over) in the list', expected: 'Row is visually flagged as a discrepancy' }],
  },
  {
    title: 'Does not flag a shipment within tolerance',
    steps: [{ action: 'Locate SHP-1001 (quoted == invoiced) in the list', expected: 'Row shows no discrepancy flag' }],
  },
  {
    title: 'Adds a new shipment and evaluates discrepancy correctly',
    steps: [
      { action: 'Add shipment SHP-2001, carrier "Northline Freight", quoted 500, invoiced 640 (28% over)', expected: 'Row count increases to 4; new row is flagged' },
    ],
  },
  {
    title: 'Adds a new shipment within tolerance and does not flag it',
    steps: [
      { action: 'Add shipment SHP-2002, carrier "Northline Freight", quoted 500, invoiced 510 (2% over)', expected: 'New row shows no discrepancy flag' },
    ],
  },
  {
    title: 'Approves a non-flagged pending shipment as agent [@smoke]',
    steps: [
      { action: 'With default agent role, approve SHP-1001 (not flagged)', expected: 'SHP-1001 status changes to "approved"' },
    ],
  },
  {
    title: 'Rejects a flagged shipment as manager',
    steps: [
      { action: 'Switch role to manager, reject SHP-1002 (flagged)', expected: 'SHP-1002 status changes to "rejected"' },
    ],
  },
  {
    title: 'Disables approve/reject actions once a shipment is actioned',
    steps: [
      { action: 'Approve SHP-1003', expected: 'Approve and Reject buttons on that row become disabled' },
    ],
  },
];

const e2eRbac = [
  {
    title: 'Agent role sees an error when trying to approve a flagged shipment',
    steps: [
      { action: 'With role = agent, attempt to approve SHP-1002 (flagged)', expected: 'Inline error containing "Only a manager" is shown; SHP-1002 status remains "pending"' },
    ],
  },
  {
    title: 'Switching to manager role allows approving a flagged shipment',
    steps: [
      { action: 'Switch role to manager, approve SHP-1002', expected: 'SHP-1002 status changes to "approved"' },
    ],
  },
];

const a11y = [
  {
    title: 'Shipment list passes accessibility scan — default loaded state',
    steps: [{ action: 'Load the app, run axe-core scan', expected: 'No violations' }],
  },
  {
    title: 'Shipment list passes accessibility scan — manager role active',
    steps: [{ action: 'Switch role to manager, run axe-core scan', expected: 'No violations' }],
  },
  {
    title: 'Shipment list passes accessibility scan — after adding a shipment',
    steps: [
      { action: 'Add shipment SHP-3001 (flagged), run axe-core scan', expected: 'No violations, including on the newly rendered flagged row' },
    ],
  },
  {
    title: 'Shipment list passes accessibility scan — action error visible',
    steps: [
      { action: 'As agent, attempt to approve flagged SHP-1002 (triggers inline error), run axe-core scan', expected: 'No violations, including on the dynamically injected error state' },
    ],
  },
];

async function main() {
  await createProject();

  const apiRootId = await createSuite('API');
  const e2eRootId = await createSuite('E2E');
  const a11yRootId = await createSuite('Accessibility');

  const suiteMap = {
    'API / Shipments CRUD': await createSuite('Shipments CRUD', apiRootId),
    'API / Edge cases': await createSuite('Edge cases', apiRootId),
    'API / Role-based authorization': await createSuite('Role-based authorization', apiRootId),
    'API / Audit log': await createSuite('Audit log', apiRootId),
    'E2E / Freight audit workflow': await createSuite('Freight audit workflow', e2eRootId),
    'E2E / Role-based authorization (UI)': await createSuite('Role-based authorization (UI)', e2eRootId),
    Accessibility: a11yRootId,
  };

  const caseMap = {};
  for (const [suiteKey, cases] of [
    ['API / Shipments CRUD', apiCrud],
    ['API / Edge cases', apiEdgeCases],
    ['API / Role-based authorization', apiRbac],
    ['API / Audit log', apiAuditLog],
    ['E2E / Freight audit workflow', e2eWorkflow],
    ['E2E / Role-based authorization (UI)', e2eRbac],
    ['Accessibility', a11y],
  ]) {
    const suiteId = suiteMap[suiteKey];
    for (const c of cases) {
      const { title, id } = await createCase({
        title: c.title,
        suiteId,
        preconditions: RESET_PRECONDITION,
        steps: c.steps,
      });
      caseMap[title] = id;
    }
  }

  const fs = await import('node:fs');
  fs.writeFileSync('qase-case-map.json', JSON.stringify(caseMap, null, 2));
  console.log(`\nDone. ${Object.keys(caseMap).length} cases created. Mapping written to qase-case-map.json`);
  console.log('Next: annotate test-suites specs with qase.id(N) using this mapping, then run `npm run test:qase`.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
