export type Ticket = {
  id: string;
  title: string;
  status: "open" | "closed";
  priority: "low" | "normal" | "high";
  createdAt: string;
};

export function visibleTickets(tickets: Ticket[]) {
  return tickets
    .filter((ticket) => ticket.status === "open")
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

export function draftReply(existingDraft: string, nextText: string) {
  return nextText.trim() ? nextText : existingDraft;
}
