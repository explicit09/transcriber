# Remaining Tasks for Real-Time Collaboration and Semantic Search

This document lists tasks required to bring the implementation up to the requirements in **AGENTS.md** and the PRD.

## 1. Real-Time Collaboration Layer

1. **Expand Comments Schema**
   - Add `created_by`, `due_date`, `metadata`, and `absolute_position` columns in `shared/schema.ts`.
   - Generate a migration and update the database accordingly.
   - Update `server/storage.ts` and API routes to handle the new fields.

2. **User Presence Enhancements**
   - Implement multi-user awareness with distinct names and colors in the TipTap editor.
   - Display presence indicators (cursor color + user name) for active collaborators.

3. **Comment Creation & Editing UI**
   - Provide UI components to create, edit, and resolve comments directly in the transcript view.
   - Support assigning a comment to a user and setting a due date (parse natural language dates via LLM).

4. **Action Item Webhooks**
   - When a comment is of type `action_item`, trigger webhook calls to ClickUp and Notion including the parsed due date.
   - Add configuration options for webhook endpoints and error handling.

5. **Version History & Diff Viewer**
   - Ensure snapshots are saved on `Cmd+S` and every 5 minutes.
   - Build UI to list versions and show diffs between selected revisions.

## 2. Semantic Search & Smart Highlights

6. **LLM-based Tagging**
   - Implement background job that tags transcript chunks with `Decision`, `Risk`, or `Date` labels using an LLM.
   - Store tags in `transcript_vectors` or a new table referenced by chunk.

7. **Faceted Search Filters** ✅
   - Extend the search API to filter by tags (e.g., only show `Decision` chunks).
   - Update the client search UI to allow toggling these smart filters.

8. **Enhanced Highlighting**
   - When jumping to a search result, highlight the exact matched span and auto-scroll the editor to it.
   - Maintain highlight state when editing collaboratively.

9. **Query Caching & Incremental Indexing**
   - Add a caching layer for frequent search queries.
   - Implement incremental reindexing of transcripts when edits occur, using background workers.

10. **Testing & Monitoring**
    - Add unit tests for new schema validations, comment features, and search filters.
    - Implement performance tests for WebSocket latency and search query latency as described in AGENTS.md.

These tasks should complete the feature set outlined in the PRD and ensure full functionality as described in **AGENTS.md**.
