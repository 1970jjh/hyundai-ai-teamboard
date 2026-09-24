/**
 * AI 팀보드 → 구글시트 실시간 쌓기
 * 1) 새 구글시트 › 확장 프로그램 › Apps Script 에 이 코드를 통째로 붙여넣고 저장
 * 2) 배포 › 새 배포 › 유형: 웹 앱 › 실행: 나 / 액세스: 모든 사용자 › 배포
 * 3) 나온 웹 앱 주소(https://script.google.com/macros/s/.../exec)를 앱 관리자 설정에 붙여넣기
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.action === 'ping') return reply({ ok: true });
    var sheet = getSheet(String(data.type || 'tasks'));
    if (data.action === 'upsert') upsert(sheet, data.headers, data.id, data.row);
    else if (data.action === 'delete') removeRow(sheet, data.id);
    else if (data.action === 'replace_all') replaceAll(sheet, data.headers, data.rows);
    else return reply({ ok: false, error: 'unknown action' });
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

function getSheet(name) {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  return book.getSheetByName(name) || book.insertSheet(name);
}

function ensureHeaders(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
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

function toValues(headers, row) {
  return headers.map(function (h) { return row[h] === undefined ? '' : row[h]; });
}

function upsert(sheet, headers, id, row) {
  ensureHeaders(sheet, headers);
  var values = toValues(headers, row);
  var at = findRow(sheet, id);
  if (at === -1) sheet.appendRow(values);
  else sheet.getRange(at, 1, 1, values.length).setValues([values]);
}

function removeRow(sheet, id) {
  var at = findRow(sheet, id);
  if (at !== -1) sheet.deleteRow(at);
}

function replaceAll(sheet, headers, rows) {
  sheet.clearContents();
  sheet.appendRow(headers);
  sheet.setFrozenRows(1);
  if (rows.length) {
    var values = rows.map(function (r) { return toValues(headers, r); });
    sheet.getRange(2, 1, values.length, headers.length).setValues(values);
  }
}
