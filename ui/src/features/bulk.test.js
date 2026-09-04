import test from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { parseBulkSheet } from './bulk.js'

test('formats date cells without converting ordinary numbers', () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['recipient', 'date', 'number'],
    ['905551112233', 46145, 46145],
  ])
  sheet.B2.z = 'dd/mm/yyyy'
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Toplu Mesaj')
  const uploadedWorkbook = XLSX.read(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), {
    type: 'buffer',
    cellDates: false,
    cellNF: true,
  })

  const [row] = parseBulkSheet(uploadedWorkbook.Sheets['Toplu Mesaj'], ['date', 'number'])

  assert.equal(row.values.date, '03/05/2026')
  assert.equal(row.values.number, '46145')
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

  assert.equal(row.values.date, '02/01/1904')
  assert.equal(row.values.number, '1')
})
