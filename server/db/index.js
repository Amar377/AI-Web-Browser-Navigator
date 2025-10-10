import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'automation.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    step_type TEXT NOT NULL,
    message TEXT NOT NULL,
    level TEXT DEFAULT 'info',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS session_summaries (
    session_id TEXT PRIMARY KEY,
    task TEXT NOT NULL,
    status TEXT DEFAULT 'running',
    process_summary TEXT,
    final_summary TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS chat_sessions (
    session_id TEXT PRIMARY KEY,
    title TEXT,
    last_summary TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    message_id TEXT,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, message_id)
  )
`);

const insertLogStmt = db.prepare(`
  INSERT INTO activity_logs (session_id, step_type, message, level)
  VALUES (@sessionId, @stepType, @message, @level)
`);

const selectLogsStmt = db.prepare(`
  SELECT id, session_id as sessionId, step_type as type, message, level, created_at as createdAt
  FROM activity_logs
  WHERE session_id = ?
  ORDER BY created_at ASC, id ASC
`);

const upsertSummaryStmt = db.prepare(`
  INSERT INTO session_summaries (session_id, task, status, process_summary, final_summary)
  VALUES (@sessionId, @task, @status, @processSummary, @finalSummary)
  ON CONFLICT(session_id) DO UPDATE SET
    status = excluded.status,
    process_summary = excluded.process_summary,
    final_summary = excluded.final_summary,
    updated_at = CURRENT_TIMESTAMP
`);

const updateStatusStmt = db.prepare(`
  UPDATE session_summaries
  SET status = @status,
      updated_at = CURRENT_TIMESTAMP
  WHERE session_id = @sessionId
`);

const initSummaryStmt = db.prepare(`
  INSERT INTO session_summaries (session_id, task)
  VALUES (?, ?)
  ON CONFLICT(session_id) DO NOTHING
`);

const selectSummaryStmt = db.prepare(`
  SELECT session_id as sessionId, task, status, process_summary as processSummary, final_summary as finalSummary
  FROM session_summaries
  WHERE session_id = ?
`);

const initChatSessionStmt = db.prepare(`
  INSERT INTO chat_sessions (session_id, title)
  VALUES (?, ?)
  ON CONFLICT(session_id) DO NOTHING
`);

const insertChatMessageStmt = db.prepare(`
  INSERT OR IGNORE INTO chat_messages (session_id, message_id, role, content)
  VALUES (@sessionId, @messageId, @role, @content)
`);

const updateChatSummaryStmt = db.prepare(`
  UPDATE chat_sessions
  SET last_summary = @summary,
      updated_at = CURRENT_TIMESTAMP
  WHERE session_id = @sessionId
`);

const selectChatSummaryStmt = db.prepare(`
  SELECT session_id as sessionId, title, last_summary as summary
  FROM chat_sessions
  WHERE session_id = ?
`);

const selectChatMessagesStmt = db.prepare(`
  SELECT message_id as messageId, role, content, created_at as createdAt
  FROM chat_messages
  WHERE session_id = ?
  ORDER BY created_at ASC, id ASC
`);

export function logActivity(sessionId, stepType, message, level = 'info') {
  const result = insertLogStmt.run({ sessionId, stepType, message, level });
  return {
    id: result.lastInsertRowid.toString(),
    sessionId,
    type: stepType,
    message,
    level,
    timestamp: new Date().toISOString()
  };
}

export function getSessionLogs(sessionId) {
  return selectLogsStmt.all(sessionId).map((row) => ({
    id: row.id.toString(),
    sessionId: row.sessionId,
    type: row.type,
    message: row.message,
    level: row.level,
    timestamp: new Date(row.createdAt).toISOString()
  }));
}

export function initSessionSummary(sessionId, task) {
  initSummaryStmt.run(sessionId, task);
}

export function saveSessionSummary(sessionId, task, status, processSummary, finalSummary) {
  upsertSummaryStmt.run({
    sessionId,
    task,
    status,
    processSummary,
    finalSummary
  });
}

export function updateSessionStatus(sessionId, status) {
  updateStatusStmt.run({ sessionId, status });
}

export function getSessionSummary(sessionId) {
  return selectSummaryStmt.get(sessionId) || null;
}

export function ensureChatSession(sessionId, title = '') {
  initChatSessionStmt.run(sessionId, title);
}

export function saveChatMessage(sessionId, { messageId = null, role, content }) {
  insertChatMessageStmt.run({ sessionId, messageId, role, content });
}

export function saveChatMessages(sessionId, messages = []) {
  const insertMany = db.transaction((msgs) => {
    msgs.forEach((msg) => {
      insertChatMessageStmt.run({
        sessionId,
        messageId: msg.messageId ?? msg.id ?? null,
        role: msg.role,
        content: msg.content
      });
    });
  });

  insertMany(messages);
}

export function updateChatSummary(sessionId, summary) {
  updateChatSummaryStmt.run({ sessionId, summary });
}

export function getChatSummary(sessionId) {
  return selectChatSummaryStmt.get(sessionId) || null;
}

export function getChatTranscript(sessionId) {
  return selectChatMessagesStmt.all(sessionId).map((row) => ({
    messageId: row.messageId,
    role: row.role,
    content: row.content,
    timestamp: new Date(row.createdAt).toISOString()
  }));
}
