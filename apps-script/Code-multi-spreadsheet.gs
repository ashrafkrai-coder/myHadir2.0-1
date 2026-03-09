const GURU_PASSWORD = 'myHadir1234';
const SHEET_NAME = 'Kehadiran';
const META_HEADERS = ['Nama', 'Kelas', 'Masa Akhir', 'Sumber Akhir', 'Kemaskini ISO'];

/*
  Tukar nama kelas di bawah ikut padanan sebenar.
  Saya masukkan 9 ID yang anda beri sebagai template terus.
*/
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
    if (params.tarikh) {
      return jsonOutput(getKehadiranByTarikh(params.tarikh));
    }

    return htmlGateOutput_();
  } catch (err) {
    return jsonOutput({
      success: false,
      message: err && err.message ? err.message : 'Ralat doGet'
    });
  }
}

function getKehadiranByTarikh(tarikhInput) {
  const tarikh = normalTarikh(tarikhInput || '');
  const rows = [];

  Object.keys(CLASS_SPREADSHEETS).forEach(function(kelas) {
    const ss = SpreadsheetApp.openById(CLASS_SPREADSHEETS[kelas]);
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) return;
    rows.push.apply(rows, bacaSheetKelas(sheet, kelas, tarikh));
  });

  rows.sort(function(a, b) {
    const ikutKelas = String(a.Kelas || '').localeCompare(String(b.Kelas || ''));
    if (ikutKelas !== 0) return ikutKelas;
    return String(a.Nama || '').localeCompare(String(b.Nama || ''));
  });

  return {
    success: true,
    tarikh: tarikh,
    data: rows
  };
}

function htmlGateOutput_() {
  const email = getUserEmail_();
  const role = getUserRole_(email);
  const selamat = sanitizeHtml_(email || 'tidak dikenal pasti');

  if (role === 'murid') {
    return HtmlService.createHtmlOutput(
      "<div style='font-family:Arial,sans-serif;max-width:720px;margin:56px auto;padding:24px;border:1px solid #f3b7b7;border-radius:16px;background:#fff7f7;color:#8a1f1f'>" +
      "<h2 style='margin-top:0'>Akses Disekat</h2>" +
      "<p>URL ini hanya untuk guru DELIMa.</p>" +
      "<p>Akaun semasa: <strong>" + selamat + "</strong></p>" +
      "</div>"
    ).setTitle('Akses Disekat');
  }

  if (role !== 'guru') {
    return HtmlService.createHtmlOutput(
      "<div style='font-family:Arial,sans-serif;max-width:720px;margin:56px auto;padding:24px;border:1px solid #d7deea;border-radius:16px;background:#f8fbff;color:#183153'>" +
      "<h2 style='margin-top:0'>Log Masuk Guru Diperlukan</h2>" +
      "<p>Sila buka URL ini menggunakan akaun guru DELIMa yang bermula dengan <strong>g-</strong>.</p>" +
      "<p>Akaun semasa: <strong>" + selamat + "</strong></p>" +
      "</div>"
    ).setTitle('Log Masuk Guru');
  }

  return HtmlService.createHtmlOutput(
    "<div style='font-family:Arial,sans-serif;max-width:720px;margin:56px auto;padding:24px;border:1px solid #cce7d2;border-radius:16px;background:#f6fff8;color:#114b22'>" +
    "<h2 style='margin-top:0'>Akses Guru Berjaya</h2>" +
    "<p>Akaun guru DELIMa disahkan: <strong>" + selamat + "</strong></p>" +
    "<p>Endpoint API dashboard aktif. Gunakan parameter <code>?tarikh=dd/MM/yyyy</code> untuk respons JSON.</p>" +
    "</div>"
  ).setTitle('Akses Guru');
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

function sanitizeHtml_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

    const spreadsheetId = CLASS_SPREADSHEETS[kelas];
    if (!spreadsheetId) {
      throw new Error('Tiada spreadsheet ID untuk kelas ' + kelas);
    }

    const ss = SpreadsheetApp.openById(spreadsheetId);
    const sheet = dapatkanAtauCiptaSheet(ss, SHEET_NAME);
    const headerMap = pastikanHeaderSheet(sheet, tarikh);
    const rowIndex = dapatkanAtauCiptaBarisMurid(sheet, nama, kelas, headerMap);
    const dateCol = headerMap[tarikh];

    sheet.getRange(rowIndex, dateCol).setValue(status);
    sheet.getRange(rowIndex, headerMap['Masa Akhir']).setValue(masa);
    sheet.getRange(rowIndex, headerMap['Sumber Akhir']).setValue(sumber);
    sheet.getRange(rowIndex, headerMap['Kemaskini ISO']).setValue(kemaskiniIso);

    return jsonOutput({
      success: true,
      message: 'Kehadiran manual berjaya disimpan.',
      spreadsheetId: spreadsheetId,
      sheet: SHEET_NAME,
      row: rowIndex,
      column: dateCol,
      tarikh: tarikh,
      kelas: kelas
    });
  } catch (err) {
    return jsonOutput({
      success: false,
      message: err && err.message ? err.message : 'Ralat doPost'
    });
  }
}

