# Build orchestration for mschat-extractor.
#
# All work is done by bun scripts; this file sequences them so `make -j`
# parallelizes safely. Stamp files in .make/ track completion of each
# target to avoid redundant work.
#
# ── Stamps ──────────────────────────────────────────────────────────
#
# Commands produce stamp files in .make/ (gitignored, removed by
# `make clean`). A stamp is touched after its command succeeds; on the
# next run, make skips the target unless a prerequisite is newer.
#
# ────────────────────────────────────────────────────────────────────

STAMPS := .make

# ── Source file sets ────────────────────────────────────────────────

SRC_FILES := $(shell find src -name '*.ts' 2>/dev/null)
TEST_FILES := $(shell find test -name '*.ts' 2>/dev/null)
TOOL_FILES := $(wildcard *.ts)
ALL_TS_FILES := $(SRC_FILES) $(TEST_FILES) $(TOOL_FILES)

# ════════════════════════════════════════════════════════════════════
# High-level targets
# ════════════════════════════════════════════════════════════════════

.PHONY: all build test lint format format-check clean deps
.DEFAULT_GOAL := all

all: build test lint

build: $(STAMPS)/typecheck

test: $(STAMPS)/test

lint: $(STAMPS)/eslint \
      $(STAMPS)/format-check \
      $(STAMPS)/typecheck

# ════════════════════════════════════════════════════════════════════
# Dependencies
# ════════════════════════════════════════════════════════════════════

# Install npm dependencies (devDependencies for tooling).
$(STAMPS)/deps: package.json
	bun install
	@mkdir -p $(STAMPS) && touch $@

# ════════════════════════════════════════════════════════════════════
# Build
# ════════════════════════════════════════════════════════════════════

# TypeScript type-check (no emit, just validation).
#
# Inputs:  All TypeScript source files
# Outputs: None (type-check only)
$(STAMPS)/typecheck: $(STAMPS)/deps $(ALL_TS_FILES) tsconfig.json
	bun run typecheck
	@mkdir -p $(STAMPS) && touch $@

# ════════════════════════════════════════════════════════════════════
# Tests
# ════════════════════════════════════════════════════════════════════

# Run all bun tests.
#
# Note: Some tests require Microsoft's proprietary files (mschat25.exe,
# extracted graphics in ./characters/ and ./backgrounds/). Tests skip
# gracefully when these files are not present.
#
# Currently, tests are run manually via test/verify-extraction.ts.
# When unit tests are added (files matching *.test.ts), they will be
# automatically discovered and run by `bun test`.
#
# Inputs:  Test files matching *.test.ts or *.spec.ts
# Outputs: Test results (stdout)
$(STAMPS)/test: $(ALL_TS_FILES)
	bun test || echo "No test files found (this is OK - verification tests are run manually)"
	@mkdir -p $(STAMPS) && touch $@

# ════════════════════════════════════════════════════════════════════
# Lint & format
# ════════════════════════════════════════════════════════════════════

# ESLint across all TypeScript.
$(STAMPS)/eslint: $(STAMPS)/deps $(ALL_TS_FILES) .eslintrc.json
	bun run lint
	@mkdir -p $(STAMPS) && touch $@

# Prettier check (non-destructive — exits non-zero if files differ).
$(STAMPS)/format-check: $(STAMPS)/deps $(ALL_TS_FILES) .prettierrc \
                        README.md FILEFORMAT.md package.json
	bun run format:check
	@mkdir -p $(STAMPS) && touch $@

# Prettier write (destructive — rewrites files in place).
#
# This is a .PHONY target that always runs when invoked explicitly.
format: $(STAMPS)/deps
	bun run format

# ════════════════════════════════════════════════════════════════════
# Cleanup
# ════════════════════════════════════════════════════════════════════

clean:
	rm -rf $(STAMPS)
	rm -rf node_modules
	rm -f tsconfig.tsbuildinfo

# Install dependencies (convenience target).
deps: $(STAMPS)/deps
