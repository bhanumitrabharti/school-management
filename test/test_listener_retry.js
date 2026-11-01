/**
 * test_listener_retry.js
 *
 * Unit tests for Firestore listener retry resilience (v68 fix round):
 * - F1: Reset retry counters ONLY on server-confirmed snapshots (metadata.fromCache === false)
 *       Hard cap of at most 3 retries per listener per page session for attendance & fees.
 *       Teachers strictly forbidden from attaching fees listeners or retrying fees permission-denied.
 * - F2: Eliminate silent dead-ends in tenant retry catch block:
 *       Every path terminates in either a re-attached listener or logout (_failTenantSession).
 * - F3: Test coverage:
 *   a) cache snapshot -> permission-denied repeated -> stops after exactly 3 retries (tenant, attendance, fees).
 *   b) token refresh throws on attempt 1 -> attempt 2 still scheduled.
 *   c) server snapshot after denial -> counter resets.
 *   d) denial after 20s window -> immediate logout (tenant only); fees/attendance never log out.
 */

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const appPath = path.join(__dirname, '..', 'js', 'app.js');
let appCode = fs.readFileSync(appPath, 'utf8');

// Strip top-level ESM browser imports/exports for Node execution
appCode = appCode.replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];/g, '// import removed');
appCode = appCode.replace(/export\s+const\s+db\s*=\s*dbInstance;/, '// export db removed');
appCode = appCode.replace(/export\s+const\s+auth\s*=\s*authInst;/, '// export auth removed');

