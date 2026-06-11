---
id: ACCOUNT
title: Account access
status: draft
---

# Account access

## Purpose

People can access their account after completing the required flow.

## Rules

- ACCOUNT-R001: A person MUST complete the required flow before account access is granted.
- ACCOUNT-R002: The system MUST NOT expose internal details in user-facing messages.
- ACCOUNT-R003: A returning person SHOULD be sent back to the page they originally requested.

## Scenarios

### ACCOUNT-S001: Returning person completes access flow

Given a returning person is on the access page  
When they complete the required flow  
Then account access is granted  
And they are sent back to the page they originally requested

### ACCOUNT-S002: Unknown input receives a neutral response

Given a person enters input that does not match a known account  
When they request access  
Then the response is neutral  
And the response does not expose internal details
