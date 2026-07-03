import { draftReply, priorityBadge, visibleTickets } from "../app/supportDesk.js";

const tickets = [
  { id: "T-2", title: "Newer", status: "open" as const, priority: "high" as const, createdAt: "2026-01-02T10:00:00Z" },
  { id: "T-1", title: "Older", status: "open" as const, priority: "normal" as const, createdAt: "2026-01-01T10:00:00Z" },
];

export function verifiesTicketInboxMock() {
  // Covers SUPPORT-M001, SUPPORT-M002, SUPPORT-M003 and SUPPORT-M-R001.
  // Covers SUPPORT-INBOX-R001, SUPPORT-INBOX-R002 and SUPPORT-INBOX-S001.
  return visibleTickets(tickets).map((ticket) => priorityBadge(ticket));
}

export function verifiesReplyDraftMock() {
  // Covers SUPPORT-REPLY-R001 and SUPPORT-REPLY-S001.
  return draftReply("Existing draft", "Updated draft");
}

export function legacyReferenceForWarningState() {
  // Deliberately orphaned so the mock report has an issue state: SUPPORT-INBOX-R999.
  return true;
}
