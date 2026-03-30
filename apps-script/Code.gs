const SPREADSHEET_ID = '1enSJlvIlkzV7c-1mkatMeSrTERFmB3czo3c3iSSAJlE';
const GURU_PASSWORD = 'myHadir1234';
const API_TOKEN = 'myhadir-token-2026';
const SHEET_NAME = 'Kehadiran';
const META_HEADERS = ['Nama', 'Kelas', 'Masa Akhir', 'Sumber Akhir', 'Kemaskini ISO'];
const API_CACHE_PREFIX = 'kehadiran:';
const API_CACHE_TTL_SEC = 60;
const CLASS_SPREADSHEETS = {
  '5 PVMA': '1uvg1CtZG8vM_afe2FFIlIXDCGFqAiHC3mM3-_zNSX6Q',
  '5 J': '1lSGvyWTxKreBf1-QNwNfLDLNJsmgDut-d9vITIFAOBY',
  '5 I': '1ohfS3OX2BYKvzm0eUGMB5vVDqjmuMqsZOr1GqRTocWQ',
  '5 H': '1enSJlvIlkzV7c-1mkatMeSrTERFmB3czo3c3iSSAJlE',
  '5 G': '1_PQ3zx_GHP1jJAlSocIQ_JJ8BZje7gH5rK77pJLZadQ',
  '5 D': '1EYvfHcEp1HXsyhIdb0i9Y4Bnr30IIMIKMs6S61CdUpg',
  '5 C': '1xz6SDuH0PUubFT2_J7gblaTLEs_--BkbHcRB7_7GmoU',
  '5 B': '1_0vk2QFHmrZs4zE2muYT_N9C8xsEto5IySB67hR3Q7I',
  '5 A': '1O1tElI85Hc_5vxykXPCno8H5fMdbtx31BQPxJ-DLPkk'
};

function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    if (!tokenValid_(params)) {
      const access = semakAkses_();
      if (!access.allowed) {
        return jsonOutput({
          success: false,
          message: access.message
        }, params);
      }
    }

    const tarikh = normalTarikh(params.tarikh || '');
    const rows = ambilRekodKehadiranDenganCache(tarikh);
    return jsonOutput({
      success: true,
      tarikh: tarikh || '',
      data: rows
    }, params);
  } catch (err) {
    return jsonOutput({
      success: false,
      message: err && err.message ? err.message : 'Ralat doGet'
    }, e && e.parameter);
  }
}
function semakAkses_() {
  const email = getUserEmail_();
  const role = getUserRole_(email);
  if (role === 'guru') return { allowed: true };
  if (role === 'murid') return { allowed: false, message: 'Akses API disekat (murid).' };
  return { allowed: false, message: 'Log masuk guru diperlukan.' };
}

function tokenValid_(params) {
  const token = String((params && params.token) || '').trim();
  return token && token === API_TOKEN;
}

function getUserEmail_() {
  return String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
}

function getUserRole_(email) {
  const userEmail = String(email || '').trim().toLowerCase();
  if (!userEmail) return 'unknown';
  if (userEmail.indexOf('g-') === 0) return 'guru';
  if (userEmail.indexOf('m-') === 0) return 'murid';
  return 'other';
}
function doPost(e) {
  try {
    const payload = bacaJsonBody(e);
    if (!payload || payload.action !== 'manual') {
      throw new Error('Action tidak disokong.');
    }

    if (String(payload.password || '').trim() !== GURU_PASSWORD) {
      throw new Error('Kata laluan guru tidak sah.');
    }

    const nama = String(payload.nama || '').trim();
    const kelas = normalKelas(payload.kelas || '');
    const status = normalStatus(payload.status || '');
    const tarikh = normalTarikh(payload.tarikh || payload.tarikh_iso || '');
    const masa = String(payload.masa || '').trim();
    const sumber = String(payload.sumber || 'manual_guru').trim();
    const kemaskiniIso = String(payload.tarikh_iso || new Date().toISOString()).trim();

    if (!nama || !kelas || !tarikh) {
      throw new Error('Maklumat nama, kelas atau tarikh tidak lengkap.');
    }

    const result = simpanKehadiranManual({
      nama: nama,
      kelas: kelas,
      status: status,
      tarikh: tarikh,
      masa: masa,
      sumber: sumber,
      kemaskiniIso: kemaskiniIso,
      targetSheet: String(payload.target_sheet || '').trim()
    });
    clearCacheTarikh_(tarikh);

    return jsonOutput({
      success: true,
      message: 'Kehadiran manual berjaya disimpan.',
      ...result
    }, e && e.parameter);
  } catch (err) {
    return jsonOutput({
      success: false,
      message: err && err.message ? err.message : 'Ralat doPost'
    }, e && e.parameter);
  }
}

