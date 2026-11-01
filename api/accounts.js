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
  { code: '13100', name: 'Staff Salary Advances', type: 'asset', isActive: true },
  { code: '22100', name: 'Employee PF Payable', type: 'liability', isActive: true },
  { code: '22110', name: 'Employer PF Contribution Payable', type: 'liability', isActive: true },
  { code: '22200', name: 'ESIC Payable', type: 'liability', isActive: true },
  { code: '22300', name: 'Professional Tax (PT) Payable', type: 'liability', isActive: true },
  { code: '22400', name: 'TDS on Salaries Payable', type: 'liability', isActive: true },
  { code: '22900', name: 'Other Payroll Deductions Payable', type: 'liability', isActive: true },
  { code: '31100', name: 'General / Corpus Reserve', type: 'equity', isActive: true },
  { code: '41100', name: 'Tuition Fees', type: 'income', isActive: true },
  { code: '41200', name: 'Admission & Registration Fees', type: 'income', isActive: true },
  { code: '41300', name: 'Examination Fees', type: 'income', isActive: true },
  { code: '41400', name: 'Annual / Development Charges', type: 'income', isActive: true },
  { code: '42100', name: 'Transport / Bus Charges', type: 'income', isActive: true },
  { code: '43100', name: 'Bank Interest Received', type: 'income', isActive: true },
  { code: '43200', name: 'Miscellaneous Receipts', type: 'income', isActive: true },
  { code: '51100', name: 'Teaching Staff Salaries', type: 'expense', isActive: true },
  { code: '51200', name: 'Non-Teaching & Admin Salaries', type: 'expense', isActive: true },
  { code: '51300', name: 'Employer EPF Contribution Expense', type: 'expense', isActive: true },
  { code: '51400', name: 'Employer ESIC Contribution Expense', type: 'expense', isActive: true },
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
    const isCashOrBank = /^(11100|11110|112\d\d)$/.test(String(feeDigitalAccount));
    if (!digAcc || digAcc.type !== 'asset' || digAcc.isActive === false || !isCashOrBank) {
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
  const unmappedHeads = [];

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
            unmappedHeads.push({ id: headId, name: alloc.feeHeadName || headId || 'Unknown Fee Head' });
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
      if (!feeHeadMapping[headId]) {
        unmappedHeads.push({ id: headId, name: txn.feeHeadName || headId || 'Unknown Fee Head' });
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
      if (!feeHeadMapping[headId]) {
        unmappedHeads.push({ id: headId, name: txn.feeHeadName || headId || 'Unknown Fee Head' });
      }
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
    isDigital: !isCash,
    narration: isReversal
      ? `Reversal: Fee Payment for Student ${txn.studentId || ''}`
      : `Fee Payment: Student ${txn.studentId || ''} (${txn.mode || 'Cash'})`,
    lines,
    warnings,
    unmappedHeads
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


function computeAdvanceJournalLines(adv, settings) {
  if (!adv || !adv.id) return null;
  const goLiveDate = settings && settings.goLiveDate;
  if (goLiveDate && adv.date && adv.date < goLiveDate) {
    return { ignored: true, ignoreType: 'beforeGoLive' };
  }
  const amountPaise = Number(adv.amountPaise) || 0;
  if (amountPaise <= 0) {
    return { skip: true, reason: 'Zero or invalid amount' };
  }
  const paidFrom = adv.paidFromAccountId || adv.paidFrom || '11100';

  const normalVoucher = {
    voucherId: `vch_adv_${adv.id}`,
    date: adv.date,
    financialYear: adv.financialYear || getFinancialYear(adv.date),
    sourceType: 'advance',
    sourceId: adv.id,
    narration: `Staff Advance: ${adv.employeeName || adv.employeeId || ''} (${adv.id})`.trim(),
    lines: [
      { accountId: '13100', debitPaise: amountPaise, creditPaise: 0 },
      { accountId: paidFrom, debitPaise: 0, creditPaise: amountPaise }
    ]
  };

  let cancelVoucher = null;
  if (adv.status === 'cancelled') {
    cancelVoucher = {
      voucherId: `vch_advcx_${adv.id}`,
      date: (adv.cancelledAt ? adv.cancelledAt.slice(0, 10) : adv.date),
      financialYear: adv.financialYear || getFinancialYear(adv.date),
      sourceType: 'advance_cancellation',
      sourceId: adv.id,
      narration: `Reversal of Staff Advance ${adv.id}: ${adv.cancelReason || 'Cancelled'}`,
      lines: [
        { accountId: paidFrom, debitPaise: amountPaise, creditPaise: 0 },
        { accountId: '13100', debitPaise: 0, creditPaise: amountPaise }
      ]
    };
  }

  return { normalVoucher, cancelVoucher };
}

function computeStatutoryPaymentJournalLines(stat, settings) {
  if (!stat || !stat.id) return null;
  const goLiveDate = settings && settings.goLiveDate;
  if (goLiveDate && stat.date && stat.date < goLiveDate) {
    return { ignored: true, ignoreType: 'beforeGoLive' };
  }
  const amountPaise = Number(stat.amountPaise) || 0;
  if (amountPaise <= 0) {
    return { skip: true, reason: 'Zero or invalid amount' };
  }
  const paidFrom = stat.paidFromAccountId || stat.paidFrom || '11200';
  const liabilityAccount = stat.liabilityAccount || '22100';

  const normalVoucher = {
    voucherId: `vch_stat_${stat.id}`,
    date: stat.date,
    financialYear: stat.financialYear || getFinancialYear(stat.date),
    sourceType: 'statutory_payment',
    sourceId: stat.id,
    narration: `Statutory Payment: A/c ${liabilityAccount} (${stat.id}) ${stat.challanRef ? 'Challan: ' + stat.challanRef : ''}`.trim(),
    lines: [
      { accountId: liabilityAccount, debitPaise: amountPaise, creditPaise: 0 },
      { accountId: paidFrom, debitPaise: 0, creditPaise: amountPaise }
    ]
  };

  let cancelVoucher = null;
  if (stat.status === 'cancelled') {
    cancelVoucher = {
      voucherId: `vch_statcx_${stat.id}`,
      date: (stat.cancelledAt ? stat.cancelledAt.slice(0, 10) : stat.date),
      financialYear: stat.financialYear || getFinancialYear(stat.date),
      sourceType: 'statutory_cancellation',
      sourceId: stat.id,
      narration: `Reversal of Statutory Payment ${stat.id}: ${stat.cancelReason || 'Cancelled'}`,
      lines: [
        { accountId: paidFrom, debitPaise: amountPaise, creditPaise: 0 },
        { accountId: liabilityAccount, debitPaise: 0, creditPaise: amountPaise }
      ]
    };
  }

  return { normalVoucher, cancelVoucher };
}

function computeEmployeeLine({
  employeeId,
  teacherId,
  employeeName,
  employeeType,
  designation,
  department,
  profile,
  inputs,
  settings,
  daysInMonth,
  workingDays,
  paidDays,
  lopAuto,
  lopDays,
  lopReason,
  empAdvances,
  priorRecoveredPaise,
  warnings
}) {
  const flags = [];

  if (!profile || profile.status === 'inactive') {
    flags.push('NO_PROFILE');
    warnings.push(`No active salary profile configured for ${employeeName} (${designation})`);
    return {
      employeeId,
      ...(teacherId ? { teacherId } : {}),
      employeeName,
      employeeType,
      designation,
      department,
      paymentMode: 'Bank',
      daysInMonth,
      workingDays,
      paidDays,
      lopAuto,
      lopDays,
      lopReason,
      payableDays: Math.max(0, paidDays - lopDays),
      grossPaise: 0,
      earnedGrossPaise: 0,
      basicPaise: 0,
      daPaise: 0,
      hraPaise: 0,
      earnedBasicPaise: 0,
      earnedDaPaise: 0,
      earnedHraPaise: 0,
      customAllowances: [],
      earnedAllowances: [],
      oneTimeAdditions: [],
      totalEarningsPaise: 0,
      pfWagesPaise: 0,
      employeePfPaise: 0,
      employerPfPaise: 0,
      employerEpsPaise: 0,
      employerEpfPaise: 0,
      pfAdminChargesPaise: 0,
      esiWagesPaise: 0,
      employeeEsiPaise: 0,
      employerEsiPaise: 0,
      ptPaise: 0,
      tdsPaise: 0,
      fixedDeductions: [],
      oneTimeDeductions: [],
      advanceRecoveryPaise: 0,
      otherDeductionsPaise: 0,
      totalDeductionsPaise: 0,
      netPayPaise: 0,
      flags
    };
  }

  const payableDays = Math.max(0, paidDays - lopDays);
  const basicPaise = Number(profile.basicPaise) || 0;
  const daPaise = Number(profile.daPaise) || 0;
  const hraPaise = Number(profile.hraPaise) || 0;
  const customAllowances = Array.isArray(profile.customAllowances) ? profile.customAllowances : [];

  let grossPaise = basicPaise + daPaise + hraPaise;
  customAllowances.forEach(a => { grossPaise += (Number(a.amountPaise) || 0); });

  // Proration
  const earnedBasicPaise = paidDays > 0 ? Math.round((basicPaise * payableDays) / paidDays) : 0;
  const earnedDaPaise = paidDays > 0 ? Math.round((daPaise * payableDays) / paidDays) : 0;
  const earnedHraPaise = paidDays > 0 ? Math.round((hraPaise * payableDays) / paidDays) : 0;
  const earnedAllowances = customAllowances.map(a => ({
    name: a.name,
    amountPaise: paidDays > 0 ? Math.round(((Number(a.amountPaise) || 0) * payableDays) / paidDays) : 0
  }));

  let earnedGrossPaise = earnedBasicPaise + earnedDaPaise + earnedHraPaise;
  earnedAllowances.forEach(a => { earnedGrossPaise += a.amountPaise; });

  // One-time additions (from inputs)
  const oneTimeAdditions = (inputs && Array.isArray(inputs.additions)) ? inputs.additions.map(a => ({
    name: a.name,
    amountPaise: Number(a.amountPaise) || 0
  })) : [];
  let totalAdditionsPaise = 0;
  oneTimeAdditions.forEach(a => { totalAdditionsPaise += a.amountPaise; });

  const totalEarningsPaise = earnedGrossPaise + totalAdditionsPaise;

  // ── Statutory Deductions ──

  // EPF / PF
  let pfWagesPaise = 0;
  let employeePfPaise = 0;
  let employerPfPaise = 0;
  let employerEpsPaise = 0;
  let employerEpfPaise = 0;
  let pfAdminChargesPaise = 0;

  if (settings.pfEnabled && profile.pfApplicable) {
    const pfWageBasis = earnedBasicPaise + earnedDaPaise;
    const pfCeiling = (typeof settings.pfWageCeilingPaise === 'number' && settings.pfWageCeilingPaise > 0)
      ? settings.pfWageCeilingPaise
      : 1500000;
    pfWagesPaise = Math.min(pfWageBasis, pfCeiling);

    const empPct = (typeof settings.pfEmployeePct === 'number') ? settings.pfEmployeePct : 12;
    const rawEmpPf = (pfWagesPaise * empPct) / 100;
    employeePfPaise = (settings.pfRounding === 'actual') ? Math.round(rawEmpPf) : Math.round(rawEmpPf / 100) * 100;

    const emprTotalPct = (typeof settings.pfEmployerPct === 'number') ? settings.pfEmployerPct : 12;
    const epsPct = (typeof settings.pfEmployerEpsPct === 'number') ? settings.pfEmployerEpsPct : 8.33;
    const epfPct = (typeof settings.pfEmployerEpfPct === 'number') ? settings.pfEmployerEpfPct : (emprTotalPct - epsPct);

    const rawEps = (pfWagesPaise * epsPct) / 100;
    const epsCeiling = (pfCeiling * epsPct) / 100;
    employerEpsPaise = (settings.pfRounding === 'actual') ? Math.round(Math.min(rawEps, epsCeiling)) : Math.round(Math.min(rawEps, epsCeiling) / 100) * 100;

    const rawEpf = (pfWagesPaise * epfPct) / 100;
    employerEpfPaise = (settings.pfRounding === 'actual') ? Math.round(rawEpf) : Math.round(rawEpf / 100) * 100;

    const adminPct = (Number(settings.pfAdminChargesPct) || 0) + (Number(settings.pfEdliPct) || 0);
    if (adminPct > 0) {
      const rawAdmin = (pfWagesPaise * adminPct) / 100;
      pfAdminChargesPaise = (settings.pfRounding === 'actual') ? Math.round(rawAdmin) : Math.round(rawAdmin / 100) * 100;
    }
    employerPfPaise = employerEpsPaise + employerEpfPaise + pfAdminChargesPaise;
  }

  // ESIC / ESI
  let esiWagesPaise = 0;
  let employeeEsiPaise = 0;
  let employerEsiPaise = 0;

  if (settings.esiEnabled && profile.esiApplicable) {
    const esiCeiling = (typeof settings.esiGrossCeilingPaise === 'number' && settings.esiGrossCeilingPaise > 0)
      ? settings.esiGrossCeilingPaise
      : 2100000;
    if (grossPaise <= esiCeiling) {
      esiWagesPaise = totalEarningsPaise;
      const empEsiPct = (typeof settings.esiEmployeePct === 'number') ? settings.esiEmployeePct : 0.75;
      const emprEsiPct = (typeof settings.esiEmployerPct === 'number') ? settings.esiEmployerPct : 3.25;

      const rawEmpEsi = (esiWagesPaise * empEsiPct) / 100;
      const rawEmprEsi = (esiWagesPaise * emprEsiPct) / 100;

      if (settings.esiRounding === 'actual') {
        employeeEsiPaise = Math.round(rawEmpEsi);
        employerEsiPaise = Math.round(rawEmprEsi);
      } else if (settings.esiRounding === 'nearest_rupee') {
        employeeEsiPaise = Math.round(rawEmpEsi / 100) * 100;
        employerEsiPaise = Math.round(rawEmprEsi / 100) * 100;
      } else {
        // 'higher_rupee' default
        employeeEsiPaise = Math.ceil(rawEmpEsi / 100) * 100;
        employerEsiPaise = Math.ceil(rawEmprEsi / 100) * 100;
      }
    }
  }

  // Professional Tax (PT)
  let ptPaise = 0;
  if (settings.ptEnabled && profile.ptApplicable) {
    const slabs = Array.isArray(settings.ptSlabs) ? settings.ptSlabs : [];
    for (const slab of slabs) {
      const min = Number(slab.minMonthlyGrossPaise) || 0;
      const max = (slab.maxMonthlyGrossPaise !== null && slab.maxMonthlyGrossPaise !== undefined) ? Number(slab.maxMonthlyGrossPaise) : Infinity;
      if (totalEarningsPaise >= min && totalEarningsPaise <= max) {
        ptPaise = Number(slab.ptPaise) || 0;
        break;
      }
    }
  }

  // TDS
  let tdsPaise = 0;
  if (inputs && typeof inputs.tdsPaise === 'number') {
    tdsPaise = Math.max(0, inputs.tdsPaise);
  } else {
    tdsPaise = Number(profile.monthlyTdsPaise) || 0;
  }

  // Advances Recovery
  let totalAdvanceGiven = 0;
  let plannedAdvanceRecovery = 0;
  (empAdvances || []).forEach(adv => {
    totalAdvanceGiven += (Number(adv.amountPaise) || 0);
    plannedAdvanceRecovery += (Number(adv.recoveryMonthlyPaise) || 0);
  });
  const outstandingAdvancePaise = Math.max(0, totalAdvanceGiven - priorRecoveredPaise);

  let targetRecoveryPaise = plannedAdvanceRecovery;
  if (inputs && typeof inputs.advanceRecoveryPaise === 'number') {
    targetRecoveryPaise = Math.max(0, inputs.advanceRecoveryPaise);
  }

  let advanceRecoveryPaise = Math.min(targetRecoveryPaise, outstandingAdvancePaise);
  if (targetRecoveryPaise > outstandingAdvancePaise && targetRecoveryPaise > 0) {
    flags.push('ADVANCE_RECOVERY_CAPPED');
  }

  // Fixed Deductions (from profile)
  const fixedDeductions = Array.isArray(profile.fixedDeductions) ? profile.fixedDeductions.map(d => ({
    name: d.name,
    amountPaise: Number(d.amountPaise) || 0
  })) : [];

  // One-time Deductions (from inputs)
  const oneTimeDeductions = (inputs && Array.isArray(inputs.deductions)) ? inputs.deductions.map(d => ({
    name: d.name,
    amountPaise: Number(d.amountPaise) || 0
  })) : [];

  let otherDeductionsPaise = 0;
  fixedDeductions.forEach(d => { otherDeductionsPaise += d.amountPaise; });
  oneTimeDeductions.forEach(d => { otherDeductionsPaise += d.amountPaise; });

  // Total Deductions
  const totalDeductionsPaise = employeePfPaise + employeeEsiPaise + ptPaise + tdsPaise + advanceRecoveryPaise + otherDeductionsPaise;

  // Net Pay
  const netPayPaise = totalEarningsPaise - totalDeductionsPaise;
  if (netPayPaise < 0) {
    flags.push('NEGATIVE_NET_PAY');
    warnings.push(`Negative net pay (₹${(netPayPaise / 100).toFixed(2)}) for ${employeeName} (${designation})`);
  }

  return {
    employeeId,
    ...(teacherId ? { teacherId } : {}),
    employeeName,
    employeeType,
    designation,
    department,
    paymentMode: profile.paymentMode || 'Bank',
    daysInMonth,
    workingDays,
    paidDays,
    lopAuto,
    lopDays,
    lopReason,
    payableDays,
    grossPaise,
    earnedGrossPaise,
    basicPaise,
    daPaise,
    hraPaise,
    earnedBasicPaise,
    earnedDaPaise,
    earnedHraPaise,
    customAllowances,
    earnedAllowances,
    oneTimeAdditions,
    totalEarningsPaise,
    pfWagesPaise,
    employeePfPaise,
    employerPfPaise,
    employerEpsPaise,
    employerEpfPaise,
    pfAdminChargesPaise,
    esiWagesPaise,
    employeeEsiPaise,
    employerEsiPaise,
    ptPaise,
    tdsPaise,
    fixedDeductions,
    oneTimeDeductions,
    advanceRecoveryPaise,
    otherDeductionsPaise,
    totalDeductionsPaise,
    netPayPaise,
    flags
  };
}

function calculatePayrollRun({
  month,
  staffList = [],
  teachersList = [],
  profilesMap = {},
  inputsDoc = {},
  settings = {},
  teacherAttendance = [],
  attendanceRequests = [],
  advancesList = [],
  paidPayslips = []
}) {
  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr, 10);
  const mon = parseInt(monthStr, 10);
  const daysInMonth = new Date(year, mon, 0).getDate();

  // Determine working days (excluding Sundays)
  let workingDaysInMonth = 0;
  const workingDates = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = `${yearStr}-${monthStr}-${String(d).padStart(2, '0')}`;
    const dateObj = new Date(year, mon - 1, d);
    if (dateObj.getDay() !== 0) {
      workingDaysInMonth++;
      workingDates.push(dStr);
    }
  }

  let paidDays = daysInMonth;
  if (settings.paidDaysBasis === '26') {
    paidDays = 26;
  } else if (settings.paidDaysBasis === '30') {
    paidDays = 30;
  }

  const teacherPunchesByDate = new Map();
  (teacherAttendance || []).forEach(p => {
    if (p && p.teacherId && p.date && p.date.startsWith(month) && p.type === 'in') {
      teacherPunchesByDate.set(`${p.teacherId}_${p.date}`, true);
    }
  });

  const approvedReqsByDate = new Map();
  (attendanceRequests || []).forEach(r => {
    const rDate = r.requestDate || r.date;
    const rStatus = (r.status || '').toLowerCase();
    if (r && r.teacherId && rDate && rDate.startsWith(month) && rStatus === 'approved') {
      approvedReqsByDate.set(`${r.teacherId}_${rDate}`, true);
    }
  });

  const priorRecoveriesByEmp = new Map();
  (paidPayslips || []).forEach(ps => {
    if (ps.status === 'paid' && ps.employeeId) {
      const prev = priorRecoveriesByEmp.get(ps.employeeId) || 0;
      priorRecoveriesByEmp.set(ps.employeeId, prev + (Number(ps.advanceRecoveryPaise) || 0));
    }
  });

  const advancesByEmp = new Map();
  (advancesList || []).forEach(adv => {
    if (adv.status !== 'cancelled' && adv.employeeId) {
      const list = advancesByEmp.get(adv.employeeId) || [];
      list.push(adv);
      advancesByEmp.set(adv.employeeId, list);
    }
  });

  const lines = [];
  const warnings = [];

  // 1. Teachers
  teachersList.forEach(t => {
    if (t.status !== 'Active') return;
    const employeeId = t.id;
    const empInputs = (inputsDoc && inputsDoc.employees && inputsDoc.employees[employeeId]) || {};
    if (empInputs.excluded === true) return;

    const profile = profilesMap[employeeId] || null;
    const employeeName = ((t.firstName || '') + ' ' + (t.lastName || '')).trim() || 'Teacher ' + employeeId;
    const designation = t.designation || 'Teacher';
    const department = t.subject || 'Teaching';

    let absentDaysCount = 0;
    const tJoinDate = t.joiningDate || t.joinDate;
    workingDates.forEach(dStr => {
      if (tJoinDate && dStr < tJoinDate) return;
      const hasPunch = teacherPunchesByDate.has(`${employeeId}_${dStr}`);
      const hasApprovedReq = approvedReqsByDate.has(`${employeeId}_${dStr}`);
      if (!hasPunch && !hasApprovedReq) {
        absentDaysCount++;
      }
    });

    const lopAuto = absentDaysCount;
    let lopDays = lopAuto;
    let lopReason = lopAuto > 0 ? 'Automated attendance absent days' : '';

    if (typeof empInputs.lopDaysOverride === 'number') {
      lopDays = Math.max(0, empInputs.lopDaysOverride);
      lopReason = empInputs.lopReason || 'Manual override';
    }

    const line = computeEmployeeLine({
      employeeId,
      teacherId: employeeId,
      employeeName,
      employeeType: 'teacher',
      designation,
      department,
      profile,
      inputs: empInputs,
      settings,
      daysInMonth,
      workingDays: workingDaysInMonth,
      paidDays,
      lopAuto,
      lopDays,
      lopReason,
      empAdvances: advancesByEmp.get(employeeId) || [],
      priorRecoveredPaise: priorRecoveriesByEmp.get(employeeId) || 0,
      warnings
    });
    lines.push(line);
  });

  // 2. Staff
  staffList.forEach(s => {
    if (s.status === 'Left') return;
    const employeeId = s.id;
    const empInputs = (inputsDoc && inputsDoc.employees && inputsDoc.employees[employeeId]) || {};
    if (empInputs.excluded === true) return;

    const profile = profilesMap[employeeId] || null;
    const employeeName = s.name || 'Staff ' + employeeId;
    const designation = s.designation || 'Staff';
    const department = s.department || 'Administration';

    const lopAuto = 0;
    let lopDays = 0;
    let lopReason = '';

    if (typeof empInputs.lopDaysOverride === 'number') {
      lopDays = Math.max(0, empInputs.lopDaysOverride);
      lopReason = empInputs.lopReason || 'Manual override';
    }

    const line = computeEmployeeLine({
      employeeId,
      employeeName,
      employeeType: 'staff',
      designation,
      department,
      profile,
      inputs: empInputs,
      settings,
      daysInMonth,
      workingDays: workingDaysInMonth,
      paidDays,
      lopAuto,
      lopDays,
      lopReason,
      empAdvances: advancesByEmp.get(employeeId) || [],
      priorRecoveredPaise: priorRecoveriesByEmp.get(employeeId) || 0,
      warnings
    });
    lines.push(line);
  });

  lines.sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  const totals = {
    headcount: lines.length,
    teacherGrossPaise: 0,
    staffGrossPaise: 0,
    totalGrossPaise: 0,
    employerPfPaise: 0,
    employerEsiPaise: 0,
    employeePfPaise: 0,
    esiPaise: 0,
    ptPaise: 0,
    tdsPaise: 0,
    advanceRecoveryPaise: 0,
    otherDeductionsPaise: 0,
    totalDeductionsPaise: 0,
    netPayPaise: 0,
    netBankPaise: 0,
    netCashPaise: 0
  };

  lines.forEach(l => {
    if (l.employeeType === 'teacher') {
      totals.teacherGrossPaise += l.totalEarningsPaise;
    } else {
      totals.staffGrossPaise += l.totalEarningsPaise;
    }
    totals.totalGrossPaise += l.totalEarningsPaise;
    totals.employerPfPaise += l.employerPfPaise;
    totals.employerEsiPaise += l.employerEsiPaise;
    totals.employeePfPaise += l.employeePfPaise;
    totals.esiPaise += (l.employeeEsiPaise + l.employerEsiPaise);
    totals.ptPaise += l.ptPaise;
    totals.tdsPaise += l.tdsPaise;
    totals.advanceRecoveryPaise += l.advanceRecoveryPaise;
    totals.otherDeductionsPaise += l.otherDeductionsPaise;
    totals.totalDeductionsPaise += l.totalDeductionsPaise;
    totals.netPayPaise += l.netPayPaise;
    if (l.paymentMode === 'Cash') {
      totals.netCashPaise += l.netPayPaise;
    } else {
      totals.netBankPaise += l.netPayPaise;
    }
  });

  return { lines, totals, warnings, paidDays, workingDays: workingDaysInMonth, daysInMonth };
}

