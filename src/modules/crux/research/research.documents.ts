import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { ResearchDocumentParseStatus } from '../shared/types'

const execFileAsync = promisify(execFile)

export interface ParsedDocument {
  file_path: string
  file_type: string
  content_hash: string
  parse_status: ResearchDocumentParseStatus
  parse_error: string | null
  parsed_at: string | null
  text_content: string
  source_title: string
  excerpt: string
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function extractPrintableText(buffer: Buffer): string {
  const raw = buffer.toString('utf8')
  const matches = raw.match(/[A-Za-z0-9][A-Za-z0-9\s,.:;()/%'"_-]{10,}/g) ?? []
  return normalizeWhitespace(matches.join(' '))
}

function buildExcerpt(text: string, maxLength: number = 280): string {
  const clean = normalizeWhitespace(text)
  return clean.length <= maxLength ? clean : `${clean.slice(0, maxLength - 1)}…`
}

async function parseTextLikeDocument(filePath: string, fileType: string): Promise<ParsedDocument> {
  const absolutePath = resolve(filePath)
  const raw = await readFile(absolutePath)
  const text_content = normalizeWhitespace(raw.toString('utf8'))
  return {
    file_path: absolutePath,
    file_type: fileType,
    content_hash: createHash('sha256').update(raw).digest('hex'),
    parse_status: text_content ? 'parsed' : 'failed',
    parse_error: text_content ? null : 'EMPTY_DOCUMENT',
    parsed_at: text_content ? new Date().toISOString() : null,
    text_content,
    source_title: basename(absolutePath),
    excerpt: buildExcerpt(text_content),
  }
}

async function parseDocx(filePath: string): Promise<ParsedDocument> {
  const absolutePath = resolve(filePath)
  const raw = await readFile(absolutePath)
  const content_hash = createHash('sha256').update(raw).digest('hex')
  let text_content = ''
  let parse_error: string | null = null

  try {
    const result = await execFileAsync('/usr/bin/textutil', ['-convert', 'txt', '-stdout', absolutePath], { maxBuffer: 10 * 1024 * 1024 })
    text_content = normalizeWhitespace(result.stdout)
  } catch (error) {
    parse_error = error instanceof Error ? error.message : 'DOCX_TEXTUTIL_FAILED'
  }

  if (!text_content) {
    try {
      const result = await execFileAsync('/usr/bin/unzip', ['-p', absolutePath, 'word/document.xml'], { maxBuffer: 10 * 1024 * 1024 })
      text_content = normalizeWhitespace(
        decodeXmlEntities(result.stdout.replace(/<[^>]+>/g, ' ')),
      )
      parse_error = null
    } catch (error) {
      if (!parse_error) {
        parse_error = error instanceof Error ? error.message : 'DOCX_UNZIP_FAILED'
      }
    }
  }

  if (!text_content) {
    text_content = extractPrintableText(raw)
  }

  const parse_status: ResearchDocumentParseStatus = text_content ? 'parsed' : 'failed'

  return {
    file_path: absolutePath,
    file_type: 'docx',
    content_hash,
    parse_status,
    parse_error: parse_status === 'parsed' ? null : parse_error ?? 'DOCX_PARSE_FAILED',
    parsed_at: parse_status === 'parsed' ? new Date().toISOString() : null,
    text_content,
    source_title: basename(absolutePath),
    excerpt: buildExcerpt(text_content),
  }
}

async function parsePdf(filePath: string): Promise<ParsedDocument> {
  const absolutePath = resolve(filePath)
  const raw = await readFile(absolutePath)
  const content_hash = createHash('sha256').update(raw).digest('hex')
  const text_content = extractPrintableText(raw)
  const parse_status: ResearchDocumentParseStatus = text_content ? 'parsed' : 'failed'

  return {
    file_path: absolutePath,
    file_type: 'pdf',
    content_hash,
    parse_status,
    parse_error: parse_status === 'parsed' ? null : 'PDF_PARSE_FAILED',
    parsed_at: parse_status === 'parsed' ? new Date().toISOString() : null,
    text_content,
    source_title: basename(absolutePath),
    excerpt: buildExcerpt(text_content),
  }
}

export function getDocumentParserType(filePath: string): string {
  const extension = extname(filePath).toLowerCase()
  switch (extension) {
    case '.txt':
      return 'txt'
    case '.md':
      return 'md'
    case '.json':
      return 'json'
    case '.pdf':
      return 'pdf'
    case '.docx':
      return 'docx'
    default:
      return 'unsupported'
  }
}

export async function parseDocument(filePath: string): Promise<ParsedDocument> {
  const parserType = getDocumentParserType(filePath)

  switch (parserType) {
    case 'txt':
    case 'md':
    case 'json':
      return parseTextLikeDocument(filePath, parserType)
    case 'pdf':
      return parsePdf(filePath)
    case 'docx':
      return parseDocx(filePath)
    default: {
      const absolutePath = resolve(filePath)
      return {
        file_path: absolutePath,
        file_type: parserType,
        content_hash: '',
        parse_status: 'skipped',
        parse_error: 'UNSUPPORTED_DOCUMENT_TYPE',
        parsed_at: null,
        text_content: '',
        source_title: basename(absolutePath),
        excerpt: '',
      }
    }
  }
}