function createEnvironment() {
  let virtualTime = 1000000;
  let timerQueue = [];
  let timerId = 0;

  function fakeSetTimeout(fn, delay) {
    const id = ++timerId;
    timerQueue.push({ id, fn, triggerAt: virtualTime + (delay || 0) });
    return id;
  }

  function fakeClearTimeout(id) {
    timerQueue = timerQueue.filter(t => t.id !== id);
  }

  async function advanceTimers(ms) {
    virtualTime += ms;
    let iterations = 0;
    while (iterations < 100) {
      iterations++;
      const readyTimers = timerQueue.filter(t => t.triggerAt <= virtualTime);
      if (readyTimers.length === 0) break;
      readyTimers.sort((a, b) => a.triggerAt - b.triggerAt);
      const timer = readyTimers[0];
      timerQueue = timerQueue.filter(t => t.id !== timer.id);
      await timer.fn();
    }
  }

  const activeListeners = [];
  const stub = () => {};

  const mockFirestore = {
    doc: (db, ...parts) => ({ type: 'doc', path: parts.join('/') }),
    collection: (db, ...parts) => ({ type: 'collection', path: parts.join('/') }),
    onSnapshot: (targetRef, options, onNext, onError) => {
      let nextCb = onNext;
      let errCb = onError;
      if (typeof options === 'function') {
        nextCb = options;
        errCb = onNext;
      }
      const listenerObj = {
        ref: targetRef,
        onNext: nextCb,
        onError: errCb,
        unsubscribed: false
      };
      activeListeners.push(listenerObj);
      return () => {
        listenerObj.unsubscribed = true;
      };
    },
    getDoc: async (docRef) => ({
      exists: () => true,
      data: () => ({ schoolId: 'test_school' })
    })
  };

  let tokenRefreshShouldThrow = false;
  let tokenRefreshCount = 0;

  const mockAuth = {
    currentUser: {
      uid: 'user_test_123',
      getIdToken: async (force) => {
        tokenRefreshCount++;
        if (tokenRefreshShouldThrow) {
          throw new Error('Token refresh simulated failure');
        }
        return 'mock_token_' + tokenRefreshCount;
      }
    }
  };

  // Mock global Date with controlled virtual clock
  const OrigDate = Date;
  function MockDate(arg) {
    if (arg !== undefined) return new OrigDate(arg);
    return new OrigDate(virtualTime);
  }
  MockDate.now = () => virtualTime;
  MockDate.prototype = OrigDate.prototype;

  const sandbox = {
    window: {},
    document: {
      addEventListener: stub,
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => []
    },
    navigator: { userAgent: 'node', onLine: true },
    location: { search: '', pathname: '/' },
    localStorage: {
      getItem: (k) => (k === 'impersonate_school_id' ? 'test_school' : null),
      setItem: stub,
      removeItem: stub
    },
    sessionStorage: { getItem: () => null, setItem: stub, removeItem: stub },
    console: {
      log: () => {},
      warn: () => {},
      error: () => {},
      info: () => {}
    },
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
    setInterval: stub,
    clearInterval: stub,
    Date: MockDate,
    URLSearchParams: URLSearchParams,
    Array,
    Object,
    String,
    Number,
    Math,
    JSON,
    initializeApp: () => ({}),
    initializeFirestore: () => ({}),
    persistentLocalCache: () => ({}),
    persistentMultipleTabManager: () => ({}),
    getFirestore: () => ({}),
    connectFirestoreEmulator: stub,
    getAuth: () => mockAuth,
    connectAuthEmulator: stub,
    getStorage: () => ({}),
    doc: mockFirestore.doc,
    getDoc: mockFirestore.getDoc,
    getDocFromServer: mockFirestore.getDoc,
    setDoc: stub,
    updateDoc: stub,
    deleteDoc: stub,
    collection: mockFirestore.collection,
    getDocs: stub,
    onSnapshot: mockFirestore.onSnapshot,
    serverTimestamp: stub,
    FieldPath: stub,
    waitForPendingWrites: stub,
    terminate: stub,
    clearIndexedDbPersistence: stub,
    query: stub,
    where: stub,
    limit: stub,
    orderBy: stub,
    startAfter: stub,
    writeBatch: stub,
    deleteField: stub,
    arrayUnion: stub,
    runTransaction: stub,
    signInWithEmailAndPassword: stub,
    signOut: stub,
    setPersistence: stub,
    browserSessionPersistence: stub,
    ref: stub,
    uploadBytes: stub,
    getDownloadURL: stub,
    deleteObject: stub
  };

  sandbox.window = sandbox;
  sandbox.window.firestore = mockFirestore;
  sandbox.window.auth = mockAuth;
  sandbox.window.db = {};

  vm.createContext(sandbox);
  vm.runInContext(appCode, sandbox);

  const app = sandbox.window.SchoolApp;
  let loginPageCalls = 0;
  app.showLoginPage = function() {
    loginPageCalls++;
  };
  app.showToast = stub;
  app.showLoader = stub;
  app.hideLoader = stub;
  app.updateConnectionIndicator = stub;
  app.setupLoginButtonGate = stub;

  // Initialize store with restructured school
  app.store = {
    currentSchoolId: 'test_school',
    settings: { restructured: true }
  };
  app.currentUser = { role: 'admin' };
  app._lastAuthSuccessTimestamp = virtualTime;

  function getLatestListener(filterFn) {
    const matching = activeListeners.filter(l => !l.unsubscribed && (filterFn ? filterFn(l) : true));
    return matching[matching.length - 1];
  }

  return {
    app,
    sandbox,
    activeListeners,
    getLatestListener,
    advanceTimers,
    setVirtualTime: (t) => { virtualTime = t; },
    getVirtualTime: () => virtualTime,
    getLoginPageCalls: () => loginPageCalls,
    setTokenRefreshThrow: (val) => { tokenRefreshShouldThrow = val; },
    getTokenRefreshCount: () => tokenRefreshCount
  };
}