function buildPayrollVoucher(month, lines, totals, settings, paidFrom) {
  const bankAccount = (paidFrom && paidFrom.bankAccount) || '11200';
  const cashAccount = (paidFrom && paidFrom.cashAccount) || '11100';
  const teacherExpenseAccount = (settings && settings.salaryExpenseAccounts && settings.salaryExpenseAccounts.teacher) || '51100';
  const staffExpenseAccount = (settings && settings.salaryExpenseAccounts && settings.salaryExpenseAccounts.staff) || '51200';

  const voucherLines = [];

  // Debits
  if (totals.teacherGrossPaise > 0) {
    voucherLines.push({ accountId: teacherExpenseAccount, debitPaise: totals.teacherGrossPaise, creditPaise: 0 });
  }
  if (totals.staffGrossPaise > 0) {
    voucherLines.push({ accountId: staffExpenseAccount, debitPaise: totals.staffGrossPaise, creditPaise: 0 });
  }
  if (totals.employerPfPaise > 0) {
    voucherLines.push({ accountId: '51300', debitPaise: totals.employerPfPaise, creditPaise: 0 });
  }
  if (totals.employerEsiPaise > 0) {
    voucherLines.push({ accountId: '51400', debitPaise: totals.employerEsiPaise, creditPaise: 0 });
  }

  // Credits
  if (totals.employeePfPaise > 0) {
    voucherLines.push({ accountId: '22100', debitPaise: 0, creditPaise: totals.employeePfPaise });
  }
  if (totals.employerPfPaise > 0) {
    voucherLines.push({ accountId: '22110', debitPaise: 0, creditPaise: totals.employerPfPaise });
  }
  if (totals.esiPaise > 0) {
    voucherLines.push({ accountId: '22200', debitPaise: 0, creditPaise: totals.esiPaise });
  }
  if (totals.ptPaise > 0) {
    voucherLines.push({ accountId: '22300', debitPaise: 0, creditPaise: totals.ptPaise });
  }
  if (totals.tdsPaise > 0) {
    voucherLines.push({ accountId: '22400', debitPaise: 0, creditPaise: totals.tdsPaise });
  }
  if (totals.advanceRecoveryPaise > 0) {
    voucherLines.push({ accountId: '13100', debitPaise: 0, creditPaise: totals.advanceRecoveryPaise });
  }
  if (totals.otherDeductionsPaise > 0) {
    voucherLines.push({ accountId: '22900', debitPaise: 0, creditPaise: totals.otherDeductionsPaise });
  }
  if (totals.netBankPaise > 0) {
    voucherLines.push({ accountId: bankAccount, debitPaise: 0, creditPaise: totals.netBankPaise });
  }
  if (totals.netCashPaise > 0) {
    voucherLines.push({ accountId: cashAccount, debitPaise: 0, creditPaise: totals.netCashPaise });
  }

  return {
    voucherId: `vch_pay_${month}`,
    date: (paidFrom && paidFrom.paidDate) || `${month}-01`,
    financialYear: getFinancialYear(`${month}-01`),
    sourceType: 'payroll',
    sourceId: month,
    narration: `Payroll Disbursement for ${month}: ${totals.headcount} employees`,
    lines: voucherLines
  };
}

