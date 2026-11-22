#!/bin/sh
# 使い方: firmware/tests/runtime_combo/run.sh (gcc が必要)
set -e
cd "$(dirname "$0")"
SRC="${SRC:-../../choco-key/studio/src/runtime_combo.c}"
gcc -std=c11 -Wall -Wno-unused-function -Istubs -o /tmp/test_runtime_combo test_runtime_combo.c "$SRC"
/tmp/test_runtime_combo
