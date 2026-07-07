---
id: SUPPORT-REPLY
title: Ticket replies
status: active
model: SUPPORT
test: playwright
screenshots: optional
---

# Ticket replies

## Purpose

Help agents answer a customer without leaving the ticket.

## Rules

- SUPPORT-REPLY-R001: The reply composer MUST preserve unsent text.
- SUPPORT-REPLY-R002: Saved replies SHOULD be reusable across tickets.

## Scenarios

### SUPPORT-REPLY-S001: Agent drafts a reply

```
Given an agent has selected a ticket
When they write a reply
Then the draft remains visible
```

### SUPPORT-REPLY-S002: Agent sends a saved reply

```
Given an agent has selected a ticket
When they choose a saved reply
Then the composer is filled with reusable text
```
