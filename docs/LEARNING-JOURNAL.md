# CloudOps Command Center Learning Journal

This journal records the commands, decisions, errors, fixes and lessons from improving CloudOps Command Center.

## Session 1 — Baseline and dependency investigation
**Date:** 18 July 2026
**Branch:** `codex/external-findings-v1`
### Goal

Establish whether the original application is healthy before changing its code.

## Commands used
### Clone the repository

```bash
git clone https://github.com/AZ1600/cloudops-command-center.git

### Verify package identity

```bash
node -p "require('./package.json').name"
node -p "require('./package-lock.json').name"

## Exercise 8: Reconcile the lockfile

Run:

```bash
npm install --package-lock-only --ignore-scripts

## Correcting stale lockfile metadata

### Search for the old project name

```bash
rg -n '"name": "opspilot-saas"' package-lock.json

## PostCSS exposure investigation

```bash
grep -RInE 'dangerouslySetInnerHTML|postcss|<style' app lib