function simpanKehadiranManual(input) {
  const kelas = normalKelas(input.kelas || '');
  const spreadsheetId = CLASS_SPREADSHEETS[kelas];
  if (!spreadsheetId) {
    throw new Error('Tiada spreadsheet ID untuk kelas ' + kelas);
  }

  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheetName = input.targetSheet || SHEET_NAME;
  const sheet = dapatkanAtauCiptaSheet(ss, sheetName);
  const headerMap = pastikanHeaderSheet(sheet, input.tarikh);
  const rowIndex = dapatkanAtauCiptaBarisMurid(sheet, input.nama, kelas, headerMap);
  const dateCol = headerMap[input.tarikh];

  sheet.getRange(rowIndex, dateCol).setValue(input.status);
  sheet.getRange(rowIndex, headerMap['Masa Akhir']).setValue(input.masa || '');
  sheet.getRange(rowIndex, headerMap['Sumber Akhir']).setValue(input.sumber || '');
  sheet.getRange(rowIndex, headerMap['Kemaskini ISO']).setValue(input.kemaskiniIso || new Date().toISOString());

  return {
    spreadsheetId: spreadsheetId,
    kelas: kelas,
    sheet: sheetName,
    row: rowIndex,
    column: dateCol,
    tarikh: input.tarikh
  };
}

function ambilRekodKehadiranDenganCache(tarikhTapis) {
  const cacheKey = binaCacheKeyTarikh_(tarikhTapis);
  if (!cacheKey) return ambilRekodKehadiran(tarikhTapis);

  const cache = CacheService.getScriptCache();
  const cached = cache.get(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {}
  }

  const rows = ambilRekodKehadiran(tarikhTapis);
  try {
    cache.put(cacheKey, JSON.stringify(rows), API_CACHE_TTL_SEC);
  } catch (_) {}
  return rows;
}

function binaCacheKeyTarikh_(tarikhTapis) {
  const tarikh = String(tarikhTapis || '').trim();
  if (!tarikh) return '';
  return API_CACHE_PREFIX + tarikh;
}

function clearCacheTarikh_(tarikhTapis) {
  const cacheKey = binaCacheKeyTarikh_(tarikhTapis);
  if (!cacheKey) return;
  try {
    CacheService.getScriptCache().remove(cacheKey);
  } catch (_) {}
}

function ambilRekodKehadiran(tarikhTapis) {
  const semua = [];
  Object.keys(CLASS_SPREADSHEETS).forEach(function(kelas) {
    const spreadsheetId = CLASS_SPREADSHEETS[kelas];
    if (!spreadsheetId) return;

    const ss = SpreadsheetApp.openById(spreadsheetId);
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) return;

    semua.push.apply(semua, bacaSheetKelas(sheet, kelas, tarikhTapis));
  });

  semua.sort(function(a, b) {
    const ikutKelas = String(a.Kelas || '').localeCompare(String(b.Kelas || ''));
    if (ikutKelas !== 0) return ikutKelas;
    return String(a.Nama || '').localeCompare(String(b.Nama || ''));
  });

  return semua;
}