function buildPayrollReversalVoucher(month, originalVoucher, reversalReason, reversalDate) {
  const revDate = reversalDate || new Date().toISOString().slice(0, 10);
  const revLines = (originalVoucher.lines || []).map(line => ({
    accountId: line.accountId,
    debitPaise: line.creditPaise,
    creditPaise: line.debitPaise
  }));

  return {
    voucherId: `vch_payrev_${month}`,
    date: revDate,
    financialYear: originalVoucher.financialYear || getFinancialYear(revDate),
    sourceType: 'payroll_reversal',
    sourceId: month,
    narration: `Reversal of Payroll ${month}: ${reversalReason || 'Reversed by admin'}`,
    lines: revLines
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
    return { newlyPosted: 0, postedVoucherIds: [], hasDigitalCommitted: false };
  }

  // 2. Process in chunks of up to 100 in ONE transaction per chunk
  const BATCH_SIZE = 100;
  let totalNewlyPosted = 0;
  const postedVoucherIds = [];
  let hasDigitalCommitted = false;

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
        if (v.isDigital) hasDigitalCommitted = true;
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

  return { newlyPosted: totalNewlyPosted, postedVoucherIds, hasDigitalCommitted };
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
      const unmappedFeeHeadsMap = new Map();

      // Step A: Process Fee Months
      const [startYearStr] = targetFY.split('-');
      const startYear = parseInt(startYearStr, 10);
      const endYear = startYear + 1;

      // F1: Helper to persist used settings and lock flags
      const ensureFeeSettingsPersisted = async () => {
        const updates = {};
        const fyStart = `${startYear}-04-01`;

        if (!settings.goLiveDate) {
          settings.goLiveDate = fyStart;
          updates.goLiveDate = fyStart;
        }
        if (!settings.feeCashAccount) {
          settings.feeCashAccount = '11100';
          updates.feeCashAccount = '11100';
        }
        if (!settings.hasFeeVouchers) {
          settings.hasFeeVouchers = true;
          updates.hasFeeVouchers = true;
        }

        if (Object.keys(updates).length > 0) {
          await settingsDoc.ref.set(updates, { merge: true });
        }
      };

      // F1: Backfill missing settings if fee vouchers were already posted in a prior sync
      if ((settings.hasFeeVouchers || (syncState.counts && syncState.counts.feesPosted > 0)) && (!settings.goLiveDate || !settings.feeCashAccount)) {
        const backfill = {};
        const fyStart = `${startYear}-04-01`;
        if (!settings.goLiveDate) {
          settings.goLiveDate = fyStart;
          backfill.goLiveDate = fyStart;
        }
        if (!settings.feeCashAccount) {
          settings.feeCashAccount = '11100';
          backfill.feeCashAccount = '11100';
        }
        await settingsDoc.ref.set(backfill, { merge: true });
      }

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
              if (res.unmappedHeads && res.unmappedHeads.length > 0) {
                res.unmappedHeads.forEach(h => {
                  unmappedFeeHeadsMap.set(h.id, h.name);
                });
              }
              candidateBatch.push(res);

              if (candidateBatch.length >= 100) {
                await ensureFeeSettingsPersisted();
                const batchRes = await postVouchersBatch(db, schoolId, candidateBatch, targetFY);
                const newlyPosted = batchRes.newlyPosted;
                newFeesPosted += newlyPosted;
                syncState.counts.feesPosted = (syncState.counts.feesPosted || 0) + newlyPosted;
                syncState.counts.vouchersTotal = (syncState.counts.vouchersTotal || 0) + newlyPosted;
                if (batchRes.hasDigitalCommitted && !settings.hasDigitalFeeVouchers) {
                  settings.hasDigitalFeeVouchers = true;
                  await settingsDoc.ref.set({ hasDigitalFeeVouchers: true }, { merge: true });
                }
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
          await ensureFeeSettingsPersisted();
          const batchRes = await postVouchersBatch(db, schoolId, candidateBatch, targetFY);
          const newlyPosted = batchRes.newlyPosted;
          newFeesPosted += newlyPosted;
          syncState.counts.feesPosted = (syncState.counts.feesPosted || 0) + newlyPosted;
          syncState.counts.vouchersTotal = (syncState.counts.vouchersTotal || 0) + newlyPosted;
          if (batchRes.hasDigitalCommitted && !settings.hasDigitalFeeVouchers) {
            settings.hasDigitalFeeVouchers = true;
            await settingsDoc.ref.set({ hasDigitalFeeVouchers: true }, { merge: true });
          }
          candidateBatch.length = 0;
        }

        // F1 CRITICAL: Mark monthDocUpdateTimes[mKey] ONLY when every txn was processed successfully
        if (monthAllProcessed && docUpdateMs) {
          syncState.monthDocUpdateTimes[mKey] = docUpdateMs;
        }
      }

      // F5: Show aggregated unmapped fee heads warning
      if (unmappedFeeHeadsMap.size > 0) {
        const names = Array.from(unmappedFeeHeadsMap.values());
        const count = names.length;
        const msg = `${count} fee head${count > 1 ? 's' : ''} not mapped: ${names.join(', ')}`;
        aggregatedWarnings.set('UNMAPPED_FEE_HEADS', { type: 'fee', message: msg });
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

      // Step F: Staff Advances
      let newAdvancesPosted = 0;
      if (Date.now() - startTime < TIME_LIMIT_MS) {
        const advSnaps = await db.collection(`tenant_data/${schoolId}/accounts_advances`)
          .where('financialYear', '==', targetFY)
          .get();

        const advBatch = [];
        for (const d of advSnaps.docs) {
          if (Date.now() - startTime > TIME_LIMIT_MS) break;
          const adv = d.data();
          adv.id = d.id;
          const resVch = computeAdvanceJournalLines(adv, settings);
          if (resVch && resVch.ignored) {
            if (resVch.ignoreType === 'beforeGoLive') syncState.counts.beforeGoLive = (syncState.counts.beforeGoLive || 0) + 1;
            continue;
          }
          if (resVch && resVch.skip) {
            syncState.skipped.push({ type: 'advance', id: adv.id, reason: resVch.reason });
            continue;
          }
          if (resVch && resVch.normalVoucher) advBatch.push(resVch.normalVoucher);
          if (resVch && resVch.cancelVoucher) advBatch.push(resVch.cancelVoucher);
        }

        if (advBatch.length > 0) {
          const { newlyPosted } = await postVouchersBatch(db, schoolId, advBatch, targetFY);
          newAdvancesPosted += newlyPosted;
          syncState.counts.advancesPosted = (syncState.counts.advancesPosted || 0) + newlyPosted;
          syncState.counts.vouchersTotal = (syncState.counts.vouchersTotal || 0) + newlyPosted;
        }
      }

      // Step G: Statutory Payments
      let newStatutoryPosted = 0;
      if (Date.now() - startTime < TIME_LIMIT_MS) {
        const statSnaps = await db.collection(`tenant_data/${schoolId}/accounts_statutory_payments`)
          .where('financialYear', '==', targetFY)
          .get();

        const statBatch = [];
        for (const d of statSnaps.docs) {
          if (Date.now() - startTime > TIME_LIMIT_MS) break;
          const stat = d.data();
          stat.id = d.id;
          const resVch = computeStatutoryPaymentJournalLines(stat, settings);
          if (resVch && resVch.ignored) {
            if (resVch.ignoreType === 'beforeGoLive') syncState.counts.beforeGoLive = (syncState.counts.beforeGoLive || 0) + 1;
            continue;
          }
          if (resVch && resVch.skip) {
            syncState.skipped.push({ type: 'statutory', id: stat.id, reason: resVch.reason });
            continue;
          }
          if (resVch && resVch.normalVoucher) statBatch.push(resVch.normalVoucher);
          if (resVch && resVch.cancelVoucher) statBatch.push(resVch.cancelVoucher);
        }

        if (statBatch.length > 0) {
          const { newlyPosted } = await postVouchersBatch(db, schoolId, statBatch, targetFY);
          newStatutoryPosted += newlyPosted;
          syncState.counts.statutoryPosted = (syncState.counts.statutoryPosted || 0) + newlyPosted;
          syncState.counts.vouchersTotal = (syncState.counts.vouchersTotal || 0) + newlyPosted;
        }
      }

      // F1: Lock settings once any fee voucher exists
      if (syncState.counts.feesPosted > 0 && !settings.hasFeeVouchers) {
        await ensureFeeSettingsPersisted();
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
          opening: newOpeningPosted,
          advances: typeof newAdvancesPosted !== 'undefined' ? newAdvancesPosted : 0,
          statutory: typeof newStatutoryPosted !== 'undefined' ? newStatutoryPosted : 0
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

  
  // ── Action: payroll-calc ───────────────────────────────────────────────────
  if (action === 'payroll-calc') {
    const month = (req.body && req.body.month) || (req.query && req.query.month);
    if (!month || !/^[0-9]{4}-[0-9]{2}$/.test(month)) {
      return res.status(400).json({ error: "A valid 'month' parameter (YYYY-MM) is required." });
    }

    const runRef = db.doc(`tenant_data/${schoolId}/payroll_runs/${month}`);
    const runSnap = await runRef.get();
    if (runSnap.exists) {
      const currentStatus = runSnap.data().status;
      if (currentStatus === 'approved' || currentStatus === 'paid') {
        return res.status(400).json({ error: `Cannot recalculate run in '${currentStatus}' status. Please reopen first.` });
      }
    }

    // 1. Fetch Root Doc for Teachers, teacherAttendance, attendanceRequests
    const rootDocRef = db.doc(`tenant_data/${schoolId}`);
    const rootSnap = await rootDocRef.get();
    const rootData = rootSnap.exists ? rootSnap.data() : {};
    const teachersList = Array.isArray(rootData.teachers) ? rootData.teachers : [];
    const teacherAttendance = Array.isArray(rootData.teacherAttendance) ? rootData.teacherAttendance : [];
    const attendanceRequests = Array.isArray(rootData.attendanceRequests) ? rootData.attendanceRequests : (Array.isArray(rootData.teacherCorrectionRequests) ? rootData.teacherCorrectionRequests : []);

    // 2. Fetch Staff
    const staffSnaps = await db.collection(`tenant_data/${schoolId}/staff`).get();
    const staffList = [];
    staffSnaps.forEach(d => {
      const s = d.data();
      s.id = d.id;
      staffList.push(s);
    });

    // 3. Fetch Payroll Profiles
    const profileSnaps = await db.collection(`tenant_data/${schoolId}/payroll_profiles`).get();
    const profilesMap = {};
    profileSnaps.forEach(d => {
      profilesMap[d.id] = d.data();
    });

    // 4. Fetch Payroll Inputs
    const inputSnap = await db.doc(`tenant_data/${schoolId}/payroll_inputs/${month}`).get();
    const inputsDoc = inputSnap.exists ? inputSnap.data() : {};

    // 5. Fetch Payroll Settings
    const setSnap = await db.doc(`tenant_data/${schoolId}/payroll_settings/main`).get();
    const payrollSettings = setSnap.exists ? setSnap.data() : {
      pfEnabled: false,
      pfEmployeePct: 12,
      pfEmployerPct: 12,
      pfWageCeilingPaise: 1500000,
      pfEmployerEpsPct: 8.33,
      pfEmployerEpfPct: 3.67,
      pfAdminChargesPct: 0.5,
      pfEdliPct: 0.5,
      pfRounding: 'nearest_rupee',
      esiEnabled: false,
      esiEmployeePct: 0.75,
      esiEmployerPct: 3.25,
      esiGrossCeilingPaise: 2100000,
      esiRounding: 'higher_rupee',
      ptEnabled: false,
      ptState: 'Jharkhand',
      ptSlabs: [
        { minMonthlyGrossPaise: 0, maxMonthlyGrossPaise: 2500000, ptPaise: 0 },
        { minMonthlyGrossPaise: 2500001, maxMonthlyGrossPaise: 4166600, ptPaise: 10000 },
        { minMonthlyGrossPaise: 4166601, maxMonthlyGrossPaise: 6666600, ptPaise: 15000 },
        { minMonthlyGrossPaise: 6666601, maxMonthlyGrossPaise: 8333300, ptPaise: 17500 },
        { minMonthlyGrossPaise: 8333301, maxMonthlyGrossPaise: null, ptPaise: 20800 }
      ],
      paidDaysBasis: 'calendar',
      salaryExpenseAccounts: { teacher: '51100', staff: '51200' }
    };

    // 6. Fetch Active Staff Advances
    const advSnaps = await db.collection(`tenant_data/${schoolId}/accounts_advances`).get();
    const advancesList = [];
    advSnaps.forEach(d => {
      const adv = d.data();
      adv.id = d.id;
      advancesList.push(adv);
    });

    // 7. Fetch Paid Payslips for Prior Recovery Calculation
    const payslipSnaps = await db.collection(`tenant_data/${schoolId}/payroll_payslips`)
      .where('status', '==', 'paid')
      .get();
    const paidPayslips = [];
    payslipSnaps.forEach(d => {
      paidPayslips.push(d.data());
    });

    // Perform Calculation
    const calcResult = calculatePayrollRun({
      month,
      staffList,
      teachersList,
      profilesMap,
      inputsDoc,
      settings: payrollSettings,
      teacherAttendance,
      attendanceRequests,
      advancesList,
      paidPayslips
    });

    const nowISO = new Date().toISOString();
    const runDocData = {
      month,
      financialYear: getFinancialYear(`${month}-01`),
      status: 'draft',
      calculatedAt: nowISO,
      calculatedBy: uid,
      approvedAt: null,
      approvedBy: null,
      paidAt: null,
      paidBy: null,
      paidFrom: null,
      voucherIds: [],
      totals: calcResult.totals,
      warnings: calcResult.warnings,
      paidDays: calcResult.paidDays,
      workingDays: calcResult.workingDays,
      daysInMonth: calcResult.daysInMonth
    };

    // Write runDoc and lines
    await runRef.set(runDocData);

    // Write lines in subcollection
    const linesCollection = db.collection(`tenant_data/${schoolId}/payroll_runs/${month}/lines`);
    // Delete existing lines if any (e.g. from recalculation)
    const oldLines = await linesCollection.get();
    const batch = db.batch();
    oldLines.forEach(d => { batch.delete(d.ref); });
    calcResult.lines.forEach(line => {
      const lineRef = linesCollection.doc(line.employeeId);
      batch.set(lineRef, line);
    });
    await batch.commit();

    return res.status(200).json({
      status: 'ok',
      month,
      run: runDocData,
      lines: calcResult.lines,
      warnings: calcResult.warnings
    });
  }

  // ── Action: payroll-approve ────────────────────────────────────────────────
  if (action === 'payroll-approve') {
    const month = (req.body && req.body.month) || (req.query && req.query.month);
    if (!month || !/^[0-9]{4}-[0-9]{2}$/.test(month)) {
      return res.status(400).json({ error: "A valid 'month' parameter (YYYY-MM) is required." });
    }

    const runRef = db.doc(`tenant_data/${schoolId}/payroll_runs/${month}`);
    const runSnap = await runRef.get();
    if (!runSnap.exists) {
      return res.status(404).json({ error: `No payroll run found for month ${month}. Calculate draft first.` });
    }
    const runData = runSnap.data();
    if (runData.status !== 'draft') {
      return res.status(400).json({ error: `Cannot approve payroll run in '${runData.status}' status. Must be draft.` });
    }

    const nowISO = new Date().toISOString();
    const update = {
      status: 'approved',
      approvedAt: nowISO,
      approvedBy: uid
    };
    await runRef.set(update, { merge: true });

    return res.status(200).json({
      status: 'ok',
      month,
      run: { ...runData, ...update }
    });
  }

  // ── Action: payroll-reopen ─────────────────────────────────────────────────
  if (action === 'payroll-reopen') {
    const month = (req.body && req.body.month) || (req.query && req.query.month);
    if (!month || !/^[0-9]{4}-[0-9]{2}$/.test(month)) {
      return res.status(400).json({ error: "A valid 'month' parameter (YYYY-MM) is required." });
    }

    const runRef = db.doc(`tenant_data/${schoolId}/payroll_runs/${month}`);
    const runSnap = await runRef.get();
    if (!runSnap.exists) {
      return res.status(404).json({ error: `No payroll run found for month ${month}.` });
    }
    const runData = runSnap.data();
    if (runData.status !== 'approved') {
      return res.status(400).json({ error: `Cannot reopen payroll run in '${runData.status}' status. Only approved runs can be reopened.` });
    }

    const update = {
      status: 'draft',
      approvedAt: null,
      approvedBy: null
    };
    await runRef.set(update, { merge: true });

    return res.status(200).json({
      status: 'ok',
      month,
      run: { ...runData, ...update }
    });
  }

  // ── Action: payroll-pay ────────────────────────────────────────────────────
  if (action === 'payroll-pay') {
    const month = (req.body && req.body.month) || (req.query && req.query.month);
    const paidDate = (req.body && req.body.paidDate) || new Date().toISOString().slice(0, 10);
    const bankAccount = (req.body && req.body.bankAccount) || '11200';
    const cashAccount = (req.body && req.body.cashAccount) || '11100';

    if (!month || !/^[0-9]{4}-[0-9]{2}$/.test(month)) {
      return res.status(400).json({ error: "A valid 'month' parameter (YYYY-MM) is required." });
    }

    const runRef = db.doc(`tenant_data/${schoolId}/payroll_runs/${month}`);
    const runSnap = await runRef.get();
    if (!runSnap.exists) {
      return res.status(404).json({ error: `No payroll run found for month ${month}.` });
    }
    const runData = runSnap.data();
    if (runData.status !== 'approved') {
      return res.status(400).json({ error: `Cannot pay run in '${runData.status}' status. Run must be approved.` });
    }

    // Load lines
    const lineSnaps = await db.collection(`tenant_data/${schoolId}/payroll_runs/${month}/lines`).get();
    const lines = [];
    lineSnaps.forEach(d => { lines.push(d.data()); });

    // Load Payroll Settings for account mappings
    const setSnap = await db.doc(`tenant_data/${schoolId}/payroll_settings/main`).get();
    const payrollSettings = setSnap.exists ? setSnap.data() : {};

    // 1. Build and post balanced voucher
    const targetFY = runData.financialYear || getFinancialYear(`${month}-01`);
    const voucher = buildPayrollVoucher(month, lines, runData.totals, payrollSettings, {
      bankAccount,
      cashAccount,
      paidDate
    });

    const postRes = await postVouchersBatch(db, schoolId, [voucher], targetFY);

    // 2. Write payslips
    const payslipBatch = db.batch();
    const nowISO = new Date().toISOString();
    lines.forEach(line => {
      const payslipId = `PAY_${month}_${line.employeeId}`;
      const payslipRef = db.doc(`tenant_data/${schoolId}/payroll_payslips/${payslipId}`);
      const payslipData = {
        id: payslipId,
        month,
        employeeId: line.employeeId,
        ...(line.teacherId ? { teacherId: line.teacherId } : {}),
        employeeName: line.employeeName,
        employeeType: line.employeeType,
        designation: line.designation,
        department: line.department,
        paymentMode: line.paymentMode,
        paidDate,
        status: 'paid',
        daysInMonth: line.daysInMonth,
        workingDays: line.workingDays,
        paidDays: line.paidDays,
        lopDays: line.lopDays,
        payableDays: line.payableDays,
        earnings: {
          basicPaise: line.earnedBasicPaise,
          daPaise: line.earnedDaPaise,
          hraPaise: line.earnedHraPaise,
          allowances: line.earnedAllowances || [],
          oneTimeAdditions: line.oneTimeAdditions || [],
          totalEarningsPaise: line.totalEarningsPaise
        },
        deductions: {
          employeePfPaise: line.employeePfPaise,
          employeeEsiPaise: line.employeeEsiPaise,
          ptPaise: line.ptPaise,
          tdsPaise: line.tdsPaise,
          advanceRecoveryPaise: line.advanceRecoveryPaise,
          fixedDeductions: line.fixedDeductions || [],
          oneTimeDeductions: line.oneTimeDeductions || [],
          totalDeductionsPaise: line.totalDeductionsPaise
        },
        employerContributions: {
          pfPaise: line.employerPfPaise,
          esiPaise: line.employerEsiPaise
        },
        netPayPaise: line.netPayPaise,
        voucherId: voucher.voucherId,
        createdAt: nowISO
      };
      payslipBatch.set(payslipRef, payslipData);
    });
    await payslipBatch.commit();

    // 3. Update Run Status
    const update = {
      status: 'paid',
      paidAt: nowISO,
      paidBy: uid,
      paidFrom: { bankAccount, cashAccount, paidDate },
      voucherIds: [voucher.voucherId]
    };
    await runRef.set(update, { merge: true });

    return res.status(200).json({
      status: 'ok',
      month,
      run: { ...runData, ...update },
      voucherId: voucher.voucherId,
      newlyPosted: postRes.newlyPosted
    });
  }

  // ── Action: payroll-reverse ────────────────────────────────────────────────
  if (action === 'payroll-reverse') {
    const month = (req.body && req.body.month) || (req.query && req.query.month);
    const reason = (req.body && req.body.reason) || 'Reversed by admin';
    const confirmText = (req.body && req.body.confirmText) || '';

    if (confirmText !== 'REVERSE') {
      return res.status(400).json({ error: "Reversal requires explicit confirmation. Please pass confirmText: 'REVERSE'." });
    }
    if (!month || !/^[0-9]{4}-[0-9]{2}$/.test(month)) {
      return res.status(400).json({ error: "A valid 'month' parameter (YYYY-MM) is required." });
    }

    const runRef = db.doc(`tenant_data/${schoolId}/payroll_runs/${month}`);
    const runSnap = await runRef.get();
    if (!runSnap.exists) {
      return res.status(404).json({ error: `No payroll run found for month ${month}.` });
    }
    const runData = runSnap.data();
    if (runData.status !== 'paid') {
      return res.status(400).json({ error: `Cannot reverse run in '${runData.status}' status. Only paid runs can be reversed.` });
    }

    const voucherId = `vch_pay_${month}`;
    const vchRef = db.doc(`tenant_data/${schoolId}/accounts_journal/${voucherId}`);
    const vchSnap = await vchRef.get();
    if (!vchSnap.exists) {
      return res.status(404).json({ error: `Original payroll voucher '${voucherId}' not found in journal.` });
    }
    const originalVoucher = vchSnap.data();

    // 1. Build and post reversal mirror voucher
    const targetFY = runData.financialYear || getFinancialYear(`${month}-01`);
    const revVoucher = buildPayrollReversalVoucher(month, originalVoucher, reason);
    const postRes = await postVouchersBatch(db, schoolId, [revVoucher], targetFY);

    // 2. Void Payslips
    const payslips = await db.collection(`tenant_data/${schoolId}/payroll_payslips`)
      .where('month', '==', month)
      .get();
    const voidBatch = db.batch();
    const nowISO = new Date().toISOString();
    payslips.forEach(d => {
      voidBatch.set(d.ref, {
        status: 'void',
        voidedAt: nowISO,
        voidedBy: uid,
        voidReason: reason
      }, { merge: true });
    });
    await voidBatch.commit();

    // 3. Update Run Status
    const existingVouchers = Array.isArray(runData.voucherIds) ? runData.voucherIds : [voucherId];
    const update = {
      status: 'reversed',
      reversalReason: reason,
      reversedAt: nowISO,
      reversedBy: uid,
      voucherIds: Array.from(new Set([...existingVouchers, revVoucher.voucherId]))
    };
    await runRef.set(update, { merge: true });

    return res.status(200).json({
      status: 'ok',
      month,
      run: { ...runData, ...update },
      reverseVoucherId: revVoucher.voucherId,
      newlyPosted: postRes.newlyPosted
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
module.exports.postVouchersBatch = postVouchersBatch;
module.exports.computeAdvanceJournalLines = computeAdvanceJournalLines;
module.exports.computeStatutoryPaymentJournalLines = computeStatutoryPaymentJournalLines;
module.exports.computeEmployeeLine = computeEmployeeLine;
module.exports.calculatePayrollRun = calculatePayrollRun;
module.exports.buildPayrollVoucher = buildPayrollVoucher;
module.exports.buildPayrollReversalVoucher = buildPayrollReversalVoucher;

