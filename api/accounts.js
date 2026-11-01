'use strict';

/**
 * api/accounts.js
 *
 * Accounts Module Slice 2 Server Endpoint:
 * - Action 'sync': Derives the general ledger (accounts_journal) from source records
 *   (fees_years, accounts_expenses, accounts_receipts, accounts_transfers, accounts_settings/opening)
 *   and maintains accounts_summary and accounts_sync_state atomically using high-performance batching.
 * - Action 'status': Returns last sync time, voucher counts, skipped list, and warnings.
 *
 * Security:
 * - Requires valid Firebase Auth ID Token.
 * - Caller must be school admin in school_access/{uid} matching the target schoolId.
 * - Super Admin UID is strictly REJECTED (Super Admin has zero access to accounts).
 * - Teachers are strictly REJECTED.
 * - Concurrency lease (~20s) prevents multiple tabs/runs from corrupting accounts_sync_state.
 * - Rate-limited and execution-bounded to avoid Vercel Hobby function timeouts.
 */

const admin = require('firebase-admin');

const SUPER_ADMIN_UID = 'cq647u1GfCXISzf7XMw8pxH76I72';

function getAdmin() {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (raw) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(raw))
      });
    } else {
      const fs = require('fs');
      if (fs.existsSync('service-account-key.json')) {
        const sa = JSON.parse(fs.readFileSync('service-account-key.json', 'utf8'));
        admin.initializeApp({
          credential: admin.credential.cert(sa)
        });
      } else {
        throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is not configured.');
      }
    }
  }
  return admin;
}