function bacaSheetKelas(sheet, kelasDefault, tarikhTapis) {
  // Dashboard calls are always "by tarikh". Avoid reading the full sheet width (many tarikh columns)
  // which can become slow as the sheet grows.
  if (tarikhTapis) {
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return [];

    const headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const headers = headerRow.map(function(item) { return normalizeHeaderValue_(item); });

    const dateCol = headers.indexOf(tarikhTapis);
    if (dateCol === -1) return [];

    const nRows = lastRow - 1;
    const colNamaKelas = sheet.getRange(2, 1, nRows, 2).getValues();
    const colStatus = sheet.getRange(2, dateCol + 1, nRows, 1).getValues();

    const masaIdx = headers.indexOf('Masa Akhir');
    const sumberIdx = headers.indexOf('Sumber Akhir');
    const colMasa = masaIdx === -1 ? null : sheet.getRange(2, masaIdx + 1, nRows, 1).getValues();
    const colSumber = sumberIdx === -1 ? null : sheet.getRange(2, sumberIdx + 1, nRows, 1).getValues();

    const result = [];
    for (var i = 0; i < nRows; i += 1) {
      const pair = colNamaKelas[i] || [];
      const nama = String(pair[0] || '').trim();
      const kelas = normalKelas(kelasDefault || pair[1] || '');
      const status = String((colStatus[i] && colStatus[i][0]) || '').trim();
      if (!nama || !kelas || !status) continue;

      result.push({
        Nama: nama,
        Kelas: kelas,
        Tarikh: tarikhTapis,
        Status: status,
        Masa: colMasa ? String((colMasa[i] && colMasa[i][0]) || '').trim() : '',
        Sumber: colSumber ? String((colSumber[i] && colSumber[i][0]) || '').trim() : ''
      });
    }

    return result;
  }

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(function(item) {
    return normalizeHeaderValue_(item);
  });
  const metaSet = buatMetaSet();
  const result = [];

  for (var rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    const rowValues = values[rowIndex];
    const namaMurid = String(rowValues[0] || '').trim();
    const kelasMurid = normalKelas(rowValues[1] || '');
    if (!namaMurid || !kelasMurid) continue;

    for (var colIndex = 0; colIndex < headers.length; colIndex += 1) {
      const header = headers[colIndex];
      if (!isTarikhHeader(header) || metaSet[header]) continue;

      const statusTarikh = String(rowValues[colIndex] || '').trim();
      if (!statusTarikh) continue;

      result.push({
        Nama: namaMurid,
        Kelas: kelasMurid,
        Tarikh: header,
        Status: statusTarikh,
        Masa: bacaNilaiMeta(rowValues, headers, 'Masa Akhir'),
        Sumber: bacaNilaiMeta(rowValues, headers, 'Sumber Akhir')
      });
    }
  }

  return result;
}

function bacaNilaiMeta(row, headers, key) {
  const idx = headers.indexOf(key);
  if (idx === -1) return '';
  return String(row[idx] || '').trim();
}

function dapatkanAtauCiptaSheet(ss, sheetName) {
  const name = String(sheetName || '').trim();
  if (!name) throw new Error('Nama sheet tidak sah.');

  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }

  return sheet;
}

function pastikanHeaderSheet(sheet, tarikh) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  let headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(item) {
    return String(item || '').trim();
  });

  const wajib = META_HEADERS.slice();
  if (headers.filter(Boolean).length === 0) {
    headers = wajib.slice();
    if (tarikh) headers.push(tarikh);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return buatHeaderMap(headers);
  }

  wajib.forEach(function(header) {
    if (headers.indexOf(header) === -1) headers.push(header);
  });
  if (tarikh && headers.indexOf(tarikh) === -1) headers.push(tarikh);

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  return buatHeaderMap(headers);
}

