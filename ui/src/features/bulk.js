import * as XLSX from 'xlsx'

export function getVariables(templates, templateID) {
  const template = templates.find((item) => item.id === Number(templateID))
  return template
    ? [
        ...new Set(
          [...template.body.matchAll(/\{\{\s*([\p{L}_][\p{L}\p{N}_]{0,39})\s*\}\}/gu)].map(
            (match) => match[1],
          ),
        ),
      ]
    : []
}

export function downloadTemplate(templates, templateID, notify) {
  if (!templateID) return notify('Önce mesaj şablonu seçin', 'warning')
  const variables = getVariables(templates, templateID)
  const headers = ['recipient', ...variables]
  const sample = ['905551112233', ...variables.map((variable) => `${variable} değeri`)]
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([headers, sample])
  XLSX.utils.book_append_sheet(workbook, sheet, 'Toplu Mesaj')
  XLSX.writeFile(workbook, 'krio-toplu-mesaj-sablonu.xlsx')
}

export function renderPreview(rows, templates, templateID, escapeHTML) {
  if (!rows.length)
    return '<p class="excel-empty">Dosya yüklendiğinde gönderim önizlemesi burada görünecek.</p>'
  const variables = getVariables(templates, templateID)
  return `<div class="excel-preview"><b>${rows.length} alıcı hazır</b><div><table><thead><tr><th>Alıcı</th>${variables.map((name) => `<th>${escapeHTML(name)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHTML(row.recipient.split('@')[0])}</td>${variables.map((name) => `<td>${escapeHTML(row.values[name])}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`
}

export function exportReports(reports, filename) {
  const rows = reports.flatMap((report) =>
    report.items.map((item) => ({
      'İşlem No': report.id,
      Şablon: report.templateName,
      Profil: report.profileId,
      Yöntem: report.mode,
      Başlangıç: new Date(report.startedAt).toLocaleString('tr-TR'),
      Satır: item.row,
      Alıcı: item.recipient.split('@')[0],
      Mesaj: item.message,
      Değişkenler: Object.entries(item.values || {})
        .map(([key, value]) => `${key}: ${value}`)
        .join(' | '),
      Durum: item.status === 'success' ? 'Başarılı' : 'Başarısız',
      Hata: item.error || '',
      'Gönderim zamanı': new Date(item.sentAt).toLocaleString('tr-TR'),
    })),
  )
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Gönderim Raporları')
  XLSX.writeFile(workbook, filename)
}
