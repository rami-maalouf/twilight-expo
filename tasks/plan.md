# Implementation Plan: Port Aug 11 Twilight dashboard features

## Overview

Port four Swift Twilight features into the fable-5 Expo rewrite: Trend window toggle (7/30), Time timing chart with duration-tinted averages, and Dev-settings demo onboarding. Match Swift behavior mark-for-mark.

## Architecture Decisions

- Keep Skia hand-rolled charts (existing deviation).
- Extract `HistoryRangeChip` shared by Trend / Time / Score / Core cards.
- Reuse onboarding demo UI from settings via a shared presentational component.
- Unit-test timing series math; do not regenerate golden fixtures.

## Task List

### Phase 1: Foundation
- [ ] TimingAveragePoint + timingMovingAverageSeries
- [ ] formatClockTime / formatClockTime24Hour
- [ ] Unit tests

### Phase 2: Cards
- [ ] HistoryRangeChip
- [ ] MovingAverageCard window toggle
- [ ] TimingCard Sleep/Wake/Both + duration tinting
- [ ] AlignmentCard history chip

### Phase 3: Shell
- [ ] Dashboard modes Week|Trend|Time|Score|Core
- [ ] Dev settings Open Onboarding Demo Data

### Phase 4: Ship
- [ ] bun test
- [ ] PR with only swift-rewrite/fable-5 paths