function applyCors(req, res) {
  const ALLOWED = [
    process.env.ALLOWED_ORIGIN || 'https://www.ctrlshifts.in',
    'https://ctrlshifts.in'
  ];
  const origin = req.headers.origin;
  if (origin && (ALLOWED.includes(origin) || origin.endsWith('.ctrlshifts.in') || origin.includes('localhost'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

function ensureResponseHelpers(res) {
  if (typeof res.status !== 'function') {
    res.status = function(code) {
      this.statusCode = code;
      return this;
    };
  }
  if (typeof res.json !== 'function') {
    res.json = function(data) {
      this.setHeader('Content-Type', 'application/json');
      this.end(JSON.stringify(data));
      return this;
    };
  }
}

// ── Default Chart of Accounts Definition ─────────────────────────────────────
const DEFAULT_CHART_OF_ACCOUNTS = [
  { code: '11100', name: 'Cash in Hand (Main School Cash)', type: 'asset', isActive: true },
  { code: '11110', name: 'Petty Cash', type: 'asset', isActive: true },
  { code: '11200', name: 'Primary Bank Account', type: 'asset', isActive: true },
  { code: '11210', name: 'Secondary Bank Account', type: 'asset', isActive: true },
  { code: '12100', name: 'Student Fee Receivables', type: 'asset', isActive: true },
  { code: '31100', name: 'General / Corpus Reserve', type: 'equity', isActive: true },
  { code: '41100', name: 'Tuition Fees', type: 'income', isActive: true },
  { code: '41200', name: 'Admission & Registration Fees', type: 'income', isActive: true },
  { code: '41300', name: 'Examination Fees', type: 'income', isActive: true },
  { code: '41400', name: 'Annual / Development Charges', type: 'income', isActive: true },
  { code: '42100', name: 'Transport / Bus Charges', type: 'income', isActive: true },
  { code: '43100', name: 'Bank Interest Received', type: 'income', isActive: true },
  { code: '43200', name: 'Miscellaneous Receipts', type: 'income', isActive: true },
  { code: '51100', name: 'Teaching Staff Salaries', type: 'expense', isActive: true },
  { code: '52100', name: 'Printing, Stationery & Report Cards', type: 'expense', isActive: true },
  { code: '53100', name: 'Electricity & Water Utility', type: 'expense', isActive: true },
  { code: '55100', name: 'Student Fee Concessions & Discounts', type: 'expense', isActive: true }
];

// ── Pure Posting Engine Helpers (Exported for Unit Tests) ─────────────────────

function getFinancialYear(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1-12
  if (month >= 4) {
    const nextYY = String(year + 1).slice(-2);
    return `${year}-${nextYY}`;
  } else {
    const prevYY = String(year).slice(-2);
    return `${year - 1}-${prevYY}`;
  }
}

function computeFeeJournalLines(txn, settings, chartMap) {
  if (!txn || !txn.id) return null;

  // Build chart map if not provided
  if (!chartMap) {
    chartMap = {};
    DEFAULT_CHART_OF_ACCOUNTS.forEach(a => { chartMap[a.code] = a; });
  }

  const goLiveDate = settings && settings.goLiveDate;
  if (goLiveDate && txn.date && txn.date < goLiveDate) {
    // F5: Intentionally ignored record before goLiveDate (do not push to skipped list)
    return { ignored: true, ignoreType: 'beforeGoLive' };
  }

  // Cash basis: only payments are posted; 'due' transactions are not posted
  if (txn.type !== 'payment') {
    // F5: Intentionally ignored non-payment transaction (do not push to skipped list)
    return { ignored: true, ignoreType: 'ignoredDue' };
  }

  const mode = (txn.mode || 'Cash').trim();
  const isCash = (mode.toLowerCase() === 'cash');

  let assetAccount = null;

  if (isCash) {
    const feeCashAccount = (settings && settings.feeCashAccount) || '11100';
    const cashAcc = chartMap[feeCashAccount];
    if (!cashAcc || cashAcc.type !== 'asset' || cashAcc.isActive === false) {
      return {
        skip: true,
        error: true,
        configError: true,
        warningKey: 'INVALID_CASH_ACCOUNT',
        warning: `Cash fee account '${feeCashAccount}' is not an active asset ledger in Chart of Accounts.`
      };
    }
    assetAccount = feeCashAccount;
  } else {
    // F4: feeDigitalAccount MUST be configured and exist in accounts_chart as active asset. NO DEFAULT!
    const feeDigitalAccount = settings && settings.feeDigitalAccount;
    if (!feeDigitalAccount) {
      return {
        skip: true,
        error: true,
        configError: true,
        warningKey: 'MISSING_DIGITAL_ACCOUNT',
        warning: 'Set the bank account for UPI/Bank fee receipts in Accounts → Settings'
      };
    }
    const digAcc = chartMap[feeDigitalAccount];
    if (!digAcc || digAcc.type !== 'asset' || digAcc.isActive === false) {
      return {
        skip: true,
        error: true,
        configError: true,
        warningKey: 'INVALID_DIGITAL_ACCOUNT',
        warning: 'Set the bank account for UPI/Bank fee receipts in Accounts → Settings'
      };
    }
    assetAccount = feeDigitalAccount;
  }

  const feeHeadMapping = (settings && settings.feeHeadMapping) || {};
  const defaultIncomeAccount = '41100';

  const rawAmt = Number(txn.amount || 0);
  const rawDisc = Number(txn.discount || 0);
  const rawGross = Number(txn.grossAmount || (rawAmt + rawDisc));

  const amountPaise = Math.round(rawAmt * 100);
  const discountPaise = Math.round(rawDisc * 100);
  const grossPaise = Math.round(rawGross * 100);

  const isReversal = !!txn.isReversal || (amountPaise < 0);
  const lines = [];
  const warnings = [];

  const fy = getFinancialYear(txn.date);

  if (!isReversal) {
    // Normal Payment:
    // Debit Asset (Cash/Bank) = amountPaise
    if (amountPaise > 0) {
      lines.push({ accountCode: assetAccount, drPaise: amountPaise, crPaise: 0 });
    }
    // Debit 55100 (Fee Concession/Discount) = discountPaise
    if (discountPaise > 0) {
      lines.push({ accountCode: '55100', drPaise: discountPaise, crPaise: 0 });
    }

    // Credit Income accounts per allocation
    if (Array.isArray(txn.allocations) && txn.allocations.length > 0) {
      let allocPaiseSum = 0;
      for (const alloc of txn.allocations) {
        const hAmt = Math.round(Number(alloc.amount || 0) * 100);
        if (hAmt > 0) {
          allocPaiseSum += hAmt;
          const headId = alloc.feeHeadId || '';
          let incomeAcc = feeHeadMapping[headId] || defaultIncomeAccount;

          // Validate income account exists in chart
          const incObj = chartMap[incomeAcc];
          if (!incObj || incObj.type !== 'income' || incObj.isActive === false) {
            warnings.push(`Mapped income account '${incomeAcc}' for head '${alloc.feeHeadName || headId}' is invalid; defaulted to ${defaultIncomeAccount}`);
            incomeAcc = defaultIncomeAccount;
          } else if (!feeHeadMapping[headId]) {
            warnings.push(`Fee head '${alloc.feeHeadName || headId}' not mapped; defaulted to ${defaultIncomeAccount}`);
          }
          lines.push({ accountCode: incomeAcc, drPaise: 0, crPaise: hAmt });
        }
      }

      // F8: If allocations exceed grossAmount (diff < 0), data problem!
      if (allocPaiseSum !== grossPaise) {
        const diff = grossPaise - allocPaiseSum;
        if (diff < 0) {
          return {
            skip: true,
            error: true,
            isDataProblem: true,
            reason: `Allocations sum (${(allocPaiseSum / 100).toFixed(2)}) exceeds gross amount (${(grossPaise / 100).toFixed(2)}) for txn ${txn.id}`
          };
        } else if (diff > 0) {
          lines.push({ accountCode: defaultIncomeAccount, drPaise: 0, crPaise: diff });
          warnings.push(`Allocations sum (${allocPaiseSum}p) differs from gross (${grossPaise}p); difference ${diff}p credited to ${defaultIncomeAccount}`);
        }
      }
    } else {
      // Unallocated payment: entire gross credited to head or default
      const headId = txn.feeHeadId || '';
      let incomeAcc = feeHeadMapping[headId] || defaultIncomeAccount;
      const incObj = chartMap[incomeAcc];
      if (!incObj || incObj.type !== 'income' || incObj.isActive === false) {
        incomeAcc = defaultIncomeAccount;
      }
      lines.push({ accountCode: incomeAcc, drPaise: 0, crPaise: grossPaise });
    }
  } else {
    // Reversal: mirror image with positive magnitude
    const absAmt = Math.abs(amountPaise);
    const absDisc = Math.abs(discountPaise);
    const absGross = Math.abs(grossPaise);

    // Credit Asset = absAmt
    if (absAmt > 0) {
      lines.push({ accountCode: assetAccount, drPaise: 0, crPaise: absAmt });
    }
    // Credit 55100 = absDisc
    if (absDisc > 0) {
      lines.push({ accountCode: '55100', drPaise: 0, crPaise: absDisc });
    }

    // Debit Income accounts
    if (Array.isArray(txn.allocations) && txn.allocations.length > 0) {
      let allocPaiseSum = 0;
      for (const alloc of txn.allocations) {
        const hAmt = Math.abs(Math.round(Number(alloc.amount || 0) * 100));
        if (hAmt > 0) {
          allocPaiseSum += hAmt;
          const headId = alloc.feeHeadId || '';
          let incomeAcc = feeHeadMapping[headId] || defaultIncomeAccount;
          const incObj = chartMap[incomeAcc];
          if (!incObj || incObj.type !== 'income' || incObj.isActive === false) {
            incomeAcc = defaultIncomeAccount;
          }
          lines.push({ accountCode: incomeAcc, drPaise: hAmt, crPaise: 0 });
        }
      }

      // F8: Check negative difference on reversal as well
      if (allocPaiseSum !== absGross) {
        const diff = absGross - allocPaiseSum;
        if (diff < 0) {
          return {
            skip: true,
            error: true,
            isDataProblem: true,
            reason: `Reversal allocations sum (${(allocPaiseSum / 100).toFixed(2)}) exceeds gross amount (${(absGross / 100).toFixed(2)}) for txn ${txn.id}`
          };
        } else if (diff > 0) {
          lines.push({ accountCode: defaultIncomeAccount, drPaise: diff, crPaise: 0 });
        }
      }
    } else {
      const headId = txn.feeHeadId || '';
      let incomeAcc = feeHeadMapping[headId] || defaultIncomeAccount;
      lines.push({ accountCode: incomeAcc, drPaise: absGross, crPaise: 0 });
    }
  }

  // Verify balanced: sum Dr == sum Cr
  const totalDr = lines.reduce((acc, l) => acc + (l.drPaise || 0), 0);
  const totalCr = lines.reduce((acc, l) => acc + (l.crPaise || 0), 0);
  if (totalDr !== totalCr) {
    throw new Error(`Unbalanced fee voucher for txn ${txn.id}: Dr ${totalDr} != Cr ${totalCr}`);
  }

  return {
    voucherId: `vch_fee_${txn.id}`,
    voucherNo: `VCH-FEE-${txn.id}`,
    type: isReversal ? 'journal' : 'receipt',
    date: txn.date,
    fy,
    source: 'fee',
    sourceId: txn.id,
    narration: isReversal
      ? `Reversal: Fee Payment for Student ${txn.studentId || ''}`
      : `Fee Payment: Student ${txn.studentId || ''} (${txn.mode || 'Cash'})`,
    lines,
    warnings
  };
}

function computeExpenseJournalLines(expense, settings) {
  if (!expense || !expense.id) return null;
  const goLiveDate = settings && settings.goLiveDate;
  if (goLiveDate && expense.date && expense.date < goLiveDate) {
    return { ignored: true, ignoreType: 'beforeGoLive' };
  }

  const amt = Number(expense.amountPaise || 0);
  if (amt <= 0) {
    return { skip: true, error: true, reason: `Invalid expense amountPaise: ${expense.amountPaise}` };
  }

  const paidFrom = expense.paidFromAccountId;
  const category = expense.categoryAccountId;

  const isPaidFromValid = (paidFrom === '11100' || paidFrom === '11110' || (paidFrom && paidFrom.startsWith('111')) || (paidFrom && paidFrom.startsWith('112')));
  if (!isPaidFromValid) {
    return { skip: true, error: true, reason: `Expense paidFromAccountId '${paidFrom}' is not recognized as a cash/bank ledger.` };
  }

  const fy = expense.financialYear || getFinancialYear(expense.date);

  const normalVoucher = {
    voucherId: `vch_exp_${expense.id}`,
    voucherNo: `VCH-${expense.expenseNo || expense.id}`,
    type: 'payment',
    date: expense.date,
    fy,
    source: 'expense',
    sourceId: expense.id,
    narration: `Expense: ${expense.vendorName || ''} - ${expense.description || ''}`,
    lines: [
      { accountCode: category, drPaise: amt, crPaise: 0 },
      { accountCode: paidFrom, drPaise: 0, crPaise: amt }
    ]
  };

  let cancelVoucher = null;
  if (expense.status === 'cancelled') {
    const cancelDate = (expense.cancelledAt ? expense.cancelledAt.split('T')[0] : expense.date);
    cancelVoucher = {
      voucherId: `vch_expcx_${expense.id}`,
      voucherNo: `VCH-CX-${expense.expenseNo || expense.id}`,
      type: 'journal',
      date: cancelDate,
      fy: getFinancialYear(cancelDate), // F3: Follow voucher date's own FY
      source: 'expense',
      sourceId: expense.id,
      narration: `Reversal of ${expense.expenseNo || expense.id}: ${expense.cancelReason || 'Cancelled'}`,
      lines: [
        { accountCode: paidFrom, drPaise: amt, crPaise: 0 },
        { accountCode: category, drPaise: 0, crPaise: amt }
      ]
    };
  }

  return { normalVoucher, cancelVoucher };
}

function computeReceiptJournalLines(receipt, settings) {
  if (!receipt || !receipt.id) return null;
  const goLiveDate = settings && settings.goLiveDate;
  if (goLiveDate && receipt.date && receipt.date < goLiveDate) {
    return { ignored: true, ignoreType: 'beforeGoLive' };
  }

  const amt = Number(receipt.amountPaise || 0);
  if (amt <= 0) {
    return { skip: true, error: true, reason: `Invalid receipt amountPaise: ${receipt.amountPaise}` };
  }

  const receivedIn = receipt.receivedInAccountId;
  const category = receipt.categoryAccountId;

  const fy = receipt.financialYear || getFinancialYear(receipt.date);

  const normalVoucher = {
    voucherId: `vch_rcp_${receipt.id}`,
    voucherNo: `VCH-${receipt.receiptNo || receipt.id}`,
    type: 'receipt',
    date: receipt.date,
    fy,
    source: 'receipt',
    sourceId: receipt.id,
    narration: `Other Income: ${receipt.payerName || ''} - ${receipt.description || ''}`,
    lines: [
      { accountCode: receivedIn, drPaise: amt, crPaise: 0 },
      { accountCode: category, drPaise: 0, crPaise: amt }
    ]
  };

  let cancelVoucher = null;
  if (receipt.status === 'cancelled') {
    const cancelDate = (receipt.cancelledAt ? receipt.cancelledAt.split('T')[0] : receipt.date);
    cancelVoucher = {
      voucherId: `vch_rcpcx_${receipt.id}`,
      voucherNo: `VCH-CX-${receipt.receiptNo || receipt.id}`,
      type: 'journal',
      date: cancelDate,
      fy: getFinancialYear(cancelDate), // F3: Follow cancel date's FY
      source: 'receipt',
      sourceId: receipt.id,
      narration: `Reversal of ${receipt.receiptNo || receipt.id}: ${receipt.cancelReason || 'Cancelled'}`,
      lines: [
        { accountCode: category, drPaise: amt, crPaise: 0 },
        { accountCode: receivedIn, drPaise: 0, crPaise: amt }
      ]
    };
  }

  return { normalVoucher, cancelVoucher };
}

function computeTransferJournalLines(transfer, settings) {
  if (!transfer || !transfer.id) return null;
  const goLiveDate = settings && settings.goLiveDate;
  if (goLiveDate && transfer.date && transfer.date < goLiveDate) {
    return { ignored: true, ignoreType: 'beforeGoLive' };
  }

  const amt = Number(transfer.amountPaise || 0);
  if (amt <= 0) {
    return { skip: true, error: true, reason: `Invalid transfer amountPaise: ${transfer.amountPaise}` };
  }

  const fromAcc = transfer.fromAccountId;
  const toAcc = transfer.toAccountId;

  const fy = transfer.financialYear || getFinancialYear(transfer.date);

  const normalVoucher = {
    voucherId: `vch_trf_${transfer.id}`,
    voucherNo: `VCH-${transfer.transferNo || transfer.id}`,
    type: 'contra',
    date: transfer.date,
    fy,
    source: 'transfer',
    sourceId: transfer.id,
    narration: `Contra Transfer: From ${fromAcc} To ${toAcc} - ${transfer.description || ''}`,
    lines: [
      { accountCode: toAcc, drPaise: amt, crPaise: 0 },
      { accountCode: fromAcc, drPaise: 0, crPaise: amt }
    ]
  };

  let cancelVoucher = null;
  if (transfer.status === 'cancelled') {
    const cancelDate = (transfer.cancelledAt ? transfer.cancelledAt.split('T')[0] : transfer.date);
    cancelVoucher = {
      voucherId: `vch_trfcx_${transfer.id}`,
      voucherNo: `VCH-CX-${transfer.transferNo || transfer.id}`,
      type: 'contra',
      date: cancelDate,
      fy: getFinancialYear(cancelDate), // F3: Follow cancel date's FY
      source: 'transfer',
      sourceId: transfer.id,
      narration: `Reversal of Transfer ${transfer.transferNo || transfer.id}: ${transfer.cancelReason || 'Cancelled'}`,
      lines: [
        { accountCode: fromAcc, drPaise: amt, crPaise: 0 },
        { accountCode: toAcc, drPaise: 0, crPaise: amt }
      ]
    };
  }

  return { normalVoucher, cancelVoucher };
}

function computeOpeningJournalLines(openingDoc) {
  if (!openingDoc || openingDoc.status !== 'locked' || !Array.isArray(openingDoc.lines)) {
    return null;
  }

  const fy = openingDoc.fy;
  const date = openingDoc.date || `${fy.split('-')[0]}-04-01`;

  const lines = [];
  let totalDr = 0;
  let totalCr = 0;

  openingDoc.lines.forEach(l => {
    const dr = Number(l.debitPaise || 0);
    const cr = Number(l.creditPaise || 0);
    if (dr > 0 || cr > 0) {
      lines.push({ accountCode: l.accountCode, drPaise: dr, crPaise: cr });
      totalDr += dr;
      totalCr += cr;
    }
  });

  if (totalDr !== totalCr) {
    throw new Error(`Unbalanced opening voucher for FY ${fy}: Dr ${totalDr} != Cr ${totalCr}`);
  }

  return {
    voucherId: `vch_open_${fy}`,
    voucherNo: `VCH-OPEN-${fy}`,
    type: 'opening',
    date,
    fy,
    source: 'opening',
    sourceId: `opening_${fy}`,
    narration: `Opening Balances for FY ${fy}`,
    lines
  };
}

function applyVoucherToSummary(accountsObj, voucher) {
  if (!accountsObj || !voucher || !Array.isArray(voucher.lines)) return;
  const monthKey = (voucher.date || '').slice(0, 7); // 'YYYY-MM'
  if (!monthKey) return;

  voucher.lines.forEach(l => {
    const code = l.accountCode;
    if (!code) return;
    if (!accountsObj[code]) {
      accountsObj[code] = {};
    }
    if (!accountsObj[code][monthKey]) {
      accountsObj[code][monthKey] = { dr: 0, cr: 0 };
    }
    accountsObj[code][monthKey].dr += (l.drPaise || 0);
    accountsObj[code][monthKey].cr += (l.crPaise || 0);
  });
}

// ── F2: High-Performance Batch Posting Engine ────────────────────────────────

async function postVouchersBatch(db, schoolId, candidateVouchers, targetFY) {
  if (!candidateVouchers || candidateVouchers.length === 0) {
    return { newlyPosted: 0, postedVoucherIds: [] };
  }

  // 1. Cheap getAll pre-check outside transaction to skip already-posted vouchers
  const vchRefs = candidateVouchers.map(v => db.doc(`tenant_data/${schoolId}/accounts_journal/${v.voucherId}`));
  const preSnaps = await db.getAll(...vchRefs);

  const absentVouchers = [];
  preSnaps.forEach((snap, idx) => {
    if (!snap.exists) {
      absentVouchers.push(candidateVouchers[idx]);
    }
  });

  if (absentVouchers.length === 0) {
    return { newlyPosted: 0, postedVoucherIds: [] };
  }

  // 2. Process in chunks of up to 100 in ONE transaction per chunk
  const BATCH_SIZE = 100;
  let totalNewlyPosted = 0;
  const postedVoucherIds = [];

  for (let i = 0; i < absentVouchers.length; i += BATCH_SIZE) {
    const batch = absentVouchers.slice(i, i + BATCH_SIZE);

    // F3: Group batch updates per FY doc (summary FY follows voucher date)
    const distinctFYs = [...new Set(batch.map(v => v.fy || targetFY))];
    const summaryRefs = distinctFYs.map(fy => db.doc(`tenant_data/${schoolId}/accounts_summary/${fy}`));
    const batchRefs = batch.map(v => db.doc(`tenant_data/${schoolId}/accounts_journal/${v.voucherId}`));

    await db.runTransaction(async (t) => {
      const vSnaps = await t.getAll(...batchRefs);
      const sSnaps = await t.getAll(...summaryRefs);

      // Load summaries by FY
      const summaryByFY = {};
      sSnaps.forEach((sSnap, idx) => {
        const fy = distinctFYs[idx];
        summaryByFY[fy] = sSnap.exists ? sSnap.data() : { fy, accounts: {} };
        summaryByFY[fy].accounts = summaryByFY[fy].accounts || {};
      });

      // Filter truly absent vouchers
      const toCreate = [];
      vSnaps.forEach((vSnap, idx) => {
        if (!vSnap.exists) {
          toCreate.push(batch[idx]);
        }
      });

      if (toCreate.length === 0) return;

      const updatedFYs = new Set();
      toCreate.forEach(v => {
        const vfy = v.fy || targetFY;
        applyVoucherToSummary(summaryByFY[vfy].accounts, v);
        updatedFYs.add(vfy);

        const vRef = db.doc(`tenant_data/${schoolId}/accounts_journal/${v.voucherId}`);
        t.set(vRef, {
          ...v,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      });

      // Write each updated summary doc once per transaction
      updatedFYs.forEach(fy => {
        const sRef = db.doc(`tenant_data/${schoolId}/accounts_summary/${fy}`);
        t.set(sRef, {
          fy,
          accounts: summaryByFY[fy].accounts,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      });

      totalNewlyPosted += toCreate.length;
      toCreate.forEach(v => postedVoucherIds.push(v.voucherId));
    });
  }

  return { newlyPosted: totalNewlyPosted, postedVoucherIds };
}

// ── Main HTTP Handler ────────────────────────────────────────────────────────

async function handler(req, res) {
  ensureResponseHelpers(res);
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const { idToken, schoolId, action, fy, cursor } = body;

  if (!idToken || !schoolId || !action) {
    return res.status(400).json({ error: 'Missing required parameters (idToken, schoolId, action).' });
  }

  let firebaseAdmin;
  try {
    firebaseAdmin = getAdmin();
  } catch (initErr) {
    console.error('[accounts] Firebase Admin Init Error:', initErr);
    return res.status(500).json({ error: 'Authentication service initialization error.' });
  }

  const db = firebaseAdmin.firestore();

  // 1. Verify Caller ID Token
  let decodedToken;
  try {
    decodedToken = await firebaseAdmin.auth().verifyIdToken(idToken);
  } catch (tokenErr) {
    if (process.env.NODE_ENV === 'test' && typeof idToken === 'string' && idToken.startsWith('mock_test_token_')) {
      const uid = idToken.replace('mock_test_token_', '');
      decodedToken = { uid };
    } else {
      console.warn('[accounts] Invalid ID Token:', tokenErr.message);
      return res.status(401).json({ error: 'Invalid or expired session token.' });
    }
  }
  const uid = decodedToken.uid;

  // 2. Security Check: Super Admin is strictly FORBIDDEN
  if (uid === SUPER_ADMIN_UID) {
    return res.status(403).json({ error: 'Access denied: Super Admin is prohibited from accounts access.' });
  }

  // 3. Security Check: Caller must be verified School Admin for the requested schoolId
  const accessSnap = await db.collection('school_access').doc(uid).get();
  if (!accessSnap.exists) {
    return res.status(403).json({ error: 'Access denied: No verified school access record found.' });
  }
  const accessData = accessSnap.data() || {};
  if (accessData.schoolId !== schoolId || accessData.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied: Only verified school admins may access the accounts API.' });
  }

  // 4. Feature Flag Check: School must have 'accounts' enabled in schools/{schoolId}.allowed_features
  const schoolSnap = await db.collection('schools').doc(schoolId).get();
  const schoolData = schoolSnap.exists ? (schoolSnap.data() || {}) : {};
  const allowedFeatures = Array.isArray(schoolData.allowed_features) ? schoolData.allowed_features : [];
  if (!allowedFeatures.includes('accounts')) {
    return res.status(403).json({ error: 'Accounts is not enabled for this school.' });
  }

  const targetFY = fy || getFinancialYear();

  // ── Action: status ─────────────────────────────────────────────────────────
  if (action === 'status') {
    const syncStateDoc = await db.doc(`tenant_data/${schoolId}/accounts_sync_state/${targetFY}`).get();
    const stateData = syncStateDoc.exists ? syncStateDoc.data() : {
      fy: targetFY,
      lastSyncAt: null,
      counts: {},
      skipped: [],
      warnings: []
    };
    return res.status(200).json({ status: 'ok', fy: targetFY, state: stateData });
  }

  // ── Action: sync ───────────────────────────────────────────────────────────
  if (action === 'sync') {
    const startTime = Date.now();
    const TIME_LIMIT_MS = 6000; // Stay comfortably under Vercel Hobby 10s timeout
    const LEASE_DURATION_MS = 20000; // F7: 20s concurrency lease

    const syncStateRef = db.doc(`tenant_data/${schoolId}/accounts_sync_state/${targetFY}`);

    // F7: Concurrency Lease Acquisition via Transaction
    const leaseAcquired = await db.runTransaction(async (t) => {
      const sSnap = await t.get(syncStateRef);
      const now = Date.now();
      if (sSnap.exists) {
        const data = sSnap.data() || {};
        let leaseUntilMs = 0;
        if (data.leaseUntil) {
          leaseUntilMs = (typeof data.leaseUntil.toMillis === 'function')
            ? data.leaseUntil.toMillis()
            : Number(data.leaseUntil);
        }
        if (leaseUntilMs > now) {
          return false; // Lease currently held by another sync run
        }
      }
      t.set(syncStateRef, { leaseUntil: new Date(now + LEASE_DURATION_MS) }, { merge: true });
      return true;
    });

    if (!leaseAcquired) {
      return res.status(200).json({
        status: 'ok',
        busy: true,
        message: 'Another sync is currently in progress. Please retry in a few seconds.'
      });
    }

    let syncCompletedCleanly = false;

    try {
      // Load accounts_settings/main
      const settingsDoc = await db.doc(`tenant_data/${schoolId}/accounts_settings/main`).get();
      const settings = settingsDoc.exists ? (settingsDoc.data() || {}) : {};

      // Load Chart of Accounts for validation
      const chartSnaps = await db.collection(`tenant_data/${schoolId}/accounts_chart`).get();
      const chartMap = {};
      chartSnaps.forEach(doc => {
        chartMap[doc.id] = doc.data();
      });
      // Fallback to default chart if collection is empty
      if (Object.keys(chartMap).length === 0) {
        DEFAULT_CHART_OF_ACCOUNTS.forEach(a => { chartMap[a.code] = a; });
      }

      // Load existing sync state
      const syncStateSnap = await syncStateRef.get();
      const syncState = syncStateSnap.exists ? syncStateSnap.data() : {
        fy: targetFY,
        lastSyncAt: null,
        monthDocUpdateTimes: {},
        counts: {
          vouchersTotal: 0,
          feesPosted: 0,
          expensesPosted: 0,
          receiptsPosted: 0,
          transfersPosted: 0,
          openingPosted: 0,
          ignoredDue: 0,
          beforeGoLive: 0
        },
        skipped: [],
        warnings: []
      };
      syncState.monthDocUpdateTimes = syncState.monthDocUpdateTimes || {};
      syncState.counts = syncState.counts || {};
      syncState.skipped = syncState.skipped || [];
      syncState.warnings = syncState.warnings || [];

      // F6: If goLiveDate changed while no fee voucher exists (or clearMonthDocUpdateTimes flag set), clear monthDocUpdateTimes
      if (!settings.hasFeeVouchers && (settings.clearMonthDocUpdateTimes || (settings.goLiveDate && settings.goLiveDate !== syncState.appliedGoLiveDate))) {
        syncState.monthDocUpdateTimes = {};
        syncState.appliedGoLiveDate = settings.goLiveDate;
        if (settings.clearMonthDocUpdateTimes) {
          await settingsDoc.ref.set({ clearMonthDocUpdateTimes: false }, { merge: true });
        }
      } else if (!syncState.appliedGoLiveDate && settings.goLiveDate) {
        syncState.appliedGoLiveDate = settings.goLiveDate;
      }

      // Map to aggregate warnings without row spam
      const aggregatedWarnings = new Map();

      // Step A: Process Fee Months
      const [startYearStr] = targetFY.split('-');
      const startYear = parseInt(startYearStr, 10);
      const endYear = startYear + 1;

      const feeMonthTargets = [
        { yr: String(startYear), mo: '04' },
        { yr: String(startYear), mo: '05' },
        { yr: String(startYear), mo: '06' },
        { yr: String(startYear), mo: '07' },
        { yr: String(startYear), mo: '08' },
        { yr: String(startYear), mo: '09' },
        { yr: String(startYear), mo: '10' },
        { yr: String(startYear), mo: '11' },
        { yr: String(startYear), mo: '12' },
        { yr: String(endYear), mo: '01' },
        { yr: String(endYear), mo: '02' },
        { yr: String(endYear), mo: '03' }
      ];

      let newFeesPosted = 0;
      let newExpensesPosted = 0;
      let newReceiptsPosted = 0;
      let newTransfersPosted = 0;
      let newOpeningPosted = 0;

      for (const mt of feeMonthTargets) {
        if (Date.now() - startTime > TIME_LIMIT_MS) {
          break;
        }
        const mKey = `${mt.yr}-${mt.mo}`;
        const docPath = `tenant_data/${schoolId}/fees_years/${mt.yr}/months/${mt.mo}`;
        const mDoc = await db.doc(docPath).get();

        if (!mDoc.exists) continue;

        const docUpdateMs = (mDoc.updateTime && typeof mDoc.updateTime.toMillis === 'function')
          ? mDoc.updateTime.toMillis()
          : null;

        // Incremental check: if updateTime hasn't changed since last full sync, skip!
        if (docUpdateMs && syncState.monthDocUpdateTimes[mKey] === docUpdateMs) {
          continue;
        }

        const txns = Array.isArray(mDoc.data().transactions) ? mDoc.data().transactions : [];
        let monthAllProcessed = true;
        const candidateBatch = [];

        for (const txn of txns) {
          if (Date.now() - startTime > TIME_LIMIT_MS) {
            monthAllProcessed = false;
            break;
          }
          try {
            const res = computeFeeJournalLines(txn, settings, chartMap);
            if (!res) continue;

            if (res.ignored) {
              // F5: Intentionally ignored records
              if (res.ignoreType === 'ignoredDue') {
                syncState.counts.ignoredDue = (syncState.counts.ignoredDue || 0) + 1;
              } else if (res.ignoreType === 'beforeGoLive') {
                syncState.counts.beforeGoLive = (syncState.counts.beforeGoLive || 0) + 1;
              }
              continue;
            }

            if (res.error) {
              // F1 & F4 & F8: Error means month is NOT marked as synced!
              monthAllProcessed = false;
              if (res.isDataProblem) {
                syncState.skipped.push({ type: 'fee', id: txn.id, reason: res.reason });
              }
              if (res.warning) {
                aggregatedWarnings.set(res.warningKey || res.warning, { type: 'fee', message: res.warning });
              }
              continue;
            }

            if (res.voucherId) {
              if (res.warnings && res.warnings.length > 0) {
                res.warnings.forEach(w => {
                  aggregatedWarnings.set(w, { type: 'fee', id: txn.id, message: w });
                });
              }
              candidateBatch.push(res);

              if (candidateBatch.length >= 100) {
                const { newlyPosted } = await postVouchersBatch(db, schoolId, candidateBatch, targetFY);
                newFeesPosted += newlyPosted;
                syncState.counts.feesPosted = (syncState.counts.feesPosted || 0) + newlyPosted;
                syncState.counts.vouchersTotal = (syncState.counts.vouchersTotal || 0) + newlyPosted;
                candidateBatch.length = 0;
              }
            }
          } catch (err) {
            monthAllProcessed = false;
            aggregatedWarnings.set('ERR_' + txn.id, { type: 'fee', id: txn.id, message: err.message });
          }
        }

        // Post remaining candidate vouchers for this month doc
        if (candidateBatch.length > 0) {
          const { newlyPosted } = await postVouchersBatch(db, schoolId, candidateBatch, targetFY);
          newFeesPosted += newlyPosted;
          syncState.counts.feesPosted = (syncState.counts.feesPosted || 0) + newlyPosted;
          syncState.counts.vouchersTotal = (syncState.counts.vouchersTotal || 0) + newlyPosted;
          candidateBatch.length = 0;
        }

        // F1 CRITICAL: Mark monthDocUpdateTimes[mKey] ONLY when every txn was processed successfully
        if (monthAllProcessed && docUpdateMs) {
          syncState.monthDocUpdateTimes[mKey] = docUpdateMs;
        }
      }

      // Step B: Expenses (Batching with F2)
      if (Date.now() - startTime < TIME_LIMIT_MS) {
        const expSnaps = await db.collection(`tenant_data/${schoolId}/accounts_expenses`)
          .where('financialYear', '==', targetFY)
          .get();

        const expBatch = [];
        for (const d of expSnaps.docs) {
          if (Date.now() - startTime > TIME_LIMIT_MS) break;
          const exp = d.data();
          exp.id = d.id;
          const resVch = computeExpenseJournalLines(exp, settings);
          if (resVch && resVch.ignored) {
            if (resVch.ignoreType === 'beforeGoLive') syncState.counts.beforeGoLive = (syncState.counts.beforeGoLive || 0) + 1;
            continue;
          }
          if (resVch && resVch.skip) {
            syncState.skipped.push({ type: 'expense', id: exp.id, reason: resVch.reason });
            continue;
          }
          if (resVch && resVch.normalVoucher) expBatch.push(resVch.normalVoucher);
          if (resVch && resVch.cancelVoucher) expBatch.push(resVch.cancelVoucher);
        }

        if (expBatch.length > 0) {
          const { newlyPosted } = await postVouchersBatch(db, schoolId, expBatch, targetFY);
          newExpensesPosted += newlyPosted;
          syncState.counts.expensesPosted = (syncState.counts.expensesPosted || 0) + newlyPosted;
          syncState.counts.vouchersTotal = (syncState.counts.vouchersTotal || 0) + newlyPosted;
        }
      }

      // Step C: Other Income Receipts (Batching with F2)
      if (Date.now() - startTime < TIME_LIMIT_MS) {
        const rcpSnaps = await db.collection(`tenant_data/${schoolId}/accounts_receipts`)
          .where('financialYear', '==', targetFY)
          .get();

        const rcpBatch = [];
        for (const d of rcpSnaps.docs) {
          if (Date.now() - startTime > TIME_LIMIT_MS) break;
          const rcp = d.data();
          rcp.id = d.id;
          const resVch = computeReceiptJournalLines(rcp, settings);
          if (resVch && resVch.ignored) {
            if (resVch.ignoreType === 'beforeGoLive') syncState.counts.beforeGoLive = (syncState.counts.beforeGoLive || 0) + 1;
            continue;
          }
          if (resVch && resVch.skip) {
            syncState.skipped.push({ type: 'receipt', id: rcp.id, reason: resVch.reason });
            continue;
          }
          if (resVch && resVch.normalVoucher) rcpBatch.push(resVch.normalVoucher);
          if (resVch && resVch.cancelVoucher) rcpBatch.push(resVch.cancelVoucher);
        }

        if (rcpBatch.length > 0) {
          const { newlyPosted } = await postVouchersBatch(db, schoolId, rcpBatch, targetFY);
          newReceiptsPosted += newlyPosted;
          syncState.counts.receiptsPosted = (syncState.counts.receiptsPosted || 0) + newlyPosted;
          syncState.counts.vouchersTotal = (syncState.counts.vouchersTotal || 0) + newlyPosted;
        }
      }

      // Step D: Contra Transfers (Batching with F2)
      if (Date.now() - startTime < TIME_LIMIT_MS) {
        const trfSnaps = await db.collection(`tenant_data/${schoolId}/accounts_transfers`)
          .where('financialYear', '==', targetFY)
          .get();

        const trfBatch = [];
        for (const d of trfSnaps.docs) {
          if (Date.now() - startTime > TIME_LIMIT_MS) break;
          const trf = d.data();
          trf.id = d.id;
          const resVch = computeTransferJournalLines(trf, settings);
          if (resVch && resVch.ignored) {
            if (resVch.ignoreType === 'beforeGoLive') syncState.counts.beforeGoLive = (syncState.counts.beforeGoLive || 0) + 1;
            continue;
          }
          if (resVch && resVch.skip) {
            syncState.skipped.push({ type: 'transfer', id: trf.id, reason: resVch.reason });
            continue;
          }
          if (resVch && resVch.normalVoucher) trfBatch.push(resVch.normalVoucher);
          if (resVch && resVch.cancelVoucher) trfBatch.push(resVch.cancelVoucher);
        }

        if (trfBatch.length > 0) {
          const { newlyPosted } = await postVouchersBatch(db, schoolId, trfBatch, targetFY);
          newTransfersPosted += newlyPosted;
          syncState.counts.transfersPosted = (syncState.counts.transfersPosted || 0) + newlyPosted;
          syncState.counts.vouchersTotal = (syncState.counts.vouchersTotal || 0) + newlyPosted;
        }
      }

      // Step E: Opening Balances
      if (Date.now() - startTime < TIME_LIMIT_MS) {
        const openDoc = await db.doc(`tenant_data/${schoolId}/accounts_settings/opening`).get();
        if (openDoc.exists) {
          const opData = openDoc.data();
          if (opData.status === 'locked' && (!opData.fy || opData.fy === targetFY)) {
            try {
              const openVoucher = computeOpeningJournalLines(opData);
              if (openVoucher) {
                const { newlyPosted } = await postVouchersBatch(db, schoolId, [openVoucher], targetFY);
                if (newlyPosted > 0) {
                  newOpeningPosted += newlyPosted;
                  syncState.counts.openingPosted = (syncState.counts.openingPosted || 0) + newlyPosted;
                  syncState.counts.vouchersTotal = (syncState.counts.vouchersTotal || 0) + newlyPosted;
                }
              }
            } catch (openErr) {
              aggregatedWarnings.set('ERR_OPENING', { type: 'opening', message: openErr.message });
            }
          }
        }
      }

      // F6: Lock settings once any fee voucher exists
      if (syncState.counts.feesPosted > 0 && !settings.hasFeeVouchers) {
        await settingsDoc.ref.set({ hasFeeVouchers: true }, { merge: true });
      }

      const isComplete = (Date.now() - startTime < TIME_LIMIT_MS);
      syncState.lastSyncAt = new Date().toISOString();

      // Current active warnings
      syncState.warnings = Array.from(aggregatedWarnings.values()).slice(-100);

      // Deduplicate real skipped items
      const seenSkipped = new Set();
      syncState.skipped = syncState.skipped.filter(s => {
        const k = `${s.type}_${s.id}_${s.reason}`;
        if (seenSkipped.has(k)) return false;
        seenSkipped.add(k);
        return true;
      }).slice(-100);

      // F7: Release lease on completion
      syncState.leaseUntil = null;
      await syncStateRef.set(syncState);
      syncCompletedCleanly = true;

      return res.status(200).json({
        status: 'ok',
        done: isComplete,
        busy: false,
        fy: targetFY,
        postedThisRun: {
          fees: newFeesPosted,
          expenses: newExpensesPosted,
          receipts: newReceiptsPosted,
          transfers: newTransfersPosted,
          opening: newOpeningPosted
        },
        counts: syncState.counts,
        skippedCount: syncState.skipped.length,
        warningCount: syncState.warnings.length,
        lastSyncAt: syncState.lastSyncAt
      });
    } finally {
      // F7: Guarantee lease is released if unexpected failure occurred
      if (!syncCompletedCleanly) {
        await syncStateRef.set({ leaseUntil: null }, { merge: true }).catch(() => {});
      }
    }
  }

  return res.status(400).json({ error: `Unknown action: '${action}'` });
}

// Module Exports
module.exports = handler;
module.exports.getFinancialYear = getFinancialYear;
module.exports.computeFeeJournalLines = computeFeeJournalLines;
module.exports.computeExpenseJournalLines = computeExpenseJournalLines;
module.exports.computeReceiptJournalLines = computeReceiptJournalLines;
module.exports.computeTransferJournalLines = computeTransferJournalLines;
module.exports.computeOpeningJournalLines = computeOpeningJournalLines;
module.exports.applyVoucherToSummary = applyVoucherToSummary;
module.exports.postVouchersBatch = postVouchersBatch;
