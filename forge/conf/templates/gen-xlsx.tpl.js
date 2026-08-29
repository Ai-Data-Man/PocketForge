// Minimal zero-dependency .xlsx generator (OOXML zip with STORE compression)
// Usage: node gen-xlsx.js <output.xlsx> '{"sheetName":...,"headers":[...],"rows":[[...]]}' [title]
//        node gen-xlsx.js <output.xlsx> --json-file <path-to-json> [title]   (JSON in UTF-8 file, no cmd quoting needed)
const fs = require('fs');
const path = require('path');

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++)
      crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function zip(entries) {
  const local = [], central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nb = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(0, 8);
    lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nb.length, 26); lh.writeUInt16LE(0, 28);
    local.push(lh, nb, data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 8); ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nb.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, nb);
    offset += lh.length + nb.length + data.length;
  }
  const cb = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cb.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...local, cb, end]);
}

function colName(n) { // 1→A, 2→B...
  let s = '';
  while (n > 0) { s = String.fromCharCode(64 + (n % 26 || 26)) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const xmlHdr = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';

function buildXlsx({ sheetName, title, headers, rows }) {
  // Collect unique strings for sharedStrings
  const strMap = new Map();
  function si(s) {
    if (!strMap.has(s)) strMap.set(s, strMap.size);
    return strMap.get(s);
  }
  // Header strings
  headers.forEach(h => si(h));
  // Row strings + cell normalization (s40: short rows padded, booleans->string, NaN/Infinity rejected)
  const rowRefs = rows.map(r => headers.map((h, c) => {
    let v = r[c];
    if (v === undefined || v === null) v = '';
    if (typeof v === 'number') {
      if (!isFinite(v)) v = String(v);
      else return { t: 'n', v };
    }
    if (typeof v === 'boolean') v = v ? '是' : '否';
    if (typeof v !== 'string') v = String(v);
    return { t: 's', v: si(v) };
  }));

  const strings = [...strMap.keys()];
  let sstXml = xmlHdr + `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strMap.size}" uniqueCount="${strMap.size}">`;
  strings.forEach(s => { sstXml += `<si><t xml:space="preserve">${escXml(s)}</t></si>`; });
  sstXml += '</sst>';

  // Build sheet XML
  const totalRows = rows.length + (title ? 2 : 1); // title row + header row + data rows
  let sheet = xmlHdr + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
  // Column widths
  const colCount = headers.length;
  const widths = headers.map(h => Math.max(10, Math.min(30, String(h).length * 2 + 4)));
  sheet += '<cols>';
  for (let c = 0; c < colCount; c++)
    sheet += `<col min="${c+1}" max="${c+1}" width="${widths[c]}" customWidth="1"/>`;
  sheet += '</cols><sheetData>';

  let rowIdx = 1;
  if (title) {
    sheet += `<row r="${rowIdx}">`;
    sheet += `<c r="A${rowIdx}" t="s" s="2"><v>${si(title)}</v></c>`;
    // merge across all columns
    sheet += '</row>';
    rowIdx++;
  }

  // Header row (style 1 = bold+fill)
  sheet += `<row r="${rowIdx}">`;
  for (let c = 0; c < colCount; c++) {
    sheet += `<c r="${colName(c+1)}${rowIdx}" t="s" s="1"><v>${si(headers[c])}</v></c>`;
  }
  sheet += '</row>';
  rowIdx++;

  // Data rows
  for (const r of rowRefs) {
    sheet += `<row r="${rowIdx}">`;
    for (let c = 0; c < colCount; c++) {
      const cell = r[c];
      const ref = `${colName(c+1)}${rowIdx}`;
      if (cell.t === 's')
        sheet += `<c r="${ref}" t="s"><v>${cell.v}</v></c>`;
      else
        sheet += `<c r="${ref}"><v>${cell.v}</v></c>`;
    }
    sheet += '</row>';
    rowIdx++;
  }
  sheet += '</sheetData>';

  // Merge title row if present
  if (title) {
    sheet += `<mergeCells count="1"><mergeCell ref="A1:${colName(colCount)}1"/></mergeCells>`;
  }
  sheet += '</worksheet>';

  // Styles: 0=normal, 1=header(bold+fill+center), 2=title(bold+large+center)
  const stylesXml = xmlHdr + `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF4472C4"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border/><border><left style="thin"><color rgb="FFB4C6E7"/></left><right style="thin"><color rgb="FFB4C6E7"/></right><top style="thin"><color rgb="FFB4C6E7"/></top><bottom style="thin"><color rgb="FFB4C6E7"/></bottom></border></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="3">
<xf fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf fontId="1" fillId="1" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center"/></xf>
</cellXfs></styleSheet>`;

  const contentTypes = xmlHdr + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const rels = xmlHdr + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const wbXml = xmlHdr + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${escXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  const wbRels = xmlHdr + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  // Rebuild sharedStrings with title included
  // (title was added to strMap during sheet build, so sstXml needs rebuild)
  strMap.clear();
  if (title) si(title);
  headers.forEach(h => si(h));
  rows.forEach(r => r.forEach(v => { if (typeof v === 'string') si(v); }));
  // Need to remap rowRefs since indices shifted
  // Actually let's just rebuild sstXml from the final strMap
  const finalStrings = [...strMap.keys()];
  // Problem: sheet XML already used old indices. Let me redo this properly.
  // Reset and rebuild everything with title-first ordering
  strMap.clear();
  const titleIdx = title ? si(title) : -1;
  const headerIdxs = headers.map(h => si(h));
  const cellRefs = rows.map(r => headers.map((h, c) => {
    let v = r[c];
    if (v === undefined || v === null) v = '';
    if (typeof v === 'number') {
      if (!isFinite(v)) v = String(v);
      else return { t: 'n', v };
    }
    if (typeof v === 'boolean') v = v ? '是' : '否';
    if (typeof v !== 'string') v = String(v);
    return { t: 's', v: si(v) };
  }));

  const allStrings = [...strMap.keys()];
  let sstFinal = xmlHdr + `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${allStrings.length}" uniqueCount="${allStrings.length}">`;
  allStrings.forEach(s => { sstFinal += `<si><t xml:space="preserve">${escXml(s)}</t></si>`; });
  sstFinal += '</sst>';

  // Rebuild sheet with correct indices
  sheet = xmlHdr + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
  sheet += '<cols>';
  for (let c = 0; c < colCount; c++)
    sheet += `<col min="${c+1}" max="${c+1}" width="${widths[c]}" customWidth="1"/>`;
  sheet += '</cols><sheetData>';

  rowIdx = 1;
  if (title) {
    sheet += `<row r="${rowIdx}"><c r="A${rowIdx}" t="s" s="2"><v>${titleIdx}</v></c></row>`;
    rowIdx++;
  }
  sheet += `<row r="${rowIdx}">`;
  for (let c = 0; c < colCount; c++)
    sheet += `<c r="${colName(c+1)}${rowIdx}" t="s" s="1"><v>${headerIdxs[c]}</v></c>`;
  sheet += '</row>';
  rowIdx++;
  for (const r of cellRefs) {
    sheet += `<row r="${rowIdx}">`;
    for (let c = 0; c < colCount; c++) {
      const ref = `${colName(c+1)}${rowIdx}`;
      sheet += r[c].t === 's'
        ? `<c r="${ref}" t="s"><v>${r[c].v}</v></c>`
        : `<c r="${ref}"><v>${r[c].v}</v></c>`;
    }
    sheet += '</row>';
    rowIdx++;
  }
  sheet += '</sheetData>';
  if (title)
    sheet += `<mergeCells count="1"><mergeCell ref="A1:${colName(colCount)}1"/></mergeCells>`;
  sheet += '</worksheet>';

  return zip([
    { name: '[Content_Types].xml', data: Buffer.from(contentTypes, 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(rels, 'utf8') },
    { name: 'xl/workbook.xml', data: Buffer.from(wbXml, 'utf8') },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(wbRels, 'utf8') },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheet, 'utf8') },
    { name: 'xl/sharedStrings.xml', data: Buffer.from(sstFinal, 'utf8') },
    { name: 'xl/styles.xml', data: Buffer.from(stylesXml, 'utf8') },
  ]);
}

module.exports = { buildXlsxBuf: buildXlsx };

// --- main (direct execution) ---
function parseJsonArg(s) {
  let t = String(s).trim();
  // 兼容被单引号包裹的 JSON（cmd 不认识单引号，会原样传进来）：剥掉首尾成对的 ' 再解析
  if (t.length >= 2 && t[0] === "'" && t[t.length - 1] === "'") t = t.slice(1, -1);
  try {
    return JSON.parse(t);
  } catch (e) {
    console.error('JSON 参数格式不对（' + e.message + '）');
    console.error('提示：请用双引号包住 JSON，内部的每个 " 写成 \\"；复杂 JSON 可先存成文件，用 --json-file 参数读取');
    process.exit(1);
  }
}

if (require.main === module) {
  const outPath = process.argv[2];
  let spec = null;
  const args = process.argv.slice(3);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json-file') {
      const f = args[++i];
      if (!f) { console.error('--json-file 后面要跟 JSON 文件路径'); process.exit(1); }
      try {
        spec = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
      } catch (e) {
        console.error('读不了 JSON 文件 ' + f + '（' + e.message + '）');
        process.exit(1);
      }
    } else if (spec === null) {
      spec = parseJsonArg(args[i]);
    } else if (spec.title === undefined && typeof args[i] === 'string' && args[i]) {
      spec.title = args[i]; // s52: usage 文档承诺的末尾位置参数标题（此前被静默忽略）；JSON 内已带 title 时以 JSON 为准
    }
  }
  if (spec === null) {
    console.error('缺少 JSON 数据。用法：node gen-xlsx.js 输出.xlsx "{\\"sheetName\\":\\"表名\\",\\"headers\\":[...],\\"rows\":[...]}" [标题]');
    console.error('或：node gen-xlsx.js 输出.xlsx --json-file 数据.json [标题]');
    process.exit(1);
  }
  const buf = buildXlsx(spec);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);
  console.log('OK ' + outPath + ' (' + buf.length + ' bytes)');
}
