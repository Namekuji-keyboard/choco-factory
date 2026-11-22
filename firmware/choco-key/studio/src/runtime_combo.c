/*
 * Choco Factory: ZMK Studio から編集できるコンボ
 *
 * ZMK v0.2.1 標準のコンボは devicetree で固定されるため、変更にはファームウェアの再ビルドが必要です。
 * このモジュールはコンボの設定を「キーマップのバインディング」として持ちます。
 *
 *   レイヤー 0 の仮想キー位置 config-first-position + n  : &rt_combo <param1> <param2> (コンボ n の設定)
 *   レイヤー 0 の仮想キー位置 output-first-position + n  : コンボ n が成立したときの動作 (任意のバインディング)
 *
 * どちらも ZMK Studio の set_layer_binding / save_changes でそのまま書き込み・フラッシュ保存できるので、
 * コンボの作成・編集・削除がファームウェアの再ビルドなしで即時に反映されます。
 *
 * 設定のエンコード (どちらのパラメータも 31 bit 以内)
 *   param1: bit n      = キー位置 n (0〜30)
 *   param2: bit 0-10   = キー位置 31〜41
 *           bit 11-20  = 判定時間 (ms)。0 ならこのスロットは未使用
 *           bit 21-25  = 有効なレイヤーグループ (OS / Bluetooth プロファイル。0 = すべて)
 *           bit 26-30  = グループ内の有効なレイヤー (0 = すべて)
 *
 * 動作は ZMK 標準の combo.c と同じ方針です (キーを捕捉し、成立しなければ元の順序で再送)。
 *
 * SPDX-License-Identifier: MIT
 */

#define DT_DRV_COMPAT zmk_behavior_choco_runtime_combos

#include <zephyr/device.h>
#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <string.h>

#include <drivers/behavior.h>
#include <zmk/behavior.h>
#include <zmk/event_manager.h>
#include <zmk/events/position_state_changed.h>
#include <zmk/keymap.h>

LOG_MODULE_DECLARE(zmk, CONFIG_ZMK_LOG_LEVEL);

#if DT_HAS_COMPAT_STATUS_OKAY(DT_DRV_COMPAT)

#define CHOCO_HAS_KEYMAP (!IS_ENABLED(CONFIG_ZMK_SPLIT) || IS_ENABLED(CONFIG_ZMK_SPLIT_ROLE_CENTRAL))

#define CFG_FIRST DT_INST_PROP(0, config_first_position)
#define OUT_FIRST DT_INST_PROP(0, output_first_position)
#define SLOTS DT_INST_PROP(0, slots)
#define PHYSICAL_KEYS DT_INST_PROP(0, physical_keys)
#define LAYERS_PER_GROUP DT_INST_PROP(0, layers_per_group)

BUILD_ASSERT(SLOTS <= 32, "slots must be <= 32");
BUILD_ASSERT(PHYSICAL_KEYS <= 42, "the encoding supports up to 42 physical keys");

#define MAX_PENDING CONFIG_CHOCO_RUNTIME_COMBO_MAX_PENDING
#define MAX_ACTIVE CONFIG_CHOCO_RUNTIME_COMBO_MAX_ACTIVE

/* ---- 設定ビヘイビア &rt_combo (押しても何もしない。パラメータだけを保持する) ---- */

static int rt_combo_init(const struct device *dev) { return 0; }

static int rt_combo_noop(struct zmk_behavior_binding *binding,
                         struct zmk_behavior_binding_event event) {
    return ZMK_BEHAVIOR_OPAQUE;
}

#if IS_ENABLED(CONFIG_ZMK_BEHAVIOR_METADATA)
static const struct behavior_parameter_value_metadata rt_combo_values[] = {
    {
        .display_name = "Value",
        .type = BEHAVIOR_PARAMETER_VALUE_TYPE_RANGE,
        .range = {.min = 0, .max = INT32_MAX},
    },
};

static const struct behavior_parameter_metadata_set rt_combo_param_set[] = {{
    .param1_values = rt_combo_values,
    .param1_values_len = ARRAY_SIZE(rt_combo_values),
    .param2_values = rt_combo_values,
    .param2_values_len = ARRAY_SIZE(rt_combo_values),
}};

static const struct behavior_parameter_metadata rt_combo_metadata = {
    .sets_len = ARRAY_SIZE(rt_combo_param_set),
    .sets = rt_combo_param_set,
};
#endif

static const struct behavior_driver_api rt_combo_driver_api = {
    .binding_pressed = rt_combo_noop,
    .binding_released = rt_combo_noop,
    .locality = BEHAVIOR_LOCALITY_CENTRAL,
#if IS_ENABLED(CONFIG_ZMK_BEHAVIOR_METADATA)
    .parameter_metadata = &rt_combo_metadata,
#endif
};

