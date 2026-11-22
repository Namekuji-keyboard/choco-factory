/*
 * Choco Factory: virtual key behavior
 *
 * &vkey <position> を押すと、現在有効なレイヤーの <position> (物理キーの無い仮想キー位置) の
 * 割り当てを押したことにします。仮想キー位置の割り当ては通常のキーと同じく ZMK Studio で
 * 変更・フラッシュ保存できるため、エンコーダーやマクロの中身をファームウェアの再ビルドなしで変えられます。
 *
 * SPDX-License-Identifier: MIT
 */

#define DT_DRV_COMPAT zmk_behavior_choco_vkey

#include <zephyr/device.h>
#include <zephyr/logging/log.h>
#include <drivers/behavior.h>

#include <zmk/behavior.h>
#include <zmk/keymap.h>
#include <zmk/events/position_state_changed.h>

LOG_MODULE_DECLARE(zmk, CONFIG_ZMK_LOG_LEVEL);

#if DT_HAS_COMPAT_STATUS_OKAY(DT_DRV_COMPAT)

/* キーマップはセントラル (分割しない場合は本体) にしか無い */
#define CHOCO_HAS_KEYMAP (!IS_ENABLED(CONFIG_ZMK_SPLIT) || IS_ENABLED(CONFIG_ZMK_SPLIT_ROLE_CENTRAL))

static int vkey_init(const struct device *dev) { return 0; }

static int vkey_pressed(struct zmk_behavior_binding *binding, struct zmk_behavior_binding_event event) {
#if CHOCO_HAS_KEYMAP
    LOG_DBG("vkey press %d", binding->param1);
    zmk_keymap_position_state_changed(ZMK_POSITION_STATE_CHANGE_SOURCE_LOCAL, binding->param1, true,
                                      event.timestamp);
#endif
    return ZMK_BEHAVIOR_OPAQUE;
}

static int vkey_released(struct zmk_behavior_binding *binding,
                         struct zmk_behavior_binding_event event) {
#if CHOCO_HAS_KEYMAP
    LOG_DBG("vkey release %d", binding->param1);
    zmk_keymap_position_state_changed(ZMK_POSITION_STATE_CHANGE_SOURCE_LOCAL, binding->param1, false,
                                      event.timestamp);
#endif
    return ZMK_BEHAVIOR_OPAQUE;
}

#if IS_ENABLED(CONFIG_ZMK_BEHAVIOR_METADATA)
static const struct behavior_parameter_value_metadata vkey_param_values[] = {
    {
        .display_name = "Position",
        .type = BEHAVIOR_PARAMETER_VALUE_TYPE_RANGE,
        .range = {.min = 0, .max = 255},
    },
};

static const struct behavior_parameter_metadata_set vkey_param_set[] = {{
    .param1_values = vkey_param_values,
    .param1_values_len = ARRAY_SIZE(vkey_param_values),
}};

static const struct behavior_parameter_metadata vkey_metadata = {
    .sets_len = ARRAY_SIZE(vkey_param_set),
    .sets = vkey_param_set,
};
#endif

static const struct behavior_driver_api vkey_driver_api = {
    .binding_pressed = vkey_pressed,
    .binding_released = vkey_released,
    .locality = BEHAVIOR_LOCALITY_CENTRAL,
#if IS_ENABLED(CONFIG_ZMK_BEHAVIOR_METADATA)
    .parameter_metadata = &vkey_metadata,
#endif
};

#define VKEY_INST(n)                                                                               \
    BEHAVIOR_DT_INST_DEFINE(n, vkey_init, NULL, NULL, NULL, POST_KERNEL,                           \
                            CONFIG_KERNEL_INIT_PRIORITY_DEFAULT, &vkey_driver_api);

DT_INST_FOREACH_STATUS_OKAY(VKEY_INST)

#endif
