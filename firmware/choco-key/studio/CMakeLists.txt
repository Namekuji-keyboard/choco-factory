# Choco Factory: ZMK Studio からエンコーダー・マクロ・コンボを即時変更するためのビヘイビア
target_sources_ifdef(CONFIG_CHOCO_BEHAVIOR_VKEY app PRIVATE src/behavior_vkey.c)
target_sources_ifdef(CONFIG_CHOCO_RUNTIME_COMBO app PRIVATE src/runtime_combo.c)