BEHAVIOR_DT_INST_DEFINE(0, rt_combo_init, NULL, NULL, NULL, POST_KERNEL,
                        CONFIG_KERNEL_INIT_PRIORITY_DEFAULT, &rt_combo_driver_api);

#if CHOCO_HAS_KEYMAP

/* ---- 設定の読み込み ---- */

struct rt_combo {
    uint64_t keys;
    uint8_t key_count;
    uint16_t timeout_ms;
    uint8_t group_mask;
    uint8_t layer_mask;
};

static struct rt_combo combos[SLOTS];

static const char *cfg_behavior_name(void) { return DEVICE_DT_INST_GET(0)->name; }

static void load_config(void) {
    const char *name = cfg_behavior_name();
    for (int n = 0; n < SLOTS; n++) {
        struct rt_combo *c = &combos[n];
        memset(c, 0, sizeof(*c));
        const struct zmk_behavior_binding *b = zmk_keymap_get_layer_binding_at_idx(0, CFG_FIRST + n);
        if (b == NULL || b->behavior_dev == NULL || strcmp(b->behavior_dev, name) != 0) {
            continue;
        }
        uint32_t p1 = b->param1 & 0x7FFFFFFF;
        uint32_t p2 = b->param2 & 0x7FFFFFFF;
        c->keys = (uint64_t)p1 | ((uint64_t)(p2 & 0x7FF) << 31);
        c->keys &= (PHYSICAL_KEYS >= 64) ? UINT64_MAX : ((1ULL << PHYSICAL_KEYS) - 1);
        c->timeout_ms = (p2 >> 11) & 0x3FF;
        c->group_mask = (p2 >> 21) & 0x1F;
        c->layer_mask = (p2 >> 26) & 0x1F;
        for (uint64_t k = c->keys; k; k &= k - 1) {
            c->key_count++;
        }
        if (c->key_count < 2 || c->timeout_ms == 0) {
            c->keys = 0; /* 未使用 */
        }
    }
}

static bool combo_active_on_current_layer(const struct rt_combo *c) {
    uint8_t idx = zmk_keymap_highest_layer_active();
    uint8_t group = idx / LAYERS_PER_GROUP;
    uint8_t layer = idx % LAYERS_PER_GROUP;
    if (c->group_mask && (group >= 5 || !(c->group_mask & BIT(group)))) {
        return false;
    }
    if (c->layer_mask && !(c->layer_mask & BIT(layer))) {
        return false;
    }
    return true;
}

/* ---- 判定 ---- */

static struct zmk_position_state_changed_event pending[MAX_PENDING];
static int pending_count;
static uint64_t pending_keys;
static uint32_t candidates; /* bit n = スロット n が候補 */
static int fully_pressed = -1;
static int64_t timeout_at;
static struct k_work_delayable timeout_work;

struct active_combo {
    int slot; /* -1 = 空き */
    uint64_t held_keys;
    bool output_released;
};
static struct active_combo active[MAX_ACTIVE];

static void press_output(int slot, int64_t timestamp) {
    zmk_keymap_position_state_changed(ZMK_POSITION_STATE_CHANGE_SOURCE_LOCAL, OUT_FIRST + slot, true,
                                      timestamp);
}

static void release_output(int slot, int64_t timestamp) {
    zmk_keymap_position_state_changed(ZMK_POSITION_STATE_CHANGE_SOURCE_LOCAL, OUT_FIRST + slot,
                                      false, timestamp);
}

/* 捕捉していたキーを元の順序で後段 (ホールドタップ・キーマップなど) に流す */
static int release_pending(void) {
    int count = pending_count;
    pending_count = 0;
    pending_keys = 0;
    for (int i = 0; i < count; i++) {
        if (i == 0) {
            ZMK_EVENT_RELEASE(pending[i]);
        } else {
            ZMK_EVENT_RAISE(pending[i]);
        }
    }
    return count;
}

static void activate(int slot) {
    for (int i = 0; i < MAX_ACTIVE; i++) {
        if (active[i].slot >= 0) {
            continue;
        }
        active[i].slot = slot;
        active[i].held_keys = combos[slot].keys;
        active[i].output_released = false;
        int64_t ts = pending[0].data.timestamp;
        /* コンボのキーは消費し、それ以外 (後から押された無関係なキー) は残して後で流す */
        int kept = 0;
        for (int j = 0; j < pending_count; j++) {
            if (!(combos[slot].keys & (1ULL << pending[j].data.position))) {
                pending[kept++] = pending[j];
            }
        }
        pending_count = kept;
        pending_keys = 0;
        for (int j = 0; j < kept; j++) {
            pending_keys |= 1ULL << pending[j].data.position;
        }
        press_output(slot, ts);
        release_pending();
        return;
    }
    LOG_WRN("runtime combo: too many active combos");
    release_pending();
}