async function runAllTests() {
  console.log('================================================================');
  console.log('--- Running Listener Retry Resilience Unit Tests (v68) ---');
  console.log('================================================================');

  let totalTests = 0;
  let passedTests = 0;

  function recordPass(testName) {
    totalTests++;
    passedTests++;
    console.log(`[PASS] ${testName}`);
  }

  // =========================================================================
  // Test a: Cache snapshot -> permission-denied repeated -> stops after exactly 3 retries
  // =========================================================================
  console.log('\n--- Scenario A: Cache snapshot followed by permission-denied stops after 3 retries ---');
  {
    // A1: Tenant Root Listener
    const env = createEnvironment();
    let initPromiseResolved = false;
    let initResult = null;
    env.app.initTenantStore('test_school', true).then(res => {
      initPromiseResolved = true;
      initResult = res;
    });

    assert.strictEqual(env.activeListeners.length, 1, 'Initial tenant listener attached');
    let l1 = env.getLatestListener();

    // Cache snapshot arrives (fromCache: true)
    l1.onNext({ metadata: { fromCache: true }, exists: () => false, data: () => null });
    assert.strictEqual(env.app._tenantRetryCount || 0, 0, 'Retry counter not reset to 0 by cache snapshot');

    // Permission-denied error occurs -> schedules attempt 1
    l1.onError({ code: 'permission-denied' });
    assert.strictEqual(env.app._tenantRetryCount, 1, 'Attempt 1 scheduled, retryCount=1');
    assert.strictEqual(env.getLoginPageCalls(), 0, 'Not logged out yet on attempt 1');

    // Advance 1000ms -> attempt 1 runs
    await env.advanceTimers(1000);
    assert.strictEqual(env.activeListeners.length, 2, '2nd listener attached on attempt 1');
    let l2 = env.getLatestListener();

    // Cache snapshot arrives again
    l2.onNext({ metadata: { fromCache: true }, exists: () => false, data: () => null });
    assert.strictEqual(env.app._tenantRetryCount, 1, 'Counter NOT reset on cache snapshot');

    // Error again -> schedules attempt 2
    l2.onError({ code: 'permission-denied' });
    assert.strictEqual(env.app._tenantRetryCount, 2, 'Attempt 2 scheduled, retryCount=2');
    assert.strictEqual(env.getLoginPageCalls(), 0, 'Not logged out yet on attempt 2');

    // Advance 2000ms -> attempt 2 runs
    await env.advanceTimers(2000);
    assert.strictEqual(env.activeListeners.length, 3, '3rd listener attached on attempt 2');
    let l3 = env.getLatestListener();

    // Cache snapshot arrives again
    l3.onNext({ metadata: { fromCache: true }, exists: () => false, data: () => null });
    assert.strictEqual(env.app._tenantRetryCount, 2, 'Counter NOT reset on cache snapshot');

    // Error again -> schedules attempt 3
    l3.onError({ code: 'permission-denied' });
    assert.strictEqual(env.app._tenantRetryCount, 3, 'Attempt 3 scheduled, retryCount=3');
    assert.strictEqual(env.getLoginPageCalls(), 0, 'Not logged out yet on attempt 3');

    // Advance 4000ms -> attempt 3 runs
    await env.advanceTimers(4000);
    assert.strictEqual(env.activeListeners.length, 4, '4th listener attached on attempt 3');
    let l4 = env.getLatestListener();

    // Cache snapshot arrives again
    l4.onNext({ metadata: { fromCache: true }, exists: () => false, data: () => null });

    // Error again -> retryCount is 3, cannot retry anymore! Calls _failTenantSession
    l4.onError({ code: 'permission-denied' });
    assert.strictEqual(env.getLoginPageCalls(), 1, 'showLoginPage called after 3 retries exhausted');
    await Promise.resolve(); // flush microtask queue for promise resolution
    assert.strictEqual(initPromiseResolved, true, 'initTenantStore promise resolved');
    assert.strictEqual(initResult, false, 'initTenantStore resolved false on failure');

    // Advance time further: ensure no unbounded loop
    await env.advanceTimers(10000);
    assert.strictEqual(env.activeListeners.length, 4, 'No further listeners attached after failure');
    recordPass('A1: Tenant retry stops after exactly 3 retries and logs out');
  }

  {
    // A2: Attendance Listener
    const env = createEnvironment();
    const ym = '2026-11';
    env.app.listenToAttendanceMonth(ym);
    assert.strictEqual(env.activeListeners.length, 1, 'Initial attendance listener attached');

    // Initial listener: cache snapshot then error
    let l = env.getLatestListener();
    l.onNext({ metadata: { fromCache: true }, empty: true });
    l.onError({ code: 'permission-denied' });
    assert.strictEqual(env.app._attendanceRetryCounts[ym], 1, 'Attempt 1 count');

    // Advance 1s -> attempt 1
    await env.advanceTimers(1000);
    assert.strictEqual(env.activeListeners.length, 2, 'Attempt 1 re-attached listener');
    l = env.getLatestListener();
    l.onNext({ metadata: { fromCache: true }, empty: true });
    l.onError({ code: 'permission-denied' });
    assert.strictEqual(env.app._attendanceRetryCounts[ym], 2, 'Attempt 2 count');

    // Advance 2s -> attempt 2
    await env.advanceTimers(2000);
    assert.strictEqual(env.activeListeners.length, 3, 'Attempt 2 re-attached listener');
    l = env.getLatestListener();
    l.onNext({ metadata: { fromCache: true }, empty: true });
    l.onError({ code: 'permission-denied' });
    assert.strictEqual(env.app._attendanceRetryCounts[ym], 3, 'Attempt 3 count');

    // Advance 4s -> attempt 3 runs and hits session hard cap
    await env.advanceTimers(4000);
    assert.strictEqual(env.app._attendanceRetryCounts[ym], 3, 'Count reached 3 (hard cap)');

    await env.advanceTimers(10000);
    assert.strictEqual(env.activeListeners.length, 3, 'No further listeners attached beyond hard cap');
    assert.strictEqual(env.getLoginPageCalls(), 0, 'Attendance never calls showLoginPage');

    // Calling listenToAttendanceMonth again is blocked by session hard cap
    env.app.listenToAttendanceMonth(ym);
    assert.strictEqual(env.activeListeners.length, 3, 'Subsequent attach blocked by session hard cap');
    recordPass('A2: Attendance retry stops after exactly 3 retries (hard cap 3, no logout)');
  }

  {
    // A3: Fees Listener
    const env = createEnvironment();
    const yr = '2026';
    env.app.listenToFeesYear(yr);
    assert.strictEqual(env.activeListeners.length, 1, 'Initial fees listener attached');

    let l = env.getLatestListener();
    l.onNext({ metadata: { fromCache: true }, empty: true });
    l.onError({ code: 'permission-denied' });
    assert.strictEqual(env.app._feesRetryCounts[yr], 1, 'Attempt 1 count');

    await env.advanceTimers(1000);
    assert.strictEqual(env.activeListeners.length, 2, 'Attempt 1 re-attached listener');
    l = env.getLatestListener();
    l.onNext({ metadata: { fromCache: true }, empty: true });
    l.onError({ code: 'permission-denied' });
    assert.strictEqual(env.app._feesRetryCounts[yr], 2, 'Attempt 2 count');

    await env.advanceTimers(2000);
    assert.strictEqual(env.activeListeners.length, 3, 'Attempt 2 re-attached listener');
    l = env.getLatestListener();
    l.onNext({ metadata: { fromCache: true }, empty: true });
    l.onError({ code: 'permission-denied' });
    assert.strictEqual(env.app._feesRetryCounts[yr], 3, 'Attempt 3 count');

    // Advance 4s -> attempt 3 runs and hits hard cap of 3
    await env.advanceTimers(4000);
    assert.strictEqual(env.app._feesRetryCounts[yr], 3, 'Count reached 3 (hard cap)');

    await env.advanceTimers(10000);
    assert.strictEqual(env.activeListeners.length, 3, 'No further listeners attached beyond hard cap');
    assert.strictEqual(env.getLoginPageCalls(), 0, 'Fees never calls showLoginPage');

    // Hard cap blocks re-attach
    env.app.listenToFeesYear(yr);
    assert.strictEqual(env.activeListeners.length, 3, 'Subsequent attach blocked by hard cap');
    recordPass('A3: Fees retry stops after exactly 3 retries (hard cap 3, no logout)');
  }

  // =========================================================================
  // Test b: Token refresh throws on attempt 1 -> attempt 2 still scheduled
  // =========================================================================
  console.log('\n--- Scenario B: Token refresh throws on attempt 1 -> attempt 2 still scheduled ---');
  {
    // B1: Tenant
    const env = createEnvironment();
    env.app.initTenantStore('test_school', true);
    let l1 = env.getLatestListener();

    l1.onError({ code: 'permission-denied' });
    assert.strictEqual(env.app._tenantRetryCount, 1, 'Attempt 1 scheduled');

    // Force token refresh to reject on attempt 1
    env.setTokenRefreshThrow(true);

    // Advance 1000ms -> attempt 1 fails during token refresh
    await env.advanceTimers(1000);

    // Catch block must schedule attempt 2 (no dead-end)
    assert.strictEqual(env.app._tenantRetryCount, 2, 'Attempt 2 scheduled after attempt 1 catch block');
    assert.strictEqual(env.getLoginPageCalls(), 0, 'Not logged out yet');

    // Token refresh recovers on attempt 2
    env.setTokenRefreshThrow(false);
    await env.advanceTimers(2000);

    assert.strictEqual(env.activeListeners.length, 2, 'Attempt 2 successfully re-attached listener');
    recordPass('B1: Tenant token refresh throw on attempt 1 recovers to attempt 2');
  }

  {
    // B2: Attendance
    const env = createEnvironment();
    const ym = '2026-11';
    env.app.listenToAttendanceMonth(ym);
    let l1 = env.getLatestListener();

    l1.onError({ code: 'permission-denied' });
    assert.strictEqual(env.app._attendanceRetryCounts[ym], 1);

    env.setTokenRefreshThrow(true);
    await env.advanceTimers(1000);

    assert.strictEqual(env.app._attendanceRetryCounts[ym], 2, 'Attempt 2 scheduled after attempt 1 catch block');

    env.setTokenRefreshThrow(false);
    await env.advanceTimers(2000);
    assert.strictEqual(env.activeListeners.length, 2, 'Attempt 2 successfully re-attached listener');
    recordPass('B2: Attendance token refresh throw on attempt 1 recovers to attempt 2');
  }

  {
    // B3: Fees
    const env = createEnvironment();
    const yr = '2026';
    env.app.listenToFeesYear(yr);
    let l1 = env.getLatestListener();

    l1.onError({ code: 'permission-denied' });
    assert.strictEqual(env.app._feesRetryCounts[yr], 1);

    env.setTokenRefreshThrow(true);
    await env.advanceTimers(1000);

    assert.strictEqual(env.app._feesRetryCounts[yr], 2, 'Attempt 2 scheduled after attempt 1 catch block');

    env.setTokenRefreshThrow(false);
    await env.advanceTimers(2000);
    assert.strictEqual(env.activeListeners.length, 2, 'Attempt 2 successfully re-attached listener');
    recordPass('B3: Fees token refresh throw on attempt 1 recovers to attempt 2');
  }

  // =========================================================================
  // Test c: Server snapshot after denial -> counter resets
  // =========================================================================
  console.log('\n--- Scenario C: Server snapshot after denial resets retry counter ---');
  {
    // C1: Tenant
    const env = createEnvironment();
    env.app.initTenantStore('test_school', true);
    let l1 = env.getLatestListener();

    l1.onError({ code: 'permission-denied' });
    assert.strictEqual(env.app._tenantRetryCount, 1, 'Attempt 1 scheduled');

    await env.advanceTimers(1000);
    let l2 = env.getLatestListener();

    // Server snapshot arrives (fromCache: false)
    l2.onNext({
      metadata: { fromCache: false },
      exists: () => true,
      data: () => ({ settings: { schoolName: 'Test School' } })
    });

    assert.strictEqual(env.app._tenantRetryCount, 0, 'Retry counter successfully reset to 0 on server snapshot');
    recordPass('C1: Tenant server snapshot resets _tenantRetryCount to 0');
  }

  {
    // C2: Attendance
    const env = createEnvironment();
    const ym = '2026-11';
    env.app.listenToAttendanceMonth(ym);
    let l1 = env.getLatestListener();

    l1.onError({ code: 'permission-denied' });
    assert.strictEqual(env.app._attendanceRetryCounts[ym], 1);

    await env.advanceTimers(1000);
    let l2 = env.getLatestListener();

    // Server snapshot arrives (fromCache: false)
    l2.onNext({
      metadata: { fromCache: false },
      empty: false,
      forEach: () => {}
    });

    assert.strictEqual(env.app._attendanceRetryCounts[ym], 0, 'Attendance retry counter reset to 0 on server snapshot');
    recordPass('C2: Attendance server snapshot resets retry counter to 0');
  }

  {
    // C3: Fees
    const env = createEnvironment();
    const yr = '2026';
    env.app.listenToFeesYear(yr);
    let l1 = env.getLatestListener();

    l1.onError({ code: 'permission-denied' });
    assert.strictEqual(env.app._feesRetryCounts[yr], 1);

    await env.advanceTimers(1000);
    let l2 = env.getLatestListener();

    // Server snapshot arrives (fromCache: false)
    l2.onNext({
      metadata: { fromCache: false },
      empty: false,
      forEach: () => {}
    });

    assert.strictEqual(env.app._feesRetryCounts[yr], 0, 'Fees retry counter reset to 0 on server snapshot');
    recordPass('C3: Fees server snapshot resets retry counter to 0');
  }

  // =========================================================================
  // Test d: Denial after 20s window -> immediate logout (tenant only); fees/attendance never log out
  // =========================================================================
  console.log('\n--- Scenario D: Denial after 20s window & role restrictions ---');
  {
    // D1: Tenant denial after 20s auth window
    const env = createEnvironment();
    env.app._lastAuthSuccessTimestamp = env.getVirtualTime() - 25000; // 25s ago
    env.app.initTenantStore('test_school', true);
    let l1 = env.getLatestListener();

    l1.onError({ code: 'permission-denied' });

    assert.strictEqual(env.getLoginPageCalls(), 1, 'Immediate logout called when outside 20s window');
    assert.strictEqual(env.app._tenantRetryCount || 0, 0, 'No retry incremented');

    await env.advanceTimers(10000);
    assert.strictEqual(env.activeListeners.length, 1, 'No new listeners attached');
    recordPass('D1: Tenant denial outside 20s window triggers immediate logout (0 retries)');
  }

  {
    // D2: Attendance denial after 20s window
    const env = createEnvironment();
    env.app._lastAuthSuccessTimestamp = env.getVirtualTime() - 25000;
    const ym = '2026-11';
    env.app.listenToAttendanceMonth(ym);
    let l1 = env.getLatestListener();

    l1.onError({ code: 'permission-denied' });

    assert.strictEqual(env.getLoginPageCalls(), 0, 'Attendance never calls showLoginPage');
    assert.strictEqual(env.app._attendanceRetryCounts[ym], 1, 'Retry scheduled normally');

    await env.advanceTimers(1000);
    assert.strictEqual(env.activeListeners.length, 2, 'Attempt 1 listener re-attached');
    assert.strictEqual(env.getLoginPageCalls(), 0, 'Still never calls showLoginPage');
    recordPass('D2: Attendance denial after 20s window retries normally without logout');
  }

  {
    // D3: Fees denial after 20s window
    const env = createEnvironment();
    env.app._lastAuthSuccessTimestamp = env.getVirtualTime() - 25000;
    const yr = '2026';
    env.app.listenToFeesYear(yr);
    let l1 = env.getLatestListener();

    l1.onError({ code: 'permission-denied' });

    assert.strictEqual(env.getLoginPageCalls(), 0, 'Fees never calls showLoginPage');
    assert.strictEqual(env.app._feesRetryCounts[yr], 1, 'Retry scheduled normally');

    await env.advanceTimers(1000);
    assert.strictEqual(env.activeListeners.length, 2, 'Attempt 1 listener re-attached');
    assert.strictEqual(env.getLoginPageCalls(), 0, 'Still never calls showLoginPage');
    recordPass('D3: Fees denial after 20s window retries normally without logout');
  }

  {
    // D4: Fees listener strictly blocked for teacher role
    const env = createEnvironment();
    env.app.currentUser = { role: 'teacher' };
    assert.strictEqual(env.app.isTeacher(), true, 'Role is teacher');

    const yr = '2026';
    // 1. Initial call should immediately return without attaching listener
    env.app.listenToFeesYear(yr);
    assert.strictEqual(env.activeListeners.length, 0, 'Teacher cannot attach fees listener');
    assert.strictEqual(env.getLoginPageCalls(), 0, 'No logout');

    // 2. If somehow error handler is called for a teacher:
    env.app.currentUser = { role: 'admin' };
    env.app.listenToFeesYear('2025');
    assert.strictEqual(env.activeListeners.length, 1);
    let l = env.getLatestListener();

    env.app.currentUser = { role: 'teacher' };
    l.onError({ code: 'permission-denied' });

    assert.strictEqual(env.app._feesRetryCounts['2025'] || 0, 0, 'No retry scheduled when role is teacher');
    assert.strictEqual(env.getLoginPageCalls(), 0, 'No logout');

    await env.advanceTimers(10000);
    assert.strictEqual(env.activeListeners.length, 1, 'No new listeners attached');
    recordPass('D4: Fees listener strictly blocked for teacher role (immediate abort, no retry, no logout)');
  }

  console.log('\n================================================================');
  console.log(`ALL ${passedTests}/${totalTests} LISTENER RETRY TESTS PASSED!`);
  console.log('================================================================');
}

runAllTests().catch(err => {
  console.error('\n[FAIL] Test suite failed:', err);
  process.exit(1);
});
