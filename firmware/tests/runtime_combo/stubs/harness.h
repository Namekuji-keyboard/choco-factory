/* ZMK / Zephyr の最小限のスタブ (runtime_combo.c をホスト PC でテストするため) */
#pragma once
#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include <limits.h>

#define CONFIG_ZMK_SPLIT 1
#define CONFIG_ZMK_SPLIT_ROLE_CENTRAL 1
#define CONFIG_ZMK_BEHAVIOR_METADATA 0
#define CONFIG_KERNEL_INIT_PRIORITY_DEFAULT 0
#define CONFIG_CHOCO_RUNTIME_COMBO_MAX_PENDING 4
#define CONFIG_CHOCO_RUNTIME_COMBO_MAX_ACTIVE 4
#define CONFIG_ZMK_LOG_LEVEL 0
#define IS_ENABLED(x) (x)

#define DT_HAS_COMPAT_STATUS_OKAY(x) 1
#define DT_INST_PROP(inst, prop) DTP_##prop
#define DTP_config_first_position 94
#define DTP_output_first_position 110
#define DTP_slots 16
#define DTP_physical_keys 42
#define DTP_layers_per_group 5

#define BUILD_ASSERT(c, m) _Static_assert(c, m)
#define BIT(n) (1UL << (n))
#define MIN(a, b) ((a) < (b) ? (a) : (b))
#define MAX(a, b) ((a) > (b) ? (a) : (b))
#define ARRAY_SIZE(a) (sizeof(a) / sizeof((a)[0]))
#define LOG_MODULE_DECLARE(...)
#define LOG_DBG(...)
#define LOG_WRN(...)
#define APPLICATION 0
#define POST_KERNEL 0

struct device { const char *name; };
struct k_work { int dummy; };
struct k_work_delayable { void (*handler)(struct k_work *); int64_t due; bool scheduled; struct k_work work; };
#define K_MSEC(ms) (ms)
int64_t k_uptime_get(void);
void k_work_init_delayable(struct k_work_delayable *w, void (*h)(struct k_work *));
int k_work_schedule(struct k_work_delayable *w, int64_t ms);
int k_work_cancel_delayable(struct k_work_delayable *w);

struct zmk_behavior_binding { const char *behavior_dev; uint32_t param1; uint32_t param2; };
struct zmk_behavior_binding_event { int layer; uint32_t position; int64_t timestamp; uint8_t source; };
#define ZMK_BEHAVIOR_OPAQUE 0
enum { BEHAVIOR_LOCALITY_CENTRAL };
struct behavior_driver_api {
    int (*binding_pressed)(struct zmk_behavior_binding *, struct zmk_behavior_binding_event);
    int (*binding_released)(struct zmk_behavior_binding *, struct zmk_behavior_binding_event);
    int locality;
};
#define BEHAVIOR_DT_INST_DEFINE(inst, init, pm, data, cfg, lvl, prio, api) \
    const struct device rt_combo_dev = {.name = "rt_combo"};
extern const struct device rt_combo_dev;
#define DEVICE_DT_INST_GET(inst) (&rt_combo_dev)

typedef struct { int id; } zmk_event_t;
#define ZMK_EV_EVENT_BUBBLE 0
#define ZMK_EV_EVENT_HANDLED 1
#define ZMK_EV_EVENT_CAPTURED 2
#define ZMK_POSITION_STATE_CHANGE_SOURCE_LOCAL 255
struct zmk_position_state_changed { uint8_t source; uint32_t position; bool state; int64_t timestamp; };
struct zmk_position_state_changed_event { zmk_event_t header; struct zmk_position_state_changed data; };
struct zmk_position_state_changed_event copy_raised_zmk_position_state_changed(const struct zmk_position_state_changed *ev);
const struct zmk_position_state_changed *as_zmk_position_state_changed(const zmk_event_t *eh);
void harness_release(struct zmk_position_state_changed_event *ev);
void harness_raise(struct zmk_position_state_changed_event *ev);
#define ZMK_EVENT_RELEASE(ev) harness_release(&(ev))
#define ZMK_EVENT_RAISE(ev) harness_raise(&(ev))
#define ZMK_LISTENER(mod, cb) int (*harness_listener)(const zmk_event_t *) = cb;
#define ZMK_SUBSCRIPTION(mod, ev)
#define SYS_INIT(fn, lvl, prio) int (*harness_sys_init)(void) = fn;

const struct zmk_behavior_binding *zmk_keymap_get_layer_binding_at_idx(uint8_t layer, uint8_t idx);
uint8_t zmk_keymap_highest_layer_active(void);
int zmk_keymap_position_state_changed(uint8_t source, uint32_t position, bool pressed, int64_t ts);
