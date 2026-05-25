import assert from 'node:assert/strict'
import test from 'node:test'
import { resolve } from 'node:path'
import { getDocumentParserType, parseDocument } from '../../src/modules/crux/research/research.documents'

const fixture = (name: string): string => resolve(process.cwd(), 'test/fixtures/research', name)

test('document parser dispatches by extension', () => {
  assert.equal(getDocumentParserType('note.txt'), 'txt')
  assert.equal(getDocumentParserType('brief.md'), 'md')
  assert.equal(getDocumentParserType('meta.json'), 'json')
  assert.equal(getDocumentParserType('evidence.pdf'), 'pdf')
  assert.equal(getDocumentParserType('filing.docx'), 'docx')
  assert.equal(getDocumentParserType('archive.zip'), 'unsupported')
})

test('parseDocument reads text fixtures', async () => {
  const parsed = await parseDocument(fixture('sample.txt'))
  assert.equal(parsed.parse_status, 'parsed')
  assert.match(parsed.text_content, /MahaRERA registration/)
})

test('parseDocument accepts simple pdf fixtures through printable text fallback', async () => {
  const parsed = await parseDocument(fixture('sample.pdf'))
  assert.equal(parsed.file_type, 'pdf')
  assert.equal(parsed.parse_status, 'parsed')
  assert.match(parsed.text_content, /environmental compliance/i)
})

test('parseDocument accepts simple docx fixtures through fallback parsing', async () => {
  const parsed = await parseDocument(fixture('sample.docx'))
  assert.equal(parsed.file_type, 'docx')
  assert.equal(parsed.parse_status, 'parsed')
  assert.match(parsed.text_content, /company remains active/i)
})
