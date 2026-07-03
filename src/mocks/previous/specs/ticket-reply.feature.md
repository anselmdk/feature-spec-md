---
id: SUPPORT-REPLY
title: Ticket replies
status: draft
model: SUPPORT
test: playwright
screenshots: optional
---

# Ticket replies

## Purpose

Help agents answer a customer without leaving the ticket.

## Rules

- SUPPORT-REPLY-R001: The reply composer MUST preserve unsent text.

## Scenarios

### SUPPORT-REPLY-S001: Agent drafts a reply

Given an agent has selected a ticket
When they write a reply
Then the draft remains visible