/* 判定を終える: 成立していれば発動、そうでなければ捕捉したキーを流す。流したキー数を返す */
static int cleanup(void) {
    k_work_cancel_delayable(&timeout_work);
    timeout_at = 0;
    candidates = 0;
    if (fully_pressed >= 0) {
        int slot = fully_pressed;
        int before = pending_count;
        fully_pressed = -1;
        activate(slot);
        /* activate() が流したキーの数 = 捕捉数 - コンボのキー数 */
        return before - combos[slot].key_count;
    }
    return release_pending();
}

static void timeout_handler(struct k_work *work) {
    if (timeout_at == 0 || k_uptime_get() < timeout_at) {
        return;
    }
    cleanup();
}

static int on_key_down(const struct zmk_position_state_changed *ev) {
    uint64_t bit = 1ULL << ev->position;

    if (pending_count == 0) {
        load_config();
        candidates = 0;
        uint16_t min_timeout = UINT16_MAX;
        for (int n = 0; n < SLOTS; n++) {
            if ((combos[n].keys & bit) && combo_active_on_current_layer(&combos[n])) {
                candidates |= BIT(n);
                min_timeout = MIN(min_timeout, combos[n].timeout_ms);
            }
        }
        if (!candidates) {
            return ZMK_EV_EVENT_BUBBLE;
        }
        timeout_at = ev->timestamp + min_timeout;
        k_work_schedule(&timeout_work, K_MSEC(MAX(1, timeout_at - k_uptime_get())));
    } else {
        for (int n = 0; n < SLOTS; n++) {
            if ((candidates & BIT(n)) && !(combos[n].keys & bit)) {
                candidates &= ~BIT(n);
            }
        }
    }

    if (pending_count >= MAX_PENDING) {
        cleanup();
        return ZMK_EV_EVENT_BUBBLE;
    }
    pending[pending_count++] = copy_raised_zmk_position_state_changed(ev);
    pending_keys |= bit;

    if (!candidates) {
        /* どのコンボにも当てはまらない: 成立済みのコンボがあれば発動し、残りのキー (このキーを含む) を流す */
        cleanup();
        return ZMK_EV_EVENT_CAPTURED;
    }

    int remaining = 0;
    for (int n = 0; n < SLOTS; n++) {
        if (!(candidates & BIT(n))) {
            continue;
        }
        remaining++;
        if (combos[n].keys == pending_keys) {
            fully_pressed = n;
        }
    }
    if (fully_pressed >= 0 && remaining == 1) {
        cleanup(); /* 発動 */
    }
    return ZMK_EV_EVENT_CAPTURED;
}

static int on_key_up(const struct zmk_position_state_changed *ev) {
    uint64_t bit = 1ULL << ev->position;
    int released = cleanup();

    for (int i = 0; i < MAX_ACTIVE; i++) {
        struct active_combo *a = &active[i];
        if (a->slot < 0 || !(a->held_keys & bit)) {
            continue;
        }
        a->held_keys &= ~bit;
        if (!a->output_released) {
            /* コンボのキーを 1 つでも離したら出力を離す (ZMK 標準と同じ) */
            a->output_released = true;
            release_output(a->slot, ev->timestamp);
        }
        if (!a->held_keys) {
            a->slot = -1;
        }
        return ZMK_EV_EVENT_HANDLED;
    }

    if (released > 1) {
        /* 2 個目以降の押下は再送したので、離す順序も保つため再送する */
        struct zmk_position_state_changed_event dupe = copy_raised_zmk_position_state_changed(ev);
        ZMK_EVENT_RAISE(dupe);
        return ZMK_EV_EVENT_CAPTURED;
    }
    return ZMK_EV_EVENT_BUBBLE;
}

static int rt_combo_listener(const zmk_event_t *eh) {
    const struct zmk_position_state_changed *ev = as_zmk_position_state_changed(eh);
    if (ev == NULL || ev->position >= PHYSICAL_KEYS) {
        return ZMK_EV_EVENT_BUBBLE;
    }
    return ev->state ? on_key_down(ev) : on_key_up(ev);
}

ZMK_LISTENER(choco_runtime_combo, rt_combo_listener);
ZMK_SUBSCRIPTION(choco_runtime_combo, zmk_position_state_changed);

static int rt_combo_sys_init(void) {
    k_work_init_delayable(&timeout_work, timeout_handler);
    for (int i = 0; i < MAX_ACTIVE; i++) {
        active[i].slot = -1;
    }
    return 0;
}

SYS_INIT(rt_combo_sys_init, APPLICATION, CONFIG_KERNEL_INIT_PRIORITY_DEFAULT);

#endif /* CHOCO_HAS_KEYMAP */
#endif /* DT_HAS_COMPAT_STATUS_OKAY */
