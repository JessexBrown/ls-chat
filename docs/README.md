# Documentation Index

Last updated: 2026-06-11

This folder contains the product, setup, demo, and production-readiness notes for Market Bubble Live Chat.

## Start Here

- `marketbubble-live-hub.md` - product vision, user surfaces, current implementation, and open questions.
- `stakeholder-setup-guide.md` - practical handoff for credentials, Render, source configuration, and embeds.
- `demo-runbook.md` - step-by-step stakeholder demo script.
- `production-readiness-checklist.md` - QA checklist and launch-hardening gaps.

## Setup And Deployment

- `render-deployment.md` - Render Web Service deployment checklist.
- `real-chat-setup.md` - Twitch, Kick, and X setup details.
- `kick-webhook-hosting.md` - public webhook URL guidance for Kick.
- `website-embed-install.md` - iframe installation notes for Market Bubble or partner pages.
- `x-live-capture.md` - X broadcast livechat capture workaround and operating expectations.

## Product And Architecture

- `application-scope.md` - application scope, assumptions, and expectations.
- `development-roadmap.md` - phased roadmap from MVP through production.
- `integration-contract.md` - shared message contract and ingress endpoints.
- `admin-native-user-website-readiness.md` - admin, native user, and website-readiness planning.

## Reviewer Notes

The most important distinction for reviewers is that Twitch and Kick are server-side integrations, while X broadcast livechat currently relies on an operator-side capture agent. Public viewers should only use `/live`, `/embed`, or `/embed?view=chat`; they should not need X tabs, extensions, OAuth flows, or admin tooling.

For launch planning, treat the native Market Bubble chat as functional but not fully production-hardened until identity, moderation, rate limiting, and analytics are backed by durable storage.