function dapatkanAtauCiptaBarisMurid(sheet, nama, kelas, headerMap) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    const rowIndexBaru = 2;
    sheet.getRange(rowIndexBaru, headerMap['Nama']).setValue(nama);
    sheet.getRange(rowIndexBaru, headerMap['Kelas']).setValue(kelas);
    return rowIndexBaru;
  }

  const data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  for (var i = 0; i < data.length; i += 1) {
    const namaRow = String(data[i][0] || '').trim();
    const kelasRow = normalKelas(data[i][1] || '');
    if (namaRow === nama && kelasRow === kelas) {
      return i + 2;
    }
  }

  const rowIndex = lastRow + 1;
  sheet.getRange(rowIndex, headerMap['Nama']).setValue(nama);
  sheet.getRange(rowIndex, headerMap['Kelas']).setValue(kelas);
  return rowIndex;
}

function buatHeaderMap(headers) {
  const map = {};
  headers.forEach(function(header, index) {
    map[String(header || '').trim()] = index + 1;
  });
  return map;
}

function buatMetaSet() {
  const set = {};
  META_HEADERS.forEach(function(item) {
    set[item] = true;
  });
  return set;
}

function normalKelas(value) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (!text) return '';

  const ringkas = text.match(/^(\d)\s*([a-z])$/i);
  if (ringkas) return ringkas[1] + ' ' + ringkas[2].toUpperCase();

  const penuh = text.match(/^(\d)\s+([a-z])$/i);
  if (penuh) return penuh[1] + ' ' + penuh[2].toUpperCase();

  return text.toUpperCase() === text
    ? text
    : text.replace(/\b([a-z])/g, function(match) { return match.toUpperCase(); });
}

function normalStatus(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return 'Hadir';
  if (text === 'h' || text === 'hadir' || text === 'present' || text === '1' || text === 'true' || text === 'ya') return 'Hadir';
  if (text === 'th' || text === 'tidak hadir' || text === '0' || text === 'false') return 'Tidak Hadir';
  if (text.indexOf('tidak hadir') !== -1 || text.indexOf('x hadir') !== -1 || text.indexOf('absen') !== -1 || text.indexOf('ponteng') !== -1) return 'Tidak Hadir';
  return 'Hadir';
}

function normalTarikh(value) {
  const text = String(value || '').trim();
  if (!text) return '';

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return pad2(iso[3]) + '/' + pad2(iso[2]) + '/' + iso[1];

  const dmy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return pad2(dmy[1]) + '/' + pad2(dmy[2]) + '/' + dmy[3];

  throw new Error('Format tarikh tidak sah. Guna dd/MM/yyyy atau yyyy-MM-dd.');
}

function isTarikhHeader(value) {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(String(value || '').trim());
}

function pad2(value) {
  return ('0' + String(value || '').trim()).slice(-2);
}

function bacaJsonBody(e) {
  const raw = e && e.postData && e.postData.contents ? e.postData.contents : '';
  if (!raw) return {};
  return JSON.parse(raw);
}

function jsonOutput(obj, params) {
  const callback = String((params && params.callback) || '').trim();
  if (callback) {
    const body = callback + '(' + JSON.stringify(obj) + ');';
    return ContentService
      .createTextOutput(body)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function normalizeHeaderValue_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  }

  const text = String(value || '').trim();
  const parsed = parseTarikhHeader_(text);
  return parsed || text;
}

function parseTarikhHeader_(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';

  // Accept dd/MM/yyyy, d/M/yyyy, dd-MM-yyyy, d-M-yyyy
  let m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    return pad2(m[1]) + '/' + pad2(m[2]) + '/' + m[3];
  }

  // Accept yyyy-MM-dd or yyyy/MM/dd
  m = raw.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m) {
    return pad2(m[3]) + '/' + pad2(m[2]) + '/' + m[1];
  }

  return '';
}