function bacaSheetKelas(sheet, kelasDefault, tarikhTapis) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(function(item) {
    return normalizeHeaderValue_(item);
  });
  const result = [];

  const dateCol = headers.indexOf(tarikhTapis);
  if (dateCol === -1) return [];

  for (var i = 1; i < values.length; i += 1) {
    const row = values[i];
    const nama = String(row[0] || '').trim();
    const kelas = normalKelas(row[1] || kelasDefault || '');
    const status = String(row[dateCol] || '').trim();
    if (!nama || !kelas || !status) continue;

    result.push({
      Nama: nama,
      Kelas: kelas,
      Tarikh: tarikhTapis,
      Status: status,
      Masa: bacaNilaiMeta(row, headers, 'Masa Akhir'),
      Sumber: bacaNilaiMeta(row, headers, 'Sumber Akhir')
    });
  }

  return result;
}

function bacaNilaiMeta(row, headers, key) {
  const idx = headers.indexOf(key);
  if (idx === -1) return '';
  return String(row[idx] || '').trim();
}

function dapatkanAtauCiptaSheet(ss, sheetName) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  return sheet;
}

function pastikanHeaderSheet(sheet, tarikh) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  let headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(item) {
    return String(item || '').trim();
  });

  if (headers.filter(Boolean).length === 0) {
    headers = META_HEADERS.slice();
    headers.push(tarikh);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return buatHeaderMap(headers);
  }

  META_HEADERS.forEach(function(header) {
    if (headers.indexOf(header) === -1) headers.push(header);
  });
  if (headers.indexOf(tarikh) === -1) headers.push(tarikh);

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  return buatHeaderMap(headers);
}

function dapatkanAtauCiptaBarisMurid(sheet, nama, kelas, headerMap) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    sheet.getRange(2, headerMap['Nama']).setValue(nama);
    sheet.getRange(2, headerMap['Kelas']).setValue(kelas);
    return 2;
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
  if (!text) throw new Error('Tarikh diperlukan.');

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return pad2(iso[3]) + '/' + pad2(iso[2]) + '/' + iso[1];

  const dmy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return pad2(dmy[1]) + '/' + pad2(dmy[2]) + '/' + dmy[3];

  throw new Error('Format tarikh tidak sah. Guna dd/MM/yyyy atau yyyy-MM-dd.');
}

function pad2(value) {
  return ('0' + String(value || '').trim()).slice(-2);
}

function bacaJsonBody(e) {
  const raw = e && e.postData && e.postData.contents ? e.postData.contents : '';
  if (!raw) return {};
  return JSON.parse(raw);
}

function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function normalizeHeaderValue_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  }
  return String(value || '').trim();
}
