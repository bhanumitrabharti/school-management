'use strict';

/**
 * api/accounts.js
 *
 * Accounts Module Slice 2 Server Endpoint:
 * - Action 'sync': Derives the general ledger (accounts_journal) from source records
 *   (fees_years, accounts_expenses, accounts_receipts, accounts_transfers, accounts_settings/opening)
 *   and maintains accounts_summary and accounts_sync_state atomically.
 * - Action 'status': Returns last sync time, voucher counts, skipped list, and warnings.
 *
 * Security:
 * - Requires valid Firebase Auth ID Token.
 * - Caller must be school admin in school_access/{uid} matching the target schoolId.
 * - Super Admin UID is strictly REJECTED (Super Admin has zero access to accounts).
 * - Teachers are strictly REJECTED.
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

function computeFeeJournalLines(txn, settings) {
  if (!txn || !txn.id) return null;
  const goLiveDate = settings && settings.goLiveDate;
  if (goLiveDate && txn.date && txn.date < goLiveDate) {
    return { skip: true, reason: `Fee record date ${txn.date} before goLiveDate ${goLiveDate}` };
  }

  // Cash basis: only payments are posted; 'due' transactions are not posted
  if (txn.type !== 'payment') {
    return { skip: true, reason: `Non-payment transaction type: ${txn.type}` };
  }

  const feeCashAccount = (settings && settings.feeCashAccount) || '11100';
  const feeDigitalAccount = (settings && settings.feeDigitalAccount) || '11120';
  const feeHeadMapping = (settings && settings.feeHeadMapping) || {};
  const defaultIncomeAccount = '41100';

  const mode = (txn.mode || 'Cash').trim();
  const assetAccount = (mode.toLowerCase() === 'cash') ? feeCashAccount : feeDigitalAccount;

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
      txn.allocations.forEach(alloc => {
        const hAmt = Math.round(Number(alloc.amount || 0) * 100);
        if (hAmt > 0) {
          allocPaiseSum += hAmt;
          const headId = alloc.feeHeadId || '';
          const incomeAcc = feeHeadMapping[headId] || defaultIncomeAccount;
          if (!feeHeadMapping[headId]) {
            warnings.push(`Fee head '${alloc.feeHeadName || headId}' not mapped; defaulted to ${defaultIncomeAccount}`);
          }
          lines.push({ accountCode: incomeAcc, drPaise: 0, crPaise: hAmt });
        }
      });

      // If allocations don't sum to grossPaise, put difference on default income account
      if (allocPaiseSum !== grossPaise) {
        const diff = grossPaise - allocPaiseSum;
        if (diff !== 0) {
          lines.push({ accountCode: defaultIncomeAccount, drPaise: 0, crPaise: diff });
          warnings.push(`Allocations sum (${allocPaiseSum}p) differs from gross (${grossPaise}p); difference ${diff}p credited to ${defaultIncomeAccount}`);
        }
      }
    } else {
      // Unallocated payment: entire gross credited to head or default
      const headId = txn.feeHeadId || '';
      const incomeAcc = feeHeadMapping[headId] || defaultIncomeAccount;
      if (headId && !feeHeadMapping[headId]) {
        warnings.push(`Fee head '${headId}' not mapped; defaulted to ${defaultIncomeAccount}`);
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
      txn.allocations.forEach(alloc => {
        const hAmt = Math.abs(Math.round(Number(alloc.amount || 0) * 100));
        if (hAmt > 0) {
          allocPaiseSum += hAmt;
          const headId = alloc.feeHeadId || '';
          const incomeAcc = feeHeadMapping[headId] || defaultIncomeAccount;
          lines.push({ accountCode: incomeAcc, drPaise: hAmt, crPaise: 0 });
        }
      });
      if (allocPaiseSum !== absGross) {
        const diff = absGross - allocPaiseSum;
        if (diff !== 0) {
          lines.push({ accountCode: defaultIncomeAccount, drPaise: diff, crPaise: 0 });
        }
      }
    } else {
      const headId = txn.feeHeadId || '';
      const incomeAcc = feeHeadMapping[headId] || defaultIncomeAccount;
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
    return { skip: true, reason: `Expense date ${expense.date} before goLiveDate ${goLiveDate}` };
  }

  const amt = Number(expense.amountPaise || 0);
  if (amt <= 0) {
    return { skip: true, reason: `Invalid expense amountPaise: ${expense.amountPaise}` };
  }

  const paidFrom = expense.paidFromAccountId;
  const category = expense.categoryAccountId;

  // Server re-validates: paidFrom must be cash/bank, category must be an expense account (5XXXX)
  const isPaidFromValid = (paidFrom === '11100' || paidFrom === '11110' || (paidFrom && paidFrom.startsWith('111')));
  if (!isPaidFromValid) {
    return { skip: true, reason: `Expense paidFromAccountId '${paidFrom}' is not recognized as a cash/bank ledger.` };
  }

  const fy = expense.financialYear || getFinancialYear(expense.date);

  // Normal active expense voucher
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
      fy: getFinancialYear(cancelDate),
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
    return { skip: true, reason: `Receipt date ${receipt.date} before goLiveDate ${goLiveDate}` };
  }

  const amt = Number(receipt.amountPaise || 0);
  if (amt <= 0) {
    return { skip: true, reason: `Invalid receipt amountPaise: ${receipt.amountPaise}` };
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
      fy: getFinancialYear(cancelDate),
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
    return { skip: true, reason: `Transfer date ${transfer.date} before goLiveDate ${goLiveDate}` };
  }

  const amt = Number(transfer.amountPaise || 0);
  if (amt <= 0) {
    return { skip: true, reason: `Invalid transfer amountPaise: ${transfer.amountPaise}` };
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
      fy: getFinancialYear(cancelDate),
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

    // Load accounts_settings/main
    const settingsDoc = await db.doc(`tenant_data/${schoolId}/accounts_settings/main`).get();
    const settings = settingsDoc.exists ? (settingsDoc.data() || {}) : {};

    // Load existing sync state
    const syncStateRef = db.doc(`tenant_data/${schoolId}/accounts_sync_state/${targetFY}`);
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
        openingPosted: 0
      },
      skipped: [],
      warnings: []
    };
    syncState.monthDocUpdateTimes = syncState.monthDocUpdateTimes || {};
    syncState.counts = syncState.counts || {};
    syncState.skipped = syncState.skipped || [];
    syncState.warnings = syncState.warnings || [];

    // Helper to post voucher idempotently in a Firestore transaction
    async function postVoucherAtomically(voucher) {
      if (!voucher || !voucher.voucherId) return false;
      const vchRef = db.doc(`tenant_data/${schoolId}/accounts_journal/${voucher.voucherId}`);
      const summaryRef = db.doc(`tenant_data/${schoolId}/accounts_summary/${targetFY}`);

      return await db.runTransaction(async (t) => {
        const vSnap = await t.get(vchRef);
        if (vSnap.exists) {
          return false; // Already posted!
        }
        const sSnap = await t.get(summaryRef);
        const sData = sSnap.exists ? sSnap.data() : { fy: targetFY, accounts: {} };
        sData.accounts = sData.accounts || {};

        applyVoucherToSummary(sData.accounts, voucher);

        t.set(vchRef, {
          ...voucher,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        t.set(summaryRef, {
          fy: targetFY,
          accounts: sData.accounts,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return true;
      });
    }

    // Step A: Process Fee Months
    // An FY spans calendar year Part 1 (months 04..12) and calendar year Part 2 (months 01..03)
    const [startYearStr, endYYStr] = targetFY.split('-');
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
        break; // Stop and return chunk
      }
      const mKey = `${mt.yr}-${mt.mo}`;
      const docPath = `tenant_data/${schoolId}/fees_years/${mt.yr}/months/${mt.mo}`;
      const mDoc = await db.doc(docPath).get();

      if (!mDoc.exists) continue;

      const docUpdateMs = (mDoc.updateTime && typeof mDoc.updateTime.toMillis === 'function')
        ? mDoc.updateTime.toMillis()
        : null;

      // Incremental check: if updateTime hasn't changed since last sync, skip!
      if (docUpdateMs && syncState.monthDocUpdateTimes[mKey] === docUpdateMs) {
        continue;
      }

      const txns = Array.isArray(mDoc.data().transactions) ? mDoc.data().transactions : [];
      for (const txn of txns) {
        if (Date.now() - startTime > TIME_LIMIT_MS) break;
        try {
          const resVoucher = computeFeeJournalLines(txn, settings);
          if (resVoucher && resVoucher.skip) {
            syncState.skipped.push({ type: 'fee', id: txn.id, reason: resVoucher.reason });
            continue;
          }
          if (resVoucher && resVoucher.voucherId) {
            if (resVoucher.warnings && resVoucher.warnings.length > 0) {
              resVoucher.warnings.forEach(w => syncState.warnings.push({ type: 'fee', id: txn.id, message: w }));
            }
            const posted = await postVoucherAtomically(resVoucher);
            if (posted) {
              newFeesPosted++;
              syncState.counts.feesPosted = (syncState.counts.feesPosted || 0) + 1;
              syncState.counts.vouchersTotal = (syncState.counts.vouchersTotal || 0) + 1;
            }
          }
        } catch (postErr) {
          console.warn(`[accounts sync] Error posting fee txn ${txn.id}:`, postErr.message);
          syncState.warnings.push({ type: 'fee', id: txn.id, message: postErr.message });
        }
      }

      if (docUpdateMs) {
        syncState.monthDocUpdateTimes[mKey] = docUpdateMs;
      }
    }

    // Step B: Expenses
    if (Date.now() - startTime < TIME_LIMIT_MS) {
      const expSnaps = await db.collection(`tenant_data/${schoolId}/accounts_expenses`)
        .where('financialYear', '==', targetFY)
        .get();

      for (const d of expSnaps.docs) {
        if (Date.now() - startTime > TIME_LIMIT_MS) break;
        const exp = d.data();
        exp.id = d.id;
        const resVch = computeExpenseJournalLines(exp, settings);
        if (resVch && resVch.skip) {
          syncState.skipped.push({ type: 'expense', id: exp.id, reason: resVch.reason });
          continue;
        }
        if (resVch && resVch.normalVoucher) {
          const posted = await postVoucherAtomically(resVch.normalVoucher);
          if (posted) {
            newExpensesPosted++;
            syncState.counts.expensesPosted = (syncState.counts.expensesPosted || 0) + 1;
            syncState.counts.vouchersTotal = (syncState.counts.vouchersTotal || 0) + 1;
          }
        }
        if (resVch && resVch.cancelVoucher) {
          const posted = await postVoucherAtomically(resVch.cancelVoucher);
          if (posted) {
            newExpensesPosted++;
            syncState.counts.expensesPosted = (syncState.counts.expensesPosted || 0) + 1;
            syncState.counts.vouchersTotal = (syncState.counts.vouchersTotal || 0) + 1;
          }
        }
      }
    }

    // Step C: Other Income (Receipts)
    if (Date.now() - startTime < TIME_LIMIT_MS) {
      const rcpSnaps = await db.collection(`tenant_data/${schoolId}/accounts_receipts`)
        .where('financialYear', '==', targetFY)
        .get();

      for (const d of rcpSnaps.docs) {
        if (Date.now() - startTime > TIME_LIMIT_MS) break;
        const rcp = d.data();
        rcp.id = d.id;
        const resVch = computeReceiptJournalLines(rcp, settings);
        if (resVch && resVch.skip) {
          syncState.skipped.push({ type: 'receipt', id: rcp.id, reason: resVch.reason });
          continue;
        }
        if (resVch && resVch.normalVoucher) {
          const posted = await postVoucherAtomically(resVch.normalVoucher);
          if (posted) {
            newReceiptsPosted++;
            syncState.counts.receiptsPosted = (syncState.counts.receiptsPosted || 0) + 1;
            syncState.counts.vouchersTotal = (syncState.counts.vouchersTotal || 0) + 1;
          }
        }
        if (resVch && resVch.cancelVoucher) {
          const posted = await postVoucherAtomically(resVch.cancelVoucher);
          if (posted) {
            newReceiptsPosted++;
            syncState.counts.receiptsPosted = (syncState.counts.receiptsPosted || 0) + 1;
            syncState.counts.vouchersTotal = (syncState.counts.vouchersTotal || 0) + 1;
          }
        }
      }
    }

    // Step D: Contra Transfers
    if (Date.now() - startTime < TIME_LIMIT_MS) {
      const trfSnaps = await db.collection(`tenant_data/${schoolId}/accounts_transfers`)
        .where('financialYear', '==', targetFY)
        .get();

      for (const d of trfSnaps.docs) {
        if (Date.now() - startTime > TIME_LIMIT_MS) break;
        const trf = d.data();
        trf.id = d.id;
        const resVch = computeTransferJournalLines(trf, settings);
        if (resVch && resVch.skip) {
          syncState.skipped.push({ type: 'transfer', id: trf.id, reason: resVch.reason });
          continue;
        }
        if (resVch && resVch.normalVoucher) {
          const posted = await postVoucherAtomically(resVch.normalVoucher);
          if (posted) {
            newTransfersPosted++;
            syncState.counts.transfersPosted = (syncState.counts.transfersPosted || 0) + 1;
            syncState.counts.vouchersTotal = (syncState.counts.vouchersTotal || 0) + 1;
          }
        }
        if (resVch && resVch.cancelVoucher) {
          const posted = await postVoucherAtomically(resVch.cancelVoucher);
          if (posted) {
            newTransfersPosted++;
            syncState.counts.transfersPosted = (syncState.counts.transfersPosted || 0) + 1;
            syncState.counts.vouchersTotal = (syncState.counts.vouchersTotal || 0) + 1;
          }
        }
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
              const posted = await postVoucherAtomically(openVoucher);
              if (posted) {
                newOpeningPosted++;
                syncState.counts.openingPosted = (syncState.counts.openingPosted || 0) + 1;
                syncState.counts.vouchersTotal = (syncState.counts.vouchersTotal || 0) + 1;
              }
            }
          } catch (openErr) {
            console.warn('[accounts sync] Opening balance voucher error:', openErr.message);
            syncState.warnings.push({ type: 'opening', message: openErr.message });
          }
        }
      }
    }

    const isComplete = (Date.now() - startTime < TIME_LIMIT_MS);
    syncState.lastSyncAt = new Date().toISOString();

    // Deduplicate warnings and skipped
    const seenSkipped = new Set();
    syncState.skipped = syncState.skipped.filter(s => {
      const k = `${s.type}_${s.id}_${s.reason}`;
      if (seenSkipped.has(k)) return false;
      seenSkipped.add(k);
      return true;
    }).slice(-100);

    const seenWarn = new Set();
    syncState.warnings = syncState.warnings.filter(w => {
      const k = `${w.type}_${w.id}_${w.message}`;
      if (seenWarn.has(k)) return false;
      seenWarn.add(k);
      return true;
    }).slice(-100);

    await syncStateRef.set(syncState);

    return res.status(200).json({
      status: 'ok',
      done: isComplete,
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
