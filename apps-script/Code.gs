/**
 * AI 팀보드 → 구글시트 실시간 쌓기
 * 1) 새 구글시트 › 확장 프로그램 › Apps Script 에 이 코드를 통째로 붙여넣고 저장
 * 2) 배포 › 새 배포 › 유형: 웹 앱 › 실행: 나 / 액세스: 모든 사용자 › 배포
 * 3) 나온 웹 앱 주소(https://script.google.com/macros/s/.../exec)를 앱 관리자 설정에 붙여넣기
 * ※ 아래 SECRET 은 앱이 자동으로 넣은 값입니다. 앱 관리자 화면의 «코드 복사»로 가져온 코드를 그대로 쓰세요.
 */
var SECRET = '__SHEET_SECRET__';
var TYPES = { tasks: true };
var ID_RE = /^[a-f0-9-]{36}$/;
var VERSION_HEADER = '버전';

function doPost(e) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return reply({ ok: false, error: 'busy' });
  try {
    var data = JSON.parse(e.postData.contents);
    var problem = validate(data);
    if (problem) return reply({ ok: false, error: problem });
    if (data.action === 'ping') return reply({ ok: true });
    var sheet = getSheet(data.type);
    if (data.action === 'upsert') upsert(sheet, data.headers, data.id, data.row, data.updatedAt);
    else if (data.action === 'delete') removeRow(sheet, data.id, data.updatedAt);
    else replaceAll(sheet, data.headers, data.rows);
    return reply({ ok: true });
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return reply({ ok: true, message: 'AI 팀보드 시트 연결이 준비되었습니다.' });
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- 요청 검증: 비밀값·형식이 맞지 않으면 시트를 건드리지 않는다 ---------- */

function validate(d) {
  if (!d || typeof d !== 'object') return 'bad request';
  if (SECRET.length < 32 || d.secret !== SECRET) return 'unauthorized';
  if (d.action === 'ping') return '';
  if (!TYPES[d.type]) return 'bad type';
  if (d.action === 'upsert') {
    return isId(d.id) && isText(d.updatedAt, 40) && isHeaders(d.headers) && isRow(d.row, d.id) ? '' : 'bad upsert';
  }
  if (d.action === 'delete') return isId(d.id) && isText(d.updatedAt, 40) ? '' : 'bad delete';
  if (d.action === 'replace_all') {
    if (!isHeaders(d.headers) || !Array.isArray(d.rows) || d.rows.length > 5000) return 'bad replace_all';
    for (var i = 0; i < d.rows.length; i++) if (!isRow(d.rows[i], d.rows[i] && d.rows[i].ID)) return 'bad row';
    return '';
  }
  return 'unknown action';
}

function isId(v) { return typeof v === 'string' && ID_RE.test(v); }
function isText(v, max) { return typeof v === 'string' && v.length <= max; }

function isHeaders(h) {
  if (!Array.isArray(h) || h.length < 1 || h.length > 30 || h[0] !== 'ID') return false;
  for (var i = 0; i < h.length; i++) if (!isText(h[i], 30)) return false;
  return true;
}

function isRow(row, id) {
  if (!row || typeof row !== 'object' || Array.isArray(row) || !isId(id) || row.ID !== id) return false;
  for (var k in row) if (!isText(row[k], 50000)) return false;
  return true;
}

/** = + - @ 탭 CR 로 시작하는 값은 수식이 되지 않도록 ' 를 붙여 텍스트로 저장한다. */
function safe(v) {
  var s = v === undefined || v === null ? '' : String(v);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

/* ---------- 시트 쓰기 ---------- */

function getSheet(name) {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  return book.getSheetByName(name) || book.insertSheet(name);
}

function ensureHeaders(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers.map(safe)]);
    sheet.setFrozenRows(1);
  }
}

function findRow(sheet, id) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

/** 버전(ISO 시각)은 날짜로 바뀌지 않도록 ' 를 붙여 텍스트로 둔다. */
function toValues(headers, row) {
  return headers.map(function (h) {
    var v = row[h] === undefined ? '' : row[h];
    return h === VERSION_HEADER && v ? "'" + v : safe(v);
  });
}

// ponytail: 지운 카드 ID 를 스크립트 속성에 남긴다(속성 한도 500KB ≈ 수천 건). 넘치면 시트 탭으로 옮길 것.
function isDeleted(id) {
  return PropertiesService.getScriptProperties().getProperty('del:' + id) !== null;
}

function upsert(sheet, headers, id, row, updatedAt) {
  if (isDeleted(id)) return; // 삭제 뒤 늦게 도착한 수정은 무시
  ensureHeaders(sheet, headers);
  var values = toValues(headers, row);
  var at = findRow(sheet, id);
  if (at === -1) {
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, values.length).setValues([values]);
    return;
  }
  var vcol = headers.indexOf(VERSION_HEADER);
  if (vcol !== -1) {
    var current = sheet.getRange(at, vcol + 1).getValue();
    if (typeof current === 'string' && current > updatedAt) return; // 시트가 더 최신 → 순서가 뒤바뀐 옛 수정
  }
  sheet.getRange(at, 1, 1, values.length).setValues([values]);
}

function removeRow(sheet, id, updatedAt) {
  PropertiesService.getScriptProperties().setProperty('del:' + id, updatedAt);
  var at = findRow(sheet, id);
  if (at !== -1) sheet.deleteRow(at);
}

function replaceAll(sheet, headers, rows) {
  sheet.clearContents();
  ensureHeaders(sheet, headers);
  if (rows.length) {
    var values = rows.map(function (r) { return toValues(headers, r); });
    sheet.getRange(2, 1, values.length, headers.length).setValues(values);
  }
}
