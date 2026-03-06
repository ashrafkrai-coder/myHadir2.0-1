const SPREADSHEET_ID = '1enSJlvIlkzV7c-1mkatMeSrTERFmB3czo3c3iSSAJlE';
const GURU_PASSWORD = 'myHadir1234';
const SHEET_PREFIX = 'Kehadiran ';
const META_HEADERS = ['Nama', 'Kelas', 'Masa Akhir', 'Sumber Akhir', 'Kemaskini ISO'];

function doGet(e) {
  try {
    const tarikh = normalTarikh((e && e.parameter && e.parameter.tarikh) || '');
    const rows = ambilRekodKehadiran(tarikh);
    return jsonOutput({
      success: true,
      tarikh: tarikh || '',
      data: rows
    });
  } catch (err) {
    return jsonOutput({
      success: false,
      message: err && err.message ? err.message : 'Ralat doGet'
    });
  }
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

    return jsonOutput({
      success: true,
      message: 'Kehadiran manual berjaya disimpan.',
      ...result
    });
  } catch (err) {
    return jsonOutput({
      success: false,
      message: err && err.message ? err.message : 'Ralat doPost'
    });
  }
}

function simpanKehadiranManual(input) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheetName = input.targetSheet || binaNamaSheet(input.kelas);
  const sheet = dapatkanAtauCiptaSheet(ss, sheetName);
  const headerMap = pastikanHeaderSheet(sheet, input.tarikh);
  const rowIndex = dapatkanAtauCiptaBarisMurid(sheet, input.nama, input.kelas, headerMap);
  const dateCol = headerMap[input.tarikh];

  sheet.getRange(rowIndex, dateCol).setValue(input.status);
  sheet.getRange(rowIndex, headerMap['Masa Akhir']).setValue(input.masa || '');
  sheet.getRange(rowIndex, headerMap['Sumber Akhir']).setValue(input.sumber || '');
  sheet.getRange(rowIndex, headerMap['Kemaskini ISO']).setValue(input.kemaskiniIso || new Date().toISOString());

  return {
    sheet: sheetName,
    row: rowIndex,
    column: dateCol,
    tarikh: input.tarikh
  };
}

function ambilRekodKehadiran(tarikhTapis) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheets = ss.getSheets().filter(function(sheet) {
    return sheet.getName().indexOf(SHEET_PREFIX) === 0;
  });

  const semua = [];
  sheets.forEach(function(sheet) {
    semua.push.apply(semua, bacaSheetKelas(sheet, tarikhTapis));
  });

  semua.sort(function(a, b) {
    const ikutKelas = String(a.Kelas || '').localeCompare(String(b.Kelas || ''));
    if (ikutKelas !== 0) return ikutKelas;
    return String(a.Nama || '').localeCompare(String(b.Nama || ''));
  });

  return semua;
}

function bacaSheetKelas(sheet, tarikhTapis) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(function(item) {
    return String(item || '').trim();
  });
  const metaSet = buatMetaSet();
  const result = [];

  if (tarikhTapis) {
    const dateCol = headers.indexOf(tarikhTapis);
    if (dateCol === -1) return [];

    for (var i = 1; i < values.length; i += 1) {
      const row = values[i];
      const nama = String(row[0] || '').trim();
      const kelas = normalKelas(row[1] || '');
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

function binaNamaSheet(kelas) {
  return SHEET_PREFIX + normalKelas(kelas);
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

function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
