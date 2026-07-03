---
id: SUPPORT-INBOX
title: Ticket inbox
status: active
model: SUPPORT
test: playwright
screenshots: optional
---

# Ticket inbox

## Purpose

Let agents find the next ticket to work on without losing context.

## Rules

- SUPPORT-INBOX-R001: The inbox MUST show open tickets first.

## Scenarios

### SUPPORT-INBOX-S001: Agent reviews the queue

Given an agent has open tickets
When they open the inbox
Then open tickets are listed by age
