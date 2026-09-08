import test from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { parseBulkSheet } from './bulk.js'

test('formats uploaded date cells without converting ordinary numbers', () => {
  for (const [format, serial, expectedDate] of [
    ['dd.mm.yyyy', 46023, '01.01.2026'],
    ['m/d/yy', 46023, '01.01.2026'],
    ['dd.mm.yyyy "d.m"', 46023, '01.01.2026'],
    ['dd. mm. yyyy', 46023, '01.01.2026'],
    ['dd mmm. yyyy', 46023, '01.01.2026'],
    ['yyyy. mm. dd', 46023, '01.01.2026'],
    ['dd\\.mm\\.yyyy', 46023, '01.01.2026'],
    ['[$-tr-TR]dd.mm.yyyy', 46023, '01.01.2026'],
    ['[$-en-US]m/d/yy', 46023, '01.01.2026'],
    ['dd.mm.yyyy hh:mm', 46023.5, '01.01.2026 12:00'],
    ['hh:mm:ss.000', 0.500001, '12:00:00.086'],
    ['[s].000', 0.500001, '43200.086'],
    ['dd.mm.yyyy hh:mm:ss.000', 46023.500001, '01.01.2026 12:00:00.086'],
    ['hh:mm', 0.5, '12:00'],
    ['[h]:mm', 1.5, '36:00'],
    ['dd.mm.yyyy', 2958466, '2958466'],
  ]) {
    const sheet = XLSX.utils.aoa_to_sheet([
      ['recipient', 'date', 'number'],
      ['905551112233', serial, 46023],
    ])
    sheet.B2.z = format
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, 'Toplu Mesaj')
    const uploadedWorkbook = XLSX.read(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), {
      type: 'buffer',
      cellDates: false,
      cellNF: true,
    })

    const [row] = parseBulkSheet(uploadedWorkbook.Sheets['Toplu Mesaj'], ['date', 'number'])

    assert.equal(row.values.date, expectedDate)
    assert.equal(row.values.number, '46023')
  }
})

test('preserves the 1900 date system serials', () => {
  for (const [serial, expectedDate] of [
    [59, '28.02.1900'],
    [60, '29.02.1900'],
    [61, '01.03.1900'],
  ]) {
    const sheet = XLSX.utils.aoa_to_sheet([
      ['recipient', 'date'],
      ['905551112233', serial],
    ])
    sheet.B2.z = 'dd.mm.yyyy'
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, 'Toplu Mesaj')
    const uploadedWorkbook = XLSX.read(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), {
      type: 'buffer',
      cellDates: false,
      cellNF: true,
    })

    assert.equal(parseBulkSheet(uploadedWorkbook.Sheets['Toplu Mesaj'], ['date'])[0].values.date, expectedDate)
  }
})

test('uses the 1904 workbook date system', () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['recipient', 'date', 'number'],
    ['905551112233', 1, 1],
  ])
  sheet.B2.z = 'dd/mm/yyyy'
  const workbook = XLSX.utils.book_new()
  workbook.Workbook = { WBProps: { date1904: true } }
  XLSX.utils.book_append_sheet(workbook, sheet, 'Toplu Mesaj')
  const uploadedWorkbook = XLSX.read(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), {
    type: 'buffer',
    cellDates: false,
    cellNF: true,
  })

  const [row] = parseBulkSheet(
    uploadedWorkbook.Sheets['Toplu Mesaj'],
    ['date', 'number'],
    uploadedWorkbook.Workbook.WBProps.date1904,
  )

  assert.equal(row.values.date, '02.01.1904')
  assert.equal(row.values.number, '1')
})